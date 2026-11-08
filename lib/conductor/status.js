// lib/conductor/status.js
//
// Builds the read-only status report: lanes grouped by state, what waits on CC,
// handoff markers and board counts. `buildStatus` returns the data that `--json`
// prints; `renderStatus` formats that same data as text.

import os from 'os';
import { readAgents, classifySessions, groupSessions } from './sessions.js';
import { boardCounts } from './board.js';
import { loadConductorConfig } from './config.js';
import { readMemory } from './resources.js';
import { readDisk } from './disk.js';
import { scanWorktrees, readSizeCache, measureSizes, worktreeSummary, formatKb } from './worktrees.js';
import { readStacks, readStoppedStacks, boardTickets, mapStacks, mapStoppedStacks } from './stacks.js';
import { inboxDir, inboxStatus } from './inbox.js';
import { shipBoardTickets, shipLanesView } from './ship-lane.js';
import { bold, dim } from '../colors.js';

/**
 * `sizes: true` runs `du` over every worktree (slow, minutes) and refreshes the cache; without it
 * the worktree section shows only the sizes already cached and never measures anything.
 */
export function buildStatus(studioRoot, { run, now = Date.now(), sizes = false, home, statfs } = {}) {
  const config = loadConductorConfig(studioRoot);
  const sessions = classifySessions(readAgents({ run }), { hookStateDir: config.hook_state_dir, now });
  const groups = groupSessions(sessions);
  const memory = readMemory({ run });
  const disk = readDisk(studioRoot, { statfs });
  const scan = scanWorktrees(studioRoot, { run, home });
  const sizeCache = sizes
    ? measureSizes(scan.worktrees.map(w => w.path), { hookStateDir: config.hook_state_dir, run, now })
    : readSizeCache(config.hook_state_dir);
  const docker = readStacks({ run, now });
  const tickets = boardTickets(studioRoot, config.projects);
  const stacks = mapStacks(docker.stacks, { tickets, sessions });
  const stopped = mapStoppedStacks(
    readStoppedStacks({ run, runningProjects: docker.stacks.map(s => s.project) }),
    { tickets },
  );
  return {
    generated_at: new Date(now).toISOString(),
    working: groups.working,
    waiting_on_cc: groups.waiting_on_cc,
    done: groups.done,
    stopped: groups.stopped,
    interactive: groups.interactive,
    unknown: groups.unknown,
    handoffs: sessions.filter(s => s.handed_off),
    inbox: inboxStatus(inboxDir(studioRoot), sessions, { now, staleMinutes: config.inbox.stale_minutes }),
    ship_lanes: shipLanesView({ studioRoot, sessions, tickets: shipBoardTickets(studioRoot, config.projects), now }),
    board: boardCounts(studioRoot, config.projects),
    machine: {
      ...memory,
      min_free_ram_mb: config.governor.min_free_ram_mb,
      disk_total_gb: disk.total_gb,
      disk_free_gb: disk.free_gb,
      min_free_disk_gb: config.governor.min_free_disk_gb,
    },
    worktrees: worktreeSummary(scan, sizeCache),
    stacks: { max: config.governor.max_docker_stacks, standalone_containers: docker.standalone_containers, list: stacks, stopped },
  };
}

