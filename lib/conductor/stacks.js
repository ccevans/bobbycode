// lib/conductor/stacks.js
//
// Running docker compose stacks, grouped by the `com.docker.compose.project`
// label. Read-only: `docker ps` and `docker inspect` only.
//
// Ticket mapping rule. scripts/new-api-worktree.sh names each per-ticket stack
//   COMPOSE_PROJECT_NAME = lowercase("<TICKET>api") with everything outside [a-z0-9_-] removed
// where <TICKET> is its first argument: "RF-1683" gives "rf-1683api" and
// "RF-1123-rc" gives "rf-1123-rcapi". So a project maps to the ticket
// "<PREFIX>-<number>" read from the front of the name, when that ticket exists on
// one of the conductor boards. Anything else (promote-api-mainapi, listrobin_api, a
// project whose ticket is not on a board) is `unmapped`.

import { run as defaultRun } from './exec.js';
import { configForProject, resolveTicketsDir } from '../config.js';
import { listTickets } from '../tickets.js';

const PROJECT_LABEL_RE = /(?:^|,)com\.docker\.compose\.project=([^,]*)/;
const TICKET_PROJECT_RE = /^([a-z][a-z0-9]*)-(\d+)(?:-[a-z0-9_-]*)?api$/;

/**
 * Ticket key a compose project name maps to by the script's naming rule, or null.
 * The key is "<PREFIX>-<number>" with leading zeros dropped, so "ops-005api" and a
 * board ticket "OPS-005" (or "OPS-5") meet at "OPS-5".
 */
export function ticketKeyFromProject(project) {
  const m = TICKET_PROJECT_RE.exec(project);
  return m ? `${m[1].toUpperCase()}-${Number(m[2])}` : null;
}

function ticketKey(id) {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(id);
  return m ? `${m[1].toUpperCase()}-${Number(m[2])}` : null;
}

function parsePsLines(out) {
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    let c;
    try {
      c = JSON.parse(line);
    } catch (e) {
      throw new Error(`\`docker ps --format json\` returned an unparseable line: ${e.message}`);
    }
    if (!c || typeof c.ID !== 'string' || typeof c.Labels !== 'string') {
      throw new Error('`docker ps --format json` returned a container without string "ID" and "Labels"');
    }
    return c;
  });
}

function startTimes(containers, run) {
  if (containers.length === 0) return new Map();
  const ids = containers.map(c => c.ID);
  const out = run('docker', ['inspect', '--format', '{{.State.StartedAt}}', ...ids]);
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length !== ids.length) {
    throw new Error(`\`docker inspect\` returned ${lines.length} start times for ${ids.length} containers`);
  }
  return new Map(ids.map((id, i) => {
    const t = Date.parse(lines[i]);
    if (Number.isNaN(t)) throw new Error(`\`docker inspect\` returned an unparseable start time "${lines[i]}" for ${id}`);
    return [id, t];
  }));
}

/**
 * Running stacks: [{ project, containers, newest_start (ISO), idle_ms }] sorted by
 * project, plus `standalone_containers` (running containers with no compose label,
 * not counted as stacks). A failing `docker` (daemon not running, not installed)
 * throws with the docker error; it is never read as zero stacks.
 */
export function readStacks({ run = defaultRun, now = Date.now() } = {}) {
  const containers = parsePsLines(run('docker', ['ps', '--format', 'json']));
  const starts = startTimes(containers, run);
  const byProject = new Map();
  let standalone = 0;
  for (const c of containers) {
    const m = PROJECT_LABEL_RE.exec(c.Labels);
    if (!m || !m[1]) { standalone += 1; continue; }
    const g = byProject.get(m[1]) || { project: m[1], containers: 0, newest: 0 };
    g.containers += 1;
    g.newest = Math.max(g.newest, starts.get(c.ID));
    byProject.set(m[1], g);
  }
  const stacks = [...byProject.values()]
    .sort((a, b) => a.project.localeCompare(b.project))
    .map(g => ({
      project: g.project,
      containers: g.containers,
      newest_start: new Date(g.newest).toISOString(),
      idle_ms: Math.max(0, now - g.newest),
    }));
  return { stacks, standalone_containers: standalone };
}

function projectOf(container) {
  const m = PROJECT_LABEL_RE.exec(container.Labels);
  return m && m[1] ? m[1] : null;
}

/**
 * Stacks that exist but are not running: [{ project, containers }] sorted by
 * project. A project is stopped when it has exited containers and none of
 * `runningProjects` (a stack with an exited one-off container beside running
 * services is running). Read-only: `docker ps --all`. A failing `docker` throws.
 */
export function readStoppedStacks({ run = defaultRun, runningProjects = [] } = {}) {
  const running = new Set(runningProjects);
  const byProject = new Map();
  for (const c of parsePsLines(run('docker', ['ps', '--all', '--filter', 'status=exited', '--format', 'json']))) {
    const project = projectOf(c);
    if (!project || running.has(project)) continue;
    byProject.set(project, (byProject.get(project) || 0) + 1);
  }
  return [...byProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, containers]) => ({ project, containers }));
}

/** Decorate stopped stacks with their board ticket (or null = unmapped). */
export function mapStoppedStacks(stopped, { tickets }) {
  return stopped.map(s => {
    const key = ticketKeyFromProject(s.project);
    const found = key ? tickets.get(key) : undefined;
    return { ...s, ticket: found ? found.id : null, unmapped: !found };
  });
}

/** Map of ticket key (see ticketKeyFromProject) -> { id, project, stage } across the conductor boards. */
export function boardTickets(studioRoot, projects) {
  const map = new Map();
  for (const project of projects) {
    const config = configForProject(studioRoot, project);
    for (const t of listTickets(resolveTicketsDir(studioRoot, config))) {
      const key = ticketKey(t.id);
      if (key) map.set(key, { id: t.id, project, stage: t.stage || 'backlog' });
    }
  }
  return map;
}

// A session names a ticket when its name or cwd holds the ID as a whole token. Zero padding
// is ignored in both directions (board "OPS-005" meets a lane named "OPS-5"), so a lane is
// never missed for the way its ticket number was typed.
function mentionsTicket(text, ticketId) {
  if (!text) return false;
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(ticketId);
  const pattern = m ? `${m[1]}-0*${Number(m[2])}` : ticketId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${pattern}(?![0-9])`, 'i').test(text);
}

const LANE_RANK = ['working', 'blocked', 'unknown', 'done'];
const LANE_LABEL = { working: 'working', blocked: 'waiting_on_cc', unknown: 'unknown', done: 'done' };

/** State of the best-matching session whose name or cwd names the ticket: working > waiting_on_cc > unknown > done > none. */
export function laneStateFor(ticketId, sessions) {
  const hits = sessions.filter(s => mentionsTicket(s.name, ticketId) || mentionsTicket(s.cwd, ticketId));
  for (const state of LANE_RANK) {
    if (hits.some(s => s.state === state)) return LANE_LABEL[state];
  }
  return 'none';
}

/** Decorate stacks with ticket (or null = unmapped) and the mapped lane's state. */
export function mapStacks(stackList, { tickets, sessions }) {
  return stackList.map(s => {
    const key = ticketKeyFromProject(s.project);
    const found = key ? tickets.get(key) : undefined;
    return {
      ...s,
      ticket: found ? found.id : null,
      unmapped: !found,
      ticket_stage: found ? found.stage : null,
      lane: found ? laneStateFor(found.id, sessions) : null,
    };
  });
}
