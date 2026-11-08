// lib/conductor/queue.js
//
// The ranked priority queue and `bobby conductor next` (BOB-180).
//
// The queue is one file CC edits by hand, <studio root>/.bobby/conductor-queue.yml: a
// `queue:` list of ticket IDs across the conductor boards, top first. Nothing outside the
// list is ever picked, and nothing here starts a session (v1 is pull-only: a lane calls
// `conductor next` and runs what it is told).
//
// `next`, in order:
//   1. queue file missing, malformed or naming an unknown ticket = Error. An empty list
//      = "queue empty".
//   2. WIP: live sessions that are working or waiting on CC (the session reader's
//      `working` and `blocked` groups, process alive) must stay under wip.max_lanes.
//   3. Governor: the BOB-175 lane check (free RAM).
//   4. Candidates: queued tickets not done, not blocked, with no live lane naming them
//      (the BOB-177 name/cwd match) and no unexpired claim.
//   5. Finish-first: the candidate furthest along the pipeline (STAGE_ORDER: shipping,
//      testing, reviewing, ... planning, backlog); ties break by queue order.
//   6. The pick is recorded in <studio root>/.bobby/conductor/claims.yml so two lanes never
//      pull the same ticket. The file is rewritten whole, keeping every entry; a claim
//      older than claims.ttl_minutes is ignored when read.

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { readAgents, classifySessions } from './sessions.js';
import { boardTickets, laneStateFor } from './stacks.js';
import { checkLane } from './governor.js';
import { readDisk } from './disk.js';
import { readMemory } from './resources.js';
import { run as defaultRun } from './exec.js';
import { STAGE_ORDER } from '../tickets.js';

export const QUEUE_FILE = 'conductor-queue.yml';
const CLAIMS_DIR = 'conductor';
const CLAIMS_FILE = 'claims.yml';
const TICKET_ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const MINUTE_MS = 60_000;

// Stage -> `bobby run` agent. Stages with no agent of their own are run by `bobby run next`,
// which dispatches on the ticket's current stage. Every STAGE_ORDER stage is listed; an
// unlisted stage is an error, not a guess.
const STAGE_AGENT = {
  backlog: 'plan',
  planning: 'plan',
  building: 'build',
  security: 'security',
  reviewing: 'review',
  testing: 'test',
  shipping: 'ship',
  'design-research': 'next',
  'design-analyze': 'next',
  'design-mockup': 'next',
  'design-spec': 'next',
  'define-brief': 'next',
  'define-personas': 'next',
  'define-journeys': 'next',
  'define-features': 'next',
  'define-blueprint': 'next',
};

export function queueFilePath(studioRoot) {
  return path.join(studioRoot, '.bobby', QUEUE_FILE);
}

export function claimsFilePath(studioRoot) {
  return path.join(studioRoot, '.bobby', CLAIMS_DIR, CLAIMS_FILE);
}

/** Ranked ticket IDs, top first. Missing file, bad shape or a duplicate = Error. [] is a valid queue. */
export function loadQueue(studioRoot) {
  const file = queueFilePath(studioRoot);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} does not exist. Create it with a "queue:" list of ticket IDs (an empty list is fine); \`conductor next\` has no built-in list.`);
  }
  let parsed;
  try {
    parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: invalid YAML (${e.message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('queue' in parsed)) {
    throw new Error(`${file}: expected a mapping with a "queue" key (a list of ticket IDs)`);
  }
  const { queue } = parsed;
  if (!Array.isArray(queue)) throw new Error(`${file}: key "queue" must be a list of ticket IDs`);
  const seen = new Set();
  for (const id of queue) {
    if (typeof id !== 'string' || !TICKET_ID_RE.test(id)) {
      throw new Error(`${file}: "${String(id)}" is not a ticket ID like RF-1234`);
    }
    if (seen.has(id.toUpperCase())) throw new Error(`${file}: ticket ${id} is listed twice`);
    seen.add(id.toUpperCase());
  }
  return [...queue];
}

/** Claims by ticket ID: { <ID>: { claimed_at (ISO), lane (string|null) } }. A missing file = no claims yet. */
export function readClaims(studioRoot) {
  const file = claimsFilePath(studioRoot);
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: invalid YAML (${e.message})`);
  }
  const claims = parsed && typeof parsed === 'object' ? parsed.claims : undefined;
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error(`${file}: expected a mapping with a "claims" mapping`);
  }
  for (const [id, c] of Object.entries(claims)) {
    if (!c || typeof c.claimed_at !== 'string' || Number.isNaN(Date.parse(c.claimed_at))) {
      throw new Error(`${file}: claim ${id} needs an ISO "claimed_at"`);
    }
  }
  return claims;
}

export function isClaimed(claims, id, { ttlMinutes, now }) {
  const c = claims[id];
  return Boolean(c) && now - Date.parse(c.claimed_at) < ttlMinutes * MINUTE_MS;
}

/** Record `id` as claimed. The file is rewritten whole with every existing entry kept. */
export function writeClaim(studioRoot, id, { lane, now }) {
  const claims = { ...readClaims(studioRoot), [id]: { claimed_at: new Date(now).toISOString(), lane: lane ?? null } };
  const file = claimsFilePath(studioRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Written by \`bobby conductor next\`. A claim older than claims.ttl_minutes is ignored.\n${YAML.stringify({ claims })}`);
}

/** The `bobby run` command for a ticket in `stage`, with the project it lives on. */
export function runHint(project, id, stage) {
  const agent = STAGE_AGENT[stage];
  if (!agent) throw new Error(`no \`bobby run\` agent is known for stage "${stage}"`);
  return `BOBBY_PROJECT=${project} bobby run ${agent} ${id}`;
}