export function formatAge(ms) {
  if (ms === null) return '?';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Hours since the stack's newest container started, one decimal.
function formatHours(ms) {
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function shortPath(p) {
  if (!p) return '?';
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

// Interactive sessions have no short background id; show the sessionId prefix.
function laneId(s) {
  return s.id || s.session_id.slice(0, 8);
}

function laneLine(s, { detail = false } = {}) {
  const name = s.name || '(unnamed)';
  const parts = [`  ${laneId(s)}  ${name}`, dim(`${formatAge(s.age_ms)}  ${shortPath(s.cwd)}`)];
  if (detail && s.waiting_for) parts.push(dim(`waiting for: ${s.waiting_for}`));
  if (s.kind === 'interactive' && s.raw_state == null) parts.push(dim(`[interactive, status: ${s.status ?? 'none'}]`));
  else if (s.state === 'unknown') parts.push(dim(`[state: ${s.raw_state ?? 'none'}${s.kind ? `, ${s.kind}` : ''}]`));
  return parts.join('  ');
}

function section(lines, title, sessions, opts) {
  lines.push(`${bold(title)} ${dim(`(${sessions.length})`)}`);
  if (sessions.length === 0) lines.push(dim('  none'));
  for (const s of sessions) lines.push(laneLine(s, opts));
  lines.push('');
}

export function renderStatus(status) {
  const lines = ['', bold('BOBBY CONDUCTOR'), dim(`  ${status.generated_at}`), ''];
  section(lines, 'WORKING', status.working);
  section(lines, 'WAITING ON CC', status.waiting_on_cc, { detail: true });
  section(lines, 'DONE', status.done);
  // Stopped sessions are a count with the raw state broken out; a failed one is listed, since
  // it ended without finishing.
  const byState = {};
  for (const s of status.stopped) byState[s.raw_state] = (byState[s.raw_state] || 0) + 1;
  const breakdown = Object.entries(byState).map(([state, n]) => `${state} ${n}`).join(', ');
  lines.push(`${bold('STOPPED')} ${dim(`(${status.stopped.length})  already ended, no live process; not reaped${breakdown ? `: ${breakdown}` : ''}`)}`);
  for (const s of status.stopped.filter(x => x.raw_state === 'failed')) lines.push(laneLine(s));
  lines.push('');
  section(lines, 'INTERACTIVE', status.interactive);
  section(lines, 'UNKNOWN STATE', status.unknown);

  lines.push(`${bold('HANDOFFS')} ${dim(`(${status.handoffs.length})`)}`);
  if (status.handoffs.length === 0) lines.push(dim('  none'));
  for (const s of status.handoffs) {
    const successor = s.successor ? `successor ${s.successor} ${s.successor_live ? 'live' : 'not live'}` : 'no successor id in marker';
    // A done session with no live pid is already stopped (BOB-185): not an orphan, same rule as the reaper.
    const stopped = s.state === 'done' && !s.live;
    const orphaned = s.successor_live || stopped ? '' : `  ${bold('orphaned handoff')}`;
    lines.push(`  ${laneId(s)}  ${s.name || '(unnamed)'}  ${dim(successor)}${orphaned}`);
  }
  lines.push('');

  const inbox = status.inbox;
  lines.push(`${bold('INBOX')} ${dim(`(${inbox.sessions.length} session${inbox.sessions.length === 1 ? '' : 's'} with undelivered messages)`)}`);
  if (inbox.missing) lines.push(dim(`  no inbox directory at ${shortPath(inbox.dir)}`));
  else if (inbox.sessions.length === 0) lines.push(dim('  none'));
  for (const e of inbox.sessions) {
    const who = `${e.session_id.slice(0, 8)}  ${e.name || '(unnamed)'}`;
    if (e.error) {
      lines.push(`  ${who}  ${bold('unreadable inbox')}  ${dim(e.error)}`);
      continue;
    }
    const flag = e.flag ? `  ${bold(e.flag)}` : '';
    lines.push(`  ${who}  ${e.undelivered} undelivered  ${dim(`oldest ${formatAge(e.oldest_age_ms)}`)}${flag}`);
  }
  lines.push('');

  lines.push(`${bold('SHIP LANES')} ${dim(`(${status.ship_lanes.length})`)}`);
  if (status.ship_lanes.length === 0) lines.push(dim('  none held, nothing waiting'));
  for (const l of status.ship_lanes) {
    if (l.error) { lines.push(`  ${l.repo}  ${bold('unreadable lane')}  ${dim(l.error)}`); continue; }
    const holder = l.holder
      ? `held by ${l.holder.name || '(unnamed)'} ${dim(`${formatAge(l.holder.age_ms)}`)}${l.holder.live ? '' : `  ${bold('stale lock')} ${dim(`(${l.holder.why})`)}`}`
      : 'free';
    lines.push(`  ${l.repo}  ${holder}  ${dim(`${l.batch} ready to ship`)}`);
  }
  lines.push('');

  lines.push(bold('BOARD'));
  for (const [project, b] of Object.entries(status.board)) {
    const counts = Object.entries(b.stages).filter(([, n]) => n > 0).map(([stage, n]) => `${stage} ${n}`);
    const blocked = b.blocked ? `  ${dim(`(${b.blocked} flagged blocked)`)}` : '';
    lines.push(`  ${bold(project)}  ${counts.join(' · ') || 'no tickets'}${blocked}`);
  }
  lines.push('');

  const m = status.machine;
  lines.push(bold('MACHINE'));
  lines.push(`  RAM  free ${m.free_mb} MB of ${m.total_mb} MB  ${dim(`(lane floor ${m.min_free_ram_mb} MB)`)}`);
  lines.push(`  DISK  free ${m.disk_free_gb} GB of ${m.disk_total_gb} GB  ${dim(`(lane floor ${m.min_free_disk_gb} GB)`)}${m.disk_free_gb < m.min_free_disk_gb ? `  ${bold('below the floor: lanes refused')}` : ''}`);
  lines.push(`  compressor  holds ${m.compressed_mb} MB, takes ${m.compressor_mb} MB of RAM`);
  lines.push('');

  const wt = status.worktrees;
  lines.push(`${bold('WORKTREES')} ${dim(`(${wt.total} across ${wt.repos} repos; ${wt.non_worktree_folders.length} other folder(s) that are not git worktrees; reap with \`conductor reap --worktrees\`)`)}`);
  if (wt.by_stage.length === 0) lines.push(dim('  none'));
  for (const g of wt.by_stage) {
    let size = '';
    if (g.sized === g.count) size = `  ${dim(formatKb(g.size_kb))}`;
    else if (g.sized > 0) size = `  ${dim(`${formatKb(g.size_kb)} (${g.sized} of ${g.count} sized)`)}`;
    lines.push(`  ${g.stage}  ${g.count}${size}`);
  }
  if (wt.sizes_measured_at) lines.push(dim(`  sizes: du, nominal, cached ${wt.sizes_measured_at}; refresh with \`conductor status --sizes\` (slow)`));
  else lines.push(dim('  sizes: not measured; `conductor status --sizes` measures them (slow) and caches the result'));
  lines.push('');

  const st = status.stacks;
  lines.push(`${bold('STACKS')} ${dim(`(${st.list.length} of max ${st.max})`)}`);
  if (st.list.length === 0) lines.push(dim('  none'));
  for (const s of st.list) {
    const mapped = s.unmapped ? 'unmapped' : `${s.ticket}  lane ${s.lane}`;
    lines.push(`  ${s.project}  ${mapped}  ${dim(`${s.containers} container${s.containers === 1 ? '' : 's'}  idle ${formatHours(s.idle_ms)}`)}`);
  }
  if (st.standalone_containers) lines.push(dim(`  + ${st.standalone_containers} running container(s) outside compose`));
  if (st.stopped.length) {
    lines.push(`${bold('STOPPED STACKS')} ${dim(`(${st.stopped.length}, restart by hand with docker compose -p <project> start)`)}`);
    for (const s of st.stopped) {
      lines.push(`  ${s.project}  stopped  ${s.unmapped ? 'unmapped' : s.ticket}  ${dim(`${s.containers} container${s.containers === 1 ? '' : 's'}`)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
