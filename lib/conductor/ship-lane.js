// lib/conductor/ship-lane.js
//
// One serial ship lane per repo (BOB-181). `bobby conductor ship claim <repo>` takes an
// exclusive per-repo slot and lists the batch of tickets ready to ship; `ship release
// <repo>` frees it. The conductor ships nothing and deploys nothing: it only holds the
// lock and prints the batch. The claiming session runs `bobby run ship <ID>` itself.
//
// Why a lock per repo: a full listrobin_api suite takes minutes and two at once time out,
// so two sessions must never ship the same repo together. Different repos do not share a
// suite, so their lanes are independent.
//
// State: <studio root>/.bobby/conductor/ship-<repo>.yml, rewritten whole and never deleted
// (a release writes a free lane: holder fields null). Keys: repo, holder_session_id,
// holder_name, since (ISO), released_at, released_by.
//
// Rules:
//   - `repo` must appear in the `repos` of at least one ticket on a conductor board;
//     anything else is an Error, never a guess.
//   - A claim is refused (Error, so exit 1) while another session holds the lane. A holder
//     that is working or waiting on CC (or a terminal session with a live process) is "live"
//     and the Error says so. A holder that is done or gone from `claude agents` is a stale
//     lock: the Error names it and says so, and the lane is NOT taken over. A person frees
//     it with `ship release <repo> --force`, which prints what it overrode.
//   - The holder claiming again gets the batch again; `since` is kept.
//   - Release by anyone but the holder is refused unless `force`.
//   - The batch is every ticket in stage `shipping`, not flagged blocked, whose `repos`
//     include the repo: queued ones first in conductor-queue.yml order, then the rest in
//     board order (the order of conductor.yml `projects`), by ticket number.
//
// The claim is a read-then-write of one small file. Two claims landing in the same few
// milliseconds could both succeed; lanes are started by hand minutes apart, the same
// trade-off as claims.yml (BOB-180).

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { readAgents, classifySessions } from './sessions.js';
import { resolveRecipient } from './inbox.js';
import { loadQueue, runHint } from './queue.js';
import { run as defaultRun } from './exec.js';
import { configForProject, resolveTicketsDir } from '../config.js';
import { listTickets } from '../tickets.js';

const STATE_DIR = 'conductor';
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TICKET_ID_RE = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

export function shipLaneFile(studioRoot, repo) {
  if (!REPO_RE.test(repo)) throw new Error(`"${repo}" is not a repo name`);
  return path.join(studioRoot, '.bobby', STATE_DIR, `ship-${repo}.yml`);
}

/** Every ticket on the conductor boards, in board order: { id, project, title, stage, blocked, repos }. */
export function shipBoardTickets(studioRoot, projects) {
  const out = [];
  for (const project of projects) {
    const config = configForProject(studioRoot, project);
    for (const t of listTickets(resolveTicketsDir(studioRoot, config))) {
      out.push({
        id: t.id,
        project,
        title: t.title || '',
        stage: t.stage || 'backlog',
        blocked: Boolean(t.blocked),
        repos: Array.isArray(t.repos) ? t.repos : [],
      });
    }
  }
  return out;
}

export function knownRepos(tickets) {
  return [...new Set(tickets.flatMap(t => t.repos))].sort();
}

function assertKnownRepo(repo, tickets) {
  const repos = knownRepos(tickets);
  if (!repos.includes(repo)) {
    throw new Error(`Unknown repo "${repo}": no ticket on the conductor boards lists it in "repos". Known repos: ${repos.join(', ') || '(none)'}`);
  }
}

function ticketNumber(id) {
  const m = TICKET_ID_RE.exec(id);
  return m ? Number(m[2]) : 0;
}

/** Ready batch for `repo`: [{ id, project, title, position (queue place or null), hint }] in ship order. */
export function readyBatch(repo, tickets, queue) {
  const place = new Map(queue.map((id, i) => [id.toUpperCase(), i + 1]));
  const ready = tickets
    .map((t, boardIndex) => ({ t, boardIndex }))
    .filter(({ t }) => t.stage === 'shipping' && !t.blocked && t.repos.includes(repo));
  const rank = ({ t, boardIndex }) => {
    const p = place.get(t.id.toUpperCase());
    return p ? [0, p, 0] : [1, boardIndex, ticketNumber(t.id)];
  };
  ready.sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  });
  return ready.map(({ t }) => ({
    id: t.id,
    project: t.project,
    title: t.title,
    position: place.get(t.id.toUpperCase()) ?? null,
    hint: runHint(t.project, t.id, 'shipping'),
  }));
}

