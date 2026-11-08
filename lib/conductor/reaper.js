// lib/conductor/reaper.js
//
// The conductor's only session-mutating code. A finished background session is
// ended with `claude stop <id>`, which keeps the transcript. Nothing here removes a
// session, a file or a handoff marker; the marker stays.
//
// Who may be ended (every rule below must hold):
//   - a background session (it has a short id). Interactive sessions never.
//   - not the session running this command (CLAUDE_CODE_SESSION_ID)
//   - state `done`. Never working, never blocked (waiting on CC), never unknown.
//   - a live process (a pid). A `done` session with no pid was already ended with
//     `claude stop` and is still listed by `claude agents --all`: nothing to end.
//   - if it carries a handoff marker, the successor must be live. A marker whose
//     successor is not live is an `orphaned handoff`: kept, and listed for CC.
//
// Candidates come from one `claude agents --json --all` snapshot. Right before each
// stop the list is read again and the full rule re-run on it, so a session that
// turned blocked or working in between is skipped.

import { readAgents, classifySessions } from './sessions.js';
import { run as defaultRun } from './exec.js';

const BG_ID_RE = /^[0-9a-f]{4,}$/;

function describe(s) {
  return { id: s.id, session_id: s.session_id, name: s.name || '(unnamed)' };
}

/**
 * Sort classified sessions into candidates (to end), orphaned handoffs and
 * kept sessions. Pure: no I/O.
 */
export function evaluateSessions(sessions, { selfSessionId = null } = {}) {
  const candidates = [];
  const orphaned = [];
  const kept = [];
  for (const s of sessions) {
    const keep = (why) => kept.push({ ...describe(s), why });
    if (!s.id || s.kind !== 'background') { keep('not a background session'); continue; }
    if (selfSessionId && (s.session_id === selfSessionId || s.id === selfSessionId)) { keep('this session'); continue; }
    if (s.state !== 'done') { keep(`state ${s.state === 'unknown' ? `unknown (${s.raw_state ?? 'none'})` : s.state}`); continue; }
    if (!s.live) { keep('already stopped (no live pid)'); continue; }
    if (s.handed_off && !s.successor_live) {
      orphaned.push({ ...describe(s), why: s.successor ? `successor ${s.successor} is not live` : 'marker names no successor' });
      continue;
    }
    candidates.push({
      ...describe(s),
      reason: s.handed_off ? `done, handed off to ${s.successor} (live)` : 'done',
    });
  }
  return { candidates, orphaned, kept };
}

function snapshot({ hookStateDir, run, now }) {
  return classifySessions(readAgents({ run }), { hookStateDir, now });
}

/**
 * Plan a reap from one snapshot; with `apply`, end each candidate once.
 * Returns { candidates, orphaned, kept, results, failed }. `results` is empty on a
 * dry run: `claude stop` is not called at all.
 */
export function reap({ hookStateDir, apply = false, selfSessionId = null, run = defaultRun, now = Date.now() }) {
  const plan = evaluateSessions(snapshot({ hookStateDir, run, now }), { selfSessionId });
  const results = [];
  if (!apply) return { ...plan, results, failed: 0 };

  for (const c of plan.candidates) {
    let fresh;
    try {
      fresh = snapshot({ hookStateDir, run, now });
    } catch (e) {
      results.push({ ...c, outcome: 'failed', detail: `could not re-read sessions: ${e.message}` });
      continue;
    }
    const still = evaluateSessions(fresh, { selfSessionId }).candidates.find(x => x.session_id === c.session_id);
    if (!still) {
      const current = fresh.find(s => s.session_id === c.session_id);
      results.push({ ...c, outcome: 'skipped', detail: current ? `state is now ${current.state}` : 'no longer listed' });
      continue;
    }
    if (!BG_ID_RE.test(still.id)) {
      results.push({ ...c, outcome: 'failed', detail: `unexpected session id "${still.id}"` });
      continue;
    }
    try {
      run('claude', ['stop', still.id]);
      results.push({ ...c, outcome: 'stopped' });
    } catch (e) {
      results.push({ ...c, outcome: 'failed', detail: e.message });
    }
  }
  return { ...plan, results, failed: results.filter(r => r.outcome === 'failed').length };
}

/** Text for `bobby conductor reap`. */
export function renderReap(report, { apply }) {
  const lines = [];
  const row = (label, s, extra) => lines.push(`  ${label}  ${s.id}  ${s.name}  ${extra}`);
  if (!apply) {
    lines.push(`Dry run: ${report.candidates.length} session(s) would be ended. Nothing was changed; add --apply to end them.`);
    for (const c of report.candidates) row('would end', c, c.reason);
  } else if (report.candidates.length === 0) {
    lines.push('No sessions to end.');
  } else {
    for (const r of report.results) {
      row(r.outcome === 'stopped' ? 'ended' : r.outcome, r, r.detail ? `${r.reason}; ${r.detail}` : r.reason);
    }
  }
  if (report.orphaned.length) {
    lines.push(`Orphaned handoff (${report.orphaned.length}), kept for CC:`);
    for (const o of report.orphaned) row('orphaned handoff', o, o.why);
  }
  lines.push(`Kept: ${report.kept.length} session(s) that are working, waiting on CC, unknown, interactive, already stopped or this one.`);
  return lines.join('\n');
}
