// lib/conductor/stack-reaper.js
//
// The conductor's only docker-mutating code (BOB-177). An idle per-ticket API stack
// is stopped with exactly
//
//   docker compose -p <project> stop
//
// which keeps the containers, their volumes and their data; the stack is started again
// by hand. Nothing here removes a container, a volume or an image.
//
// A stack is stopped only when every rule holds:
//   - it maps to a ticket on a conductor board (see stacks.js). `unmapped` stacks,
//     which include the shared main stack and the promote/ship stacks
//     (promote-api-mainapi...), are never touched, and neither is any project whose
//     name starts with promote or ship, even if one ever mapped.
//   - no session whose name or cwd names the ticket is working, waiting on CC (blocked)
//     or in an unknown state. Only no session, or a done one, counts as "no working lane".
//   - its ticket is not mid-pipeline: stage reviewing, testing or shipping, or an unexpired
//     `conductor next` claim (claims.yml, claims.ttl_minutes) names it. A lane that just
//     finished building leaves no live session, so without this the stack of a ticket
//     waiting for its test lane would be stopped right before the lane needs it.
//   - it has been idle for reaper.stack_idle_hours. `docker` gives no last-request time,
//     so idle is the age of the stack's newest container start (the same figure `status`
//     shows). `claude agents` gives no session end time either, so a lane that ended
//     inside the window cannot be seen; the container-start clock is the only time bound.
//
// Candidates come from one snapshot. Right before each stop the sessions and stacks are
// read again and the full rule re-run, so a lane that started in between keeps its stack.
// If docker (or claude) fails, the error is thrown; it is never read as "nothing to do".

import { readAgents, classifySessions } from './sessions.js';
import { readStacks, boardTickets, mapStacks } from './stacks.js';
import { readClaims, isClaimed } from './queue.js';
import { run as defaultRun } from './exec.js';

const HOUR_MS = 3_600_000;
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
const PROTECTED_RE = /^(promote|ship)/;
const MID_PIPELINE_STAGES = new Set(['reviewing', 'testing', 'shipping']);

function describe(s) {
  return { project: s.project, ticket: s.ticket, containers: s.containers, idle_ms: s.idle_ms };
}

/**
 * Sort mapped stacks (stacks.js mapStacks) into candidates (to stop) and kept
 * stacks, each kept one with the reason. Pure: no I/O.
 */
export function evaluateStacks(stacks, { idleHours, claims, claimTtlMinutes, now }) {
  const idleMs = idleHours * HOUR_MS;
  const candidates = [];
  const kept = [];
  for (const s of stacks) {
    const keep = (why) => kept.push({ ...describe(s), why });
    if (PROTECTED_RE.test(s.project)) { keep('promote/ship stack'); continue; }
    if (s.unmapped) { keep('unmapped'); continue; }
    if (s.lane === 'working') { keep(`${s.ticket} has a working lane`); continue; }
    if (s.lane === 'waiting_on_cc') { keep(`${s.ticket} lane is waiting on CC`); continue; }
    if (s.lane === 'unknown') { keep(`${s.ticket} has a session in an unknown state`); continue; }
    if (MID_PIPELINE_STAGES.has(s.ticket_stage)) { keep(`${s.ticket} is ${s.ticket_stage}, mid-pipeline`); continue; }
    if (isClaimed(claims, s.ticket, { ttlMinutes: claimTtlMinutes, now })) { keep(`${s.ticket} has a live lane claim`); continue; }
    if (s.idle_ms < idleMs) { keep(`idle ${(s.idle_ms / HOUR_MS).toFixed(1)}h < ${idleHours}h`); continue; }
    candidates.push({ ...describe(s), lane: s.lane, reason: `${s.ticket} lane ${s.lane}, idle ${(s.idle_ms / HOUR_MS).toFixed(1)}h` });
  }
  return { candidates, kept };
}

function snapshot({ studioRoot, config, run, now }) {
  const sessions = classifySessions(readAgents({ run }), { hookStateDir: config.hook_state_dir, now });
  const docker = readStacks({ run, now });
  const tickets = boardTickets(studioRoot, config.projects);
  return { stacks: mapStacks(docker.stacks, { tickets, sessions }), claims: readClaims(studioRoot) };
}

function evaluate(snap, { config, now }) {
  return evaluateStacks(snap.stacks, { idleHours: config.reaper.stack_idle_hours, claims: snap.claims, claimTtlMinutes: config.claims.ttl_minutes, now });
}

/**
 * Plan a stack reap from one snapshot; with `apply`, stop each candidate once.
 * Returns { candidates, kept, results, failed }. `results` is empty on a dry run:
 * only the read probes (`docker ps`, `docker inspect`, `claude agents`) ran.
 */
export function reapStacks({ studioRoot, config, apply = false, run = defaultRun, now = Date.now() }) {
  const plan = evaluate(snapshot({ studioRoot, config, run, now }), { config, now });
  const results = [];
  if (!apply) return { ...plan, results, failed: 0 };

  for (const c of plan.candidates) {
    let fresh;
    const freshNow = Date.now();
    try {
      fresh = snapshot({ studioRoot, config, run, now: freshNow });
    } catch (e) {
      results.push({ ...c, outcome: 'failed', detail: `could not re-read sessions and stacks: ${e.message}` });
      continue;
    }
    const still = evaluate(fresh, { config, now: freshNow }).candidates.find(x => x.project === c.project);
    if (!still) {
      const current = fresh.stacks.find(s => s.project === c.project);
      results.push({ ...c, outcome: 'skipped', detail: current ? 'no longer idle with no working lane and no ticket mid-pipeline' : 'no longer running' });
      continue;
    }
    if (!PROJECT_NAME_RE.test(still.project)) {
      results.push({ ...c, outcome: 'failed', detail: `unexpected compose project name "${still.project}"` });
      continue;
    }
    try {
      run('docker', ['compose', '-p', still.project, 'stop']);
      results.push({ ...c, outcome: 'stopped' });
    } catch (e) {
      results.push({ ...c, outcome: 'failed', detail: e.message });
    }
  }
  return { ...plan, results, failed: results.filter(r => r.outcome === 'failed').length };
}

/** Text for `bobby conductor reap --stacks`. */
export function renderStackReap(report, { apply, idleHours }) {
  const lines = [];
  const row = (label, s, extra) => lines.push(`  ${label}  ${s.project}  ${s.ticket}  ${extra}`);
  if (!apply) {
    lines.push(`Dry run: ${report.candidates.length} stack(s) would be stopped (docker compose stop; containers and their data are kept). Nothing was changed; add --apply to stop them.`);
    for (const c of report.candidates) row('would stop', c, c.reason);
  } else if (report.candidates.length === 0) {
    lines.push('No stacks to stop.');
  } else {
    for (const r of report.results) {
      row(r.outcome === 'stopped' ? 'stopped' : r.outcome, r, r.detail ? `${r.reason}; ${r.detail}` : r.reason);
    }
  }
  lines.push(`Kept: ${report.kept.length} running stack(s) that are unmapped, promote/ship, have a working, waiting or unknown lane, are mid-pipeline (reviewing, testing, shipping or claimed), or are idle under ${idleHours}h.`);
  for (const k of report.kept) lines.push(`  kept  ${k.project}  ${k.why}`);
  return lines.join('\n');
}