/** The lane file as { holder_session_id, holder_name, since, ... }, or null when the lane was never claimed. */
export function readShipLane(studioRoot, repo) {
  const file = shipLaneFile(studioRoot, repo);
  if (!fs.existsSync(file)) return null;
  let parsed;
  try {
    parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: invalid YAML (${e.message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file}: expected a mapping`);
  if (parsed.repo !== repo) throw new Error(`${file}: "repo" must be ${repo}`);
  const holder = parsed.holder_session_id;
  if (holder !== null && (typeof holder !== 'string' || !holder)) {
    throw new Error(`${file}: "holder_session_id" must be a session id or null`);
  }
  if (holder !== null && (typeof parsed.since !== 'string' || Number.isNaN(Date.parse(parsed.since)))) {
    throw new Error(`${file}: a held lane needs an ISO "since"`);
  }
  return {
    holder_session_id: holder,
    holder_name: typeof parsed.holder_name === 'string' ? parsed.holder_name : null,
    since: holder === null ? null : parsed.since,
    released_at: parsed.released_at ?? null,
    released_by: parsed.released_by ?? null,
  };
}

function writeShipLane(studioRoot, repo, lane) {
  const file = shipLaneFile(studioRoot, repo);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = YAML.stringify({
    repo,
    holder_session_id: lane.holder_session_id,
    holder_name: lane.holder_name,
    since: lane.since,
    released_at: lane.released_at ?? null,
    released_by: lane.released_by ?? null,
  });
  fs.writeFileSync(file, `# Written by \`bobby conductor ship claim|release\`. One serial ship lane per repo; never deleted.\n${body}`);
  return file;
}

/**
 * How a recorded holder looks in `claude agents`: { live, why }.
 * live: working or waiting on CC, or a terminal session whose process is alive.
 * Otherwise stale, with the reason ("done", "stopped", "not in claude agents", ...).
 */
export function holderStatus(sessions, sessionId) {
  const s = sessions.find(x => x.session_id === sessionId);
  if (!s) return { live: false, why: 'not in `claude agents`' };
  if (s.state === 'working' || s.state === 'blocked') return { live: true, why: s.state === 'blocked' ? 'waiting on CC' : 'working' };
  if (s.state === 'unknown' && s.live) return { live: true, why: s.kind === 'interactive' ? 'terminal session, process alive' : `state ${s.raw_state ?? 'none'}, process alive` };
  return { live: false, why: `state ${s.raw_state ?? 'none'}` };
}

function ageText(since, now) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function describeHolder(lane, now) {
  return `${lane.holder_name || '(unnamed)'} (${lane.holder_session_id}) since ${lane.since} (${ageText(lane.since, now)} ago)`;
}

function snapshot({ studioRoot, config, run, now }) {
  const raw = readAgents({ run });
  return {
    raw,
    sessions: classifySessions(raw, { hookStateDir: config.hook_state_dir, now }),
    tickets: shipBoardTickets(studioRoot, config.projects),
  };
}

// The session acting: --session (name, sessionId or bg id) or the one running the command.
function actor(raw, session, env) {
  const query = session || env.CLAUDE_CODE_SESSION_ID;
  if (!query) return null;
  return resolveRecipient(raw, query);
}

/**
 * `ship claim <repo>`. Returns { repo, holder: { session_id, name }, since, reclaimed, batch }.
 * Throws (exit 1) on an unknown repo, an unknown claiming session, a live holder or a stale lock.
 */
export function claimShipLane({ studioRoot, config, repo, session = null, run = defaultRun, now = Date.now(), env = process.env }) {
  const { raw, sessions, tickets } = snapshot({ studioRoot, config, run, now });
  assertKnownRepo(repo, tickets);
  const me = actor(raw, session, env);
  if (!me) throw new Error('Cannot tell which session is claiming (CLAUDE_CODE_SESSION_ID is not set); pass --session <name|sessionId|bg id>');

  const lane = readShipLane(studioRoot, repo);
  let since = new Date(now).toISOString();
  let reclaimed = false;
  if (lane && lane.holder_session_id) {
    if (lane.holder_session_id === me.sessionId) {
      since = lane.since;
      reclaimed = true;
    } else {
      const h = holderStatus(sessions, lane.holder_session_id);
      if (h.live) {
        throw new Error(`Ship lane ${repo} is held by ${describeHolder(lane, now)}, ${h.why}. Wait for it to release (\`bobby conductor ship release ${repo}\`).`);
      }
      throw new Error(
        `Ship lane ${repo} has a stale lock held by ${describeHolder(lane, now)}: that session is ${h.why}. `
        + `The lane was not taken over. If that session is really finished, free it with \`bobby conductor ship release ${repo} --force\`, then claim again.`,
      );
    }
  }
  const holder = { session_id: me.sessionId, name: me.name ?? null };
  writeShipLane(studioRoot, repo, { holder_session_id: holder.session_id, holder_name: holder.name, since });
  return { repo, holder, since, reclaimed, batch: readyBatch(repo, tickets, loadQueue(studioRoot)) };
}

/**
 * `ship release <repo>`. Returns { repo, kind: 'released' | 'free' | 'forced', overrode }.
 * `overrode` (forced) is what was held. A non-holder without `force` is an Error.
 */
export function releaseShipLane({ studioRoot, config, repo, session = null, force = false, run = defaultRun, now = Date.now(), env = process.env }) {
  const { raw, sessions, tickets } = snapshot({ studioRoot, config, run, now });
  assertKnownRepo(repo, tickets);
  const lane = readShipLane(studioRoot, repo);
  if (!lane || !lane.holder_session_id) return { repo, kind: 'free', overrode: null };

  const me = actor(raw, session, env);
  const isHolder = Boolean(me) && me.sessionId === lane.holder_session_id;
  if (!isHolder && !force) {
    throw new Error(
      `Ship lane ${repo} is held by ${describeHolder(lane, now)}, not by ${me ? (me.name || me.sessionId) : 'this caller'}. `
      + `Only the holder releases it; to override, pass --force.`,
    );
  }
  const by = me ? (me.name || me.sessionId) : 'forced (no session named)';
  writeShipLane(studioRoot, repo, {
    holder_session_id: null, holder_name: null, since: null, released_at: new Date(now).toISOString(), released_by: by,
  });
  if (isHolder) return { repo, kind: 'released', overrode: null };
  const h = holderStatus(sessions, lane.holder_session_id);
  return {
    repo,
    kind: 'forced',
    overrode: { holder_session_id: lane.holder_session_id, holder_name: lane.holder_name, since: lane.since, holder_live: h.live, holder_why: h.why },
  };
}

/**
 * Rows for `status`: every repo whose lane is held or has a batch waiting. The batch is only
 * counted here, so the queue file (which orders it) is not needed.
 * [{ repo, holder: { session_id, name, since, age_ms, live, why } | null, batch (count), error? }]
 * A malformed lane file is reported on its row instead of failing the whole board.
 */
export function shipLanesView({ studioRoot, sessions, tickets, now }) {
  const dir = path.join(studioRoot, '.bobby', STATE_DIR);
  const fromFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).map(f => /^ship-(.+)\.yml$/.exec(f)).filter(Boolean).map(m => m[1])
    : [];
  const repos = [...new Set([...knownRepos(tickets), ...fromFiles])].sort();
  const rows = [];
  for (const repo of repos) {
    const batch = readyBatch(repo, tickets, []).length;
    let lane;
    try {
      lane = readShipLane(studioRoot, repo);
    } catch (e) {
      rows.push({ repo, holder: null, batch, error: e.message });
      continue;
    }
    const held = Boolean(lane && lane.holder_session_id);
    if (!held && batch === 0) continue;
    if (!held) { rows.push({ repo, holder: null, batch }); continue; }
    const h = holderStatus(sessions, lane.holder_session_id);
    rows.push({
      repo,
      holder: {
        session_id: lane.holder_session_id,
        name: lane.holder_name,
        since: lane.since,
        age_ms: Math.max(0, now - Date.parse(lane.since)),
        live: h.live,
        why: h.why,
      },
      batch,
    });
  }
  return rows;
}

export function renderClaim(result) {
  const lines = [
    `Ship lane ${result.repo} ${result.reclaimed ? 'already yours' : 'claimed'} by ${result.holder.name || result.holder.session_id} (since ${result.since}).`,
  ];
  if (result.batch.length === 0) {
    lines.push('Batch: none ready (no shipping-stage ticket lists this repo).');
  } else {
    lines.push(`Batch (${result.batch.length}, ship in this order, one at a time; the full suite runs once per ticket):`);
    result.batch.forEach((t, i) => lines.push(`  ${i + 1}. ${t.id}  ${t.title}`, `     ${t.hint}`));
  }
  lines.push(`When done: bobby conductor ship release ${result.repo}`);
  return lines.join('\n');
}

export function renderRelease(result) {
  if (result.kind === 'free') return `Ship lane ${result.repo} is already free.`;
  if (result.kind === 'released') return `Released ship lane ${result.repo}.`;
  const o = result.overrode;
  return [
    `Forced release of ship lane ${result.repo}.`,
    `  overrode: held by ${o.holder_name || '(unnamed)'} (${o.holder_session_id}) since ${o.since}; that session was ${o.holder_live ? 'LIVE' : 'stale'} (${o.holder_why})`,
  ].join('\n');
}
