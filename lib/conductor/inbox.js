// lib/conductor/inbox.js
//
// File inbox: session-to-session messages that do not depend on a permission mode.
//
//   <studio>/.bobby/conductor/inbox/<sessionId>.jsonl   one JSON message per line, append-only
//   <studio>/.bobby/conductor/inbox/<sessionId>.cursor  number of lines already delivered
//
// Nothing is ever removed or rewritten except the cursor, which is replaced whole.
// A missing inbox directory, an unreadable line or a cursor past the end of the file
// is an Error that says which; none of it is guessed around.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const INBOX_SUBDIR = path.join('.bobby', 'conductor', 'inbox');
const REQUIRED_FIELDS = ['id', 'ts', 'from', 'to', 'text'];

export function inboxDir(studioRoot) {
  return path.join(studioRoot, INBOX_SUBDIR);
}

function messageFile(dir, sessionId) {
  return path.join(dir, `${sessionId}.jsonl`);
}

function cursorFile(dir, sessionId) {
  return path.join(dir, `${sessionId}.cursor`);
}

/** The inbox directory must already exist; it is never created implicitly. */
export function assertInboxDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Inbox directory ${dir} does not exist. Create it with \`mkdir -p ${dir}\`.`);
  }
}

function describe(s) {
  return `${s.name ?? '(no name)'}  ${s.session_id ?? s.sessionId}  ${s.id ? `bg ${s.id}  ` : ''}${s.state ?? s.status ?? ''}`.trimEnd();
}

/**
 * The one session `query` names. It matches a full sessionId, a short background id,
 * or an exact session name. Zero or several matches is an Error that lists them.
 */
export function resolveRecipient(rawSessions, query) {
  const q = String(query ?? '').trim();
  if (!q) throw new Error('send needs a session name or id');
  const byId = rawSessions.filter(s => s.sessionId === q || (s.id && s.id === q));
  const matches = byId.length ? byId : rawSessions.filter(s => s.name === q);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    const names = rawSessions.map(s => `  ${describe(s)}`).join('\n');
    throw new Error(`No session matches "${q}". Sessions:\n${names}`);
  }
  throw new Error(`"${q}" matches ${matches.length} sessions; pass a sessionId instead:\n${matches.map(s => `  ${describe(s)}`).join('\n')}`);
}

export function buildMessage({ from, to, text, now = Date.now() }) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Message text is empty');
  if (typeof from !== 'string' || !from.trim()) throw new Error('Message needs a sender (--from)');
  if (typeof to !== 'string' || !to.trim()) throw new Error('Message needs a recipient sessionId');
  return { id: crypto.randomUUID(), ts: new Date(now).toISOString(), from, to, text };
}

/**
 * Append one message as one complete line. The file is opened O_APPEND and the line
 * goes out in a single write, so concurrent senders each land a whole line.
 */
export function appendMessage(dir, message) {
  assertInboxDir(dir);
  for (const f of REQUIRED_FIELDS) {
    if (typeof message[f] !== 'string' || !message[f].trim()) throw new Error(`Message field "${f}" is missing`);
  }
  const file = messageFile(dir, message.to);
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, `${JSON.stringify(message)}\n`);
  } finally {
    fs.closeSync(fd);
  }
  return file;
}

/** All messages for a session, in order. A line that is not a valid message is an Error naming it. */
export function readMessages(dir, sessionId) {
  const file = messageFile(dir, sessionId);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  if (raw === '') return [];
  if (!raw.endsWith('\n')) throw new Error(`${file}: line ${raw.split('\n').length} is incomplete (no trailing newline)`);
  return raw.slice(0, -1).split('\n').map((line, i) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      throw new Error(`${file}: line ${i + 1} is not valid JSON (${e.message})`);
    }
    for (const f of REQUIRED_FIELDS) {
      if (!msg || typeof msg[f] !== 'string' || !msg[f].trim()) {
        throw new Error(`${file}: line ${i + 1} has no "${f}"`);
      }
    }
    return msg;
  });
}

