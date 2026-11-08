// lib/conductor/sessions.js
//
// Reads `claude agents --json --all` and classifies each session. Read-only.
//
//   working  state "working"
//   blocked  state "blocked"  (waiting on CC)
//   done     state "done"
//   unknown  any other value, or none. Kept visible with its raw state and never
//            treated as done. (The status board splits this value into groups for
//            display, see groupSessions; the classification itself, which the reapers
//            read, does not change.)
//
// Live process (BOB-185). `claude agents --json --all` keeps a session that was ended
// earlier in the list as state `done` with no `pid`. A session is `live`
// only when it carries a pid (a positive integer). A `done` session that is not live
// is already stopped: there is nothing for the reaper to end and it is not counted as
// a live lane. The same holds for a session claude lists as `stopped` or `failed` with
// no pid (BOB-184): the status board groups all three as stopped.

import fs from 'fs';
import path from 'path';
import { run as defaultRun } from './exec.js';

const KNOWN_STATES = ['working', 'blocked', 'done'];
const ENDED_STATES = ['done', 'stopped', 'failed'];
// handoff-spawn writes `"<name>" (bg <id>, <model>) from <file>`; anchoring on `(bg ` keeps a
// session name that happens to contain "bg <hex>" from being read as the successor.
const SUCCESSOR_RE = /\(bg ([0-9a-f]+)[,)]/;

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
    status: typeof s.status === 'string' ? s.status : null,
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
 * live), stopped (raw state done, stopped or failed with no live process: already ended),
 * interactive (a terminal session: it has no state, only a status such as idle or busy),
 * unknown (anything else, kept visible). A session with a state of working or blocked is
 * in its own group whatever its kind.
 */
export function groupSessions(sessions) {
  const groups = { working: [], waiting_on_cc: [], done: [], stopped: [], interactive: [], unknown: [] };
  for (const s of sessions) {
    if (s.state === 'working') groups.working.push(s);
    else if (s.state === 'blocked') groups.waiting_on_cc.push(s);
    else if (s.state === 'done' && s.live) groups.done.push(s);
    else if (ENDED_STATES.includes(s.raw_state) && !s.live) groups.stopped.push(s);
    else if (s.kind === 'interactive') groups.interactive.push(s);
    else groups.unknown.push(s);
  }
  return groups;
}
