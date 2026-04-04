// lib/session.js
import fs from 'fs';
import path from 'path';

/**
 * Get the active session ID from the environment.
 * Returns null if not inside a session.
 */
export function getSessionId() {
  return process.env.BOBBY_SESSION_ID || null;
}

/**
 * Get the sessions directory, resolving from config or default.
 */
export function getSessionsDir(root, config) {
  return path.join(root, config.sessions_dir || '.bobby/sessions');
}

/**
 * Initialize a new session. Creates the session file and writes a session_start entry.
 * Returns the session ID.
 */
export function initSession(sessionsDir, { ticketIds = [], agent = '', pipeline = '' } = {}) {
  const now = new Date();
  const ts = now.toISOString();
  const pad = (n) => String(n).padStart(2, '0');
  const id = `ses-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  fs.mkdirSync(sessionsDir, { recursive: true });

  logEntry(sessionsDir, id, {
    type: 'session_start',
    tickets: Array.isArray(ticketIds) ? ticketIds : [ticketIds],
    agent,
    pipeline,
  });

  return id;
}

/**
 * Append a single log entry to a session file.
 */
export function logEntry(sessionsDir, sessionId, entry) {
  const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
  const line = JSON.stringify({ ts: new Date().toISOString(), session: sessionId, ...entry });
  fs.appendFileSync(filePath, line + '\n', 'utf8');
}

/**
 * Try to log an entry for the current session (from env).
 * No-op if not inside a session or if the sessions dir doesn't exist.
 */
export function tryLogEntry(root, config, entry) {
  const sessionId = getSessionId();
  if (!sessionId) return;
  const sessionsDir = getSessionsDir(root, config);
  try {
    logEntry(sessionsDir, sessionId, entry);
  } catch {
    // Silently ignore — logging should never break commands
  }
}

/**
 * Read all entries from a session log file.
 */
export function readSession(sessionsDir, sessionId) {
  const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  return lines.filter(Boolean).map(line => JSON.parse(line));
}

/**
 * List all sessions, newest first. Returns summary metadata for each.
 */
export function listSessions(sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return [];

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();

  return files.map(file => {
    const sessionId = file.replace('.jsonl', '');
    const entries = readSession(sessionsDir, sessionId);
    const start = entries[0];
    const last = entries[entries.length - 1];

    const startTime = start ? new Date(start.ts) : null;
    const endTime = last ? new Date(last.ts) : null;
    const durationMs = startTime && endTime ? endTime - startTime : 0;

    return {
      id: sessionId,
      file,
      tickets: start?.tickets || [],
      agent: start?.agent || '',
      pipeline: start?.pipeline || '',
      events: entries.length,
      startTime,
      durationMs,
      durationLabel: formatDuration(durationMs),
    };
  });
}

/**
 * Compute aggregate stats for a session.
 */
export function sessionSummary(sessionsDir, sessionId) {
  const entries = readSession(sessionsDir, sessionId);
  if (entries.length === 0) return null;

  const start = entries[0];
  const last = entries[entries.length - 1];
  const durationMs = new Date(last.ts) - new Date(start.ts);

  const moves = entries.filter(e => e.type === 'move');
  const rejections = entries.filter(e => e.type === 'move' && e.detail?.startsWith('REJECTED'));
  const blocks = entries.filter(e => e.type === 'move' && e.to === 'blocked');
  const assigns = entries.filter(e => e.type === 'assign');
  const creates = entries.filter(e => e.type === 'create');
  const comments = entries.filter(e => e.type === 'comment');

  // Time per stage: track duration between consecutive moves per ticket
  const stageTimings = {};
  const lastMoveByTicket = {};
  for (const entry of moves) {
    const ticket = entry.ticket;
    if (lastMoveByTicket[ticket]) {
      const prev = lastMoveByTicket[ticket];
      const stage = prev.to;
      const elapsed = new Date(entry.ts) - new Date(prev.ts);
      if (!stageTimings[stage]) stageTimings[stage] = [];
      stageTimings[stage].push(elapsed);
    }
    lastMoveByTicket[ticket] = entry;
  }

  const avgTimePerStage = {};
  for (const [stage, times] of Object.entries(stageTimings)) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    avgTimePerStage[stage] = { avg, label: formatDuration(avg), count: times.length };
  }

  // Rejection reasons
  const rejectionReasons = {};
  for (const r of rejections) {
    const reason = r.detail?.replace('REJECTED: ', '') || 'unknown';
    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
  }

  return {
    sessionId,
    tickets: start.tickets || [],
    agent: start.agent || '',
    pipeline: start.pipeline || '',
    durationMs,
    durationLabel: formatDuration(durationMs),
    totalEvents: entries.length,
    moves: moves.length,
    rejections: rejections.length,
    rejectionReasons,
    blocks: blocks.length,
    assigns: assigns.length,
    creates: creates.length,
    comments: comments.length,
    avgTimePerStage,
  };
}

function formatDuration(ms) {
  if (ms < 1000) return '0s';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}