/** Delivered line count for a session; no cursor file means nothing delivered yet. */
export function readCursor(dir, sessionId) {
  const file = cursorFile(dir, sessionId);
  if (!fs.existsSync(file)) return 0;
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!/^\d+$/.test(text)) throw new Error(`${file}: cursor must be a line count, found "${text}"`);
  return Number(text);
}

/** Replace the cursor whole (write a temp file, move it into place). The message file is not touched. */
export function writeCursor(dir, sessionId, count) {
  assertInboxDir(dir);
  if (!Number.isInteger(count) || count < 0) throw new Error(`cursor must be a non-negative integer, got ${count}`);
  const file = cursorFile(dir, sessionId);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${count}\n`);
  fs.renameSync(tmp, file);
}

/** The cursor for a session whose file holds `count` messages. A cursor beyond the end is an Error. */
export function cursorWithin(dir, sessionId, count) {
  const cursor = readCursor(dir, sessionId);
  if (cursor > count) {
    throw new Error(`${cursorFile(dir, sessionId)}: cursor ${cursor} is past the ${count} message(s) in ${messageFile(dir, sessionId)}`);
  }
  return cursor;
}

/** Messages past the cursor. A cursor beyond the end of the file is an Error. */
export function unreadMessages(dir, sessionId) {
  const messages = readMessages(dir, sessionId);
  return messages.slice(cursorWithin(dir, sessionId, messages.length));
}

/** Session ids that have a message file here (done sessions included). */
export function listInboxSessions(dir) {
  assertInboxDir(dir);
  return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => f.slice(0, -'.jsonl'.length)).sort();
}

export function renderMessages(entries) {
  if (entries.length === 0) return 'No messages.';
  return entries.map(({ sessionId, message, index, unread }) =>
    `${sessionId}  #${index + 1}  ${message.ts}  from ${message.from}${unread ? '  [unread]' : ''}\n  ${message.text.split('\n').join('\n  ')}`).join('\n');
}

/**
 * Per-session undelivered messages for the status board, one entry per session that
 * has a message file (sessions that are gone included). Read-only. A file that cannot
 * be read (corrupt line, bad cursor) becomes an entry with `error` set, so one bad
 * file is reported without hiding the rest of the board.
 *
 * `sessions` are classified lane records ({session_id, name, state}); a flagged entry
 * is one whose oldest undelivered message is older than `staleMinutes`.
 */
export function inboxStatus(dir, sessions, { now = Date.now(), staleMinutes }) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { dir, missing: true, sessions: [] };
  if (!(staleMinutes > 0)) throw new Error('inboxStatus needs inbox.stale_minutes');
  const bySession = new Map(sessions.map(s => [s.session_id, s]));
  const entries = [];
  for (const sessionId of listInboxSessions(dir)) {
    const lane = bySession.get(sessionId);
    const base = { session_id: sessionId, name: lane ? lane.name : null, state: lane ? lane.state : null };
    let unread;
    try {
      unread = unreadMessages(dir, sessionId);
    } catch (e) {
      entries.push({ ...base, undelivered: null, oldest_age_ms: null, stale: false, flag: null, error: e.message });
      continue;
    }
    if (unread.length === 0) continue;
    const times = unread.map(m => Date.parse(m.ts));
    if (times.some(Number.isNaN)) {
      const bad = unread.find(m => Number.isNaN(Date.parse(m.ts)));
      entries.push({ ...base, undelivered: null, oldest_age_ms: null, stale: false, flag: null, error: `message ${bad.id} has an unreadable ts "${bad.ts}"` });
      continue;
    }
    const oldest = Math.max(0, now - Math.min(...times));
    const stale = oldest > staleMinutes * 60000;
    let flag = null;
    if (stale) flag = base.state === 'blocked' ? 'waiting for CC to reply' : 'not delivered';
    entries.push({ ...base, undelivered: unread.length, oldest_age_ms: oldest, stale, flag, error: null });
  }
  return { dir, missing: false, sessions: entries };
}