/** Live sessions that count against wip.max_lanes: working or waiting on CC, process alive. */
export function laneSessions(sessions) {
  return sessions.filter(s => s.live && (s.state === 'working' || s.state === 'blocked'));
}

/**
 * Resolve each queued ID to its board ticket. An ID on no conductor board = Error.
 * Returns [{ position (1-based), id, project, stage }].
 */
export function resolveQueue(queue, tickets) {
  return queue.map((raw, i) => {
    const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(raw);
    const found = tickets.get(`${m[1].toUpperCase()}-${Number(m[2])}`);
    if (!found) throw new Error(`queue names ${raw}, which is not on any conductor board`);
    return { position: i + 1, id: found.id, project: found.project, stage: found.stage, blocked: found.blocked };
  });
}

function rankOf(stage) {
  if (!(stage in STAGE_ORDER)) throw new Error(`queued ticket stage "${stage}" has no finish-first rank`);
  return STAGE_ORDER[stage];
}

function snapshot({ studioRoot, config, run, now }) {
  const sessions = classifySessions(readAgents({ run }), { hookStateDir: config.hook_state_dir, now });
  const resolved = resolveQueue(loadQueue(studioRoot), boardTickets(studioRoot, config.projects));
  return { sessions, resolved };
}

/**
 * `conductor next`. Returns one of
 *   { kind: 'empty' }
 *   { kind: 'refused', reason }
 *   { kind: 'none', skipped: [{ id, why }] }       nothing in the queue is pullable
 *   { kind: 'picked', ticket: { id, project, stage, position }, hint, skipped }
 * Throws on any unreadable input; a failing probe is never read as "nothing to do".
 */
export function pickNext({ studioRoot, config, run = defaultRun, now = Date.now(), lane = null, memory = null, disk = null }) {
  const { sessions, resolved } = snapshot({ studioRoot, config, run, now });
  if (resolved.length === 0) return { kind: 'empty' };

  const active = laneSessions(sessions).length;
  const cap = config.wip.max_lanes;
  if (active >= cap) {
    return { kind: 'refused', reason: `${active} live lane session(s) (working or waiting on CC) >= wip.max_lanes ${cap}` };
  }
  const governor = checkLane(config, memory || readMemory({ run }), disk || readDisk(studioRoot));
  if (!governor.ok) return { kind: 'refused', reason: governor.reason };

  const claims = readClaims(studioRoot);
  const lanes = laneSessions(sessions);
  const skipped = [];
  const candidates = [];
  for (const t of resolved) {
    if (t.stage === 'done') { skipped.push({ id: t.id, why: 'done' }); continue; }
    if (t.stage === 'blocked' || t.blocked) { skipped.push({ id: t.id, why: 'blocked' }); continue; }
    const held = laneStateFor(t.id, lanes);
    if (held !== 'none') { skipped.push({ id: t.id, why: `a lane already holds it (${held})` }); continue; }
    if (isClaimed(claims, t.id, { ttlMinutes: config.claims.ttl_minutes, now })) {
      skipped.push({ id: t.id, why: `claimed by ${claims[t.id].lane || 'another lane'} within ${config.claims.ttl_minutes} min` });
      continue;
    }
    candidates.push({ ...t, rank: rankOf(t.stage) });
  }
  if (candidates.length === 0) return { kind: 'none', skipped };

  // Lowest STAGE_ORDER = furthest along; Array#sort is stable, so queue order breaks ties.
  const pick = [...candidates].sort((a, b) => a.rank - b.rank)[0];
  writeClaim(studioRoot, pick.id, { lane, now });
  return {
    kind: 'picked',
    ticket: { id: pick.id, project: pick.project, stage: pick.stage, position: pick.position },
    hint: runHint(pick.project, pick.id, pick.stage),
    skipped,
  };
}

/** `conductor queue`: every ranked ticket with its stage and whether a lane or a claim holds it. */
export function queueView({ studioRoot, config, run = defaultRun, now = Date.now() }) {
  const { sessions, resolved } = snapshot({ studioRoot, config, run, now });
  const lanes = laneSessions(sessions);
  const claims = readClaims(studioRoot);
  return resolved.map(t => ({
    position: t.position,
    id: t.id,
    project: t.project,
    stage: t.stage,
    blocked: t.stage === 'blocked' || t.blocked,
    lane: laneStateFor(t.id, lanes),
    claimed: isClaimed(claims, t.id, { ttlMinutes: config.claims.ttl_minutes, now }),
  }));
}

export function renderQueue(rows) {
  if (rows.length === 0) return 'queue empty';
  return rows.map(r => {
    const notes = [];
    if (r.blocked) notes.push('blocked');
    notes.push(r.lane === 'none' ? 'no lane' : `lane ${r.lane}`);
    if (r.claimed) notes.push('claimed');
    return `  ${String(r.position).padStart(2)}. ${r.id}  ${r.stage}  (${notes.join(', ')})`;
  }).join('\n');
}

export function renderNext(result) {
  if (result.kind === 'empty') return 'queue empty';
  if (result.kind === 'none') {
    return ['nothing to pull: no queued ticket is pullable', ...result.skipped.map(s => `  ${s.id}  ${s.why}`)].join('\n');
  }
  const t = result.ticket;
  return [`${t.id}  ${t.stage}  (queue #${t.position}, project ${t.project})`, `  ${result.hint}`].join('\n');
}
