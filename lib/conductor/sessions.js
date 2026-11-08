// lib/conductor/sessions.js
//
// Reads `claude agents --json --all` and classifies each session. Read-only.
//
//   working  state "working"
//   blocked  state "blocked"  (waiting on CC)
//   done     state "done"
//   unknown  any other value, or none. Kept visible with its raw state and never
//            treated as done.
//
// Live process (BOB-185). `claude agents --json --all` keeps a session that was ended
// earlier in the list as state `done` with no `pid`. A session is `live`
// only when it carries a pid (a positive integer). A `done` session that is not live
// is already stopped: there is nothing for the reaper to end and it is not counted as
// a live lane.

import fs from 'fs';
import path from 'path';
import { run as defaultRun } from './exec.js';

const KNOWN_STATES = ['working', 'blocked', 'done'];
const SUCCESSOR_RE = /bg ([0-9a-f]+)/;

/** Raw session list from claude. Throws on a failed command or bad JSON. */
export function readAgents({ run = defaultRun } = {}) {
  const out = run('claude', ['agents', '--json', '--all']);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    throw new Error(`\`claude agents --json --all\` returned unparseable JSON: ${e.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('`claude agents --json --all` did not return a JSON array');
  }
  for (const s of parsed) {
    // Interactive sessions carry a sessionId but no short background id.
    if (!s || typeof s !== 'object' || typeof s.sessionId !== 'string' || ('id' in s && typeof s.id !== 'string')) {
      throw new Error('`claude agents --json --all` returned an entry without a string "sessionId"');
    }
  }
  return parsed;
}

/** Successor bg id from a handoff marker file, or null when the marker has none. */
export function readHandoffMarker(hookStateDir, sessionId) {
  const file = path.join(hookStateDir, `${sessionId}.handoff`);
  if (!fs.existsSync(file)) return null;
  const match = SUCCESSOR_RE.exec(fs.readFileSync(file, 'utf8'));
  return { file, successor: match ? match[1] : null };
}

function classifyState(raw) {
  return KNOWN_STATES.includes(raw) ? raw : 'unknown';
}

/**
 * Normalise raw sessions into lane records. `now` (ms epoch) is injected so ages
 * are testable.
 */
export function classifySessions(rawSessions, { hookStateDir, now = Date.now() }) {
  if (!fs.existsSync(hookStateDir) || !fs.statSync(hookStateDir).isDirectory()) {
    throw new Error(`hook_state_dir ${hookStateDir} is not a directory`);
  }
  const base = rawSessions.map(s => ({
    id: s.id ?? null,
    session_id: s.sessionId,
    name: typeof s.name === 'string' ? s.name : null,
    kind: s.kind ?? null,
    live: Number.isInteger(s.pid) && s.pid > 0,
    cwd: s.cwd ?? null,
    state: classifyState(s.state),
    raw_state: s.state ?? null,
    waiting_for: s.waitingFor ?? null,
    started_at: Number.isFinite(s.startedAt) ? new Date(s.startedAt).toISOString() : null,
    age_ms: Number.isFinite(s.startedAt) ? Math.max(0, now - s.startedAt) : null,
  }));
  const live = new Map(base.filter(s => s.id).map(s => [s.id, s.state]));
  return base.map(s => {
    const marker = readHandoffMarker(hookStateDir, s.session_id);
    const successor = marker ? marker.successor : null;
    const successorState = successor ? live.get(successor) : undefined;
    return {
      ...s,
      handed_off: marker !== null,
      successor,
      successor_live: successorState === 'working' || successorState === 'blocked',
    };
  });
}

/**
 * Group lane records: working, waiting_on_cc (blocked), done (finished, process still
 * live), stopped (done, no live process: already ended), unknown.
 */
export function groupSessions(sessions) {
  return {
    working: sessions.filter(s => s.state === 'working'),
    waiting_on_cc: sessions.filter(s => s.state === 'blocked'),
    done: sessions.filter(s => s.state === 'done' && s.live),
    stopped: sessions.filter(s => s.state === 'done' && !s.live),
    unknown: sessions.filter(s => s.state === 'unknown'),
  };
}
