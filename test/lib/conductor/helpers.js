// Shared fixtures for the conductor tests (not a test file: jest only runs *.test.js).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { initStudio, createProject } from '../../../lib/studio.js';
import { createTicket, moveTicket, updateTicket } from '../../../lib/tickets.js';

/** A temp studio with projects `alpha` (AL) and `beta` (BE), a hook-state dir and no conductor.yml. */
export function makeStudio() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-conductor-'));
  initStudio(root);
  // The studio is itself a git repo: `status` lists its worktrees.
  execFileSync('git', ['init', '-q', root]);
  createProject(root, 'alpha', { prefix: 'AL' });
  createProject(root, 'beta', { prefix: 'BE' });
  const hookDir = path.join(root, 'hook-state');
  fs.mkdirSync(hookDir);
  return { root, hookDir };
}

export function writeConductorYml(root, text) {
  fs.mkdirSync(path.join(root, '.bobby'), { recursive: true });
  fs.writeFileSync(path.join(root, '.bobby', 'conductor.yml'), text);
}

export function validYml(hookDir, projects = ['alpha', 'beta'], governor = { min_free_ram_mb: 4096, max_docker_stacks: 4, min_free_disk_gb: 1 }, reaper = { stack_idle_hours: 2, worktree_scratch_paths: ['coverage/', 'tmp/', 'log/'] }, wip = { max_lanes: 6 }, claims = { ttl_minutes: 30 }, inbox = { stale_minutes: 30 }, worktreeTimer = { interval_minutes: 60, log_file: '/tmp/bobby-reap-worktrees.log' }) {
  return `projects:\n${projects.map(p => `  - ${p}`).join('\n')}\nhook_state_dir: ${hookDir}\n`
    + `governor:\n  min_free_ram_mb: ${governor.min_free_ram_mb}\n  max_docker_stacks: ${governor.max_docker_stacks}\n  min_free_disk_gb: ${governor.min_free_disk_gb}\n`
    + `reaper:\n  stack_idle_hours: ${reaper.stack_idle_hours}\n  worktree_scratch_paths: ${JSON.stringify(reaper.worktree_scratch_paths)}\n`
    + `wip:\n  max_lanes: ${wip.max_lanes}\n`
    + `claims:\n  ttl_minutes: ${claims.ttl_minutes}\n`
    + `inbox:\n  stale_minutes: ${inbox.stale_minutes}\n`
    + `worktree_timer:\n  interval_minutes: ${worktreeTimer.interval_minutes}\n  log_file: ${worktreeTimer.log_file}\n`;
}

/** vm_stat text for a 16 KB-page machine. Pages are given in MB so tests read in MB. */
export function vmStatText({ freeMb = 100, specMb = 50, fileMb = 1000, purgeMb = 50, inactiveMb = 9000, storedMb = 20000, compressorMb = 8000 } = {}) {
  const pages = (mb) => Math.round((mb * 1024 * 1024) / 16384);
  return [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    `Pages free:                                   ${pages(freeMb)}.`,
    'Pages active:                                 986626.',
    `Pages inactive:                               ${pages(inactiveMb)}.`,
    `Pages speculative:                            ${pages(specMb)}.`,
    'Pages throttled:                                   0.',
    'Pages wired down:                             195509.',
    `Pages purgeable:                              ${pages(purgeMb)}.`,
    '"Translation faults":                    20720053954.',
    `File-backed pages:                            ${pages(fileMb)}.`,
    'Anonymous pages:                             1487211.',
    `Pages stored in compressor:                  ${pages(storedMb)}.`,
    `Pages occupied by compressor:                 ${pages(compressorMb)}.`,
    '',
  ].join('\n');
}

/** One `docker ps --format json` line for a container of compose project `project`. */
export function psLine(id, project) {
  const labels = [
    'com.docker.compose.config-hash=abc',
    'com.docker.compose.project.config_files=/w/docker-compose.yml,/w/docker-compose.override.yml',
    ...(project ? [`com.docker.compose.project=${project}`] : []),
    'com.docker.compose.service=web',
  ].join(',');
  return JSON.stringify({ ID: id, Names: `${id}-1`, State: 'running', Labels: labels });
}

/** Create tickets in `project` through the library: [{title, stage?, blocked?}]. */
export function seedTickets(root, project, tickets) {
  const dir = path.join(root, '.bobby', project, 'tickets');
  const prefix = project === 'alpha' ? 'AL' : 'BE';
  for (const t of tickets) {
    const { id } = createTicket(dir, { prefix, title: t.title });
    if (t.stage && t.stage !== 'backlog') moveTicket(dir, id, t.stage, 'test');
    if (t.blocked) updateTicket(dir, id, { blocked: true, blocked_reason: 'waiting' });
  }
}

export const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

/** Raw `claude agents --json --all` fixture: working, blocked, done, plus odd states. */
export function agentsFixture() {
  const mk = (id, name, state, hoursAgo, extra = {}) => ({
    id,
    sessionId: `${id}-0000-4000-8000-000000000000`,
    name,
    cwd: '/studio',
    kind: 'background',
    startedAt: NOW - hoursAgo * HOUR,
    ...(state ? { state, pid: 4242 } : {}),
    ...extra,
  });
  return [
    mk('aaaa1111', 'lane one', 'working', 2),
    mk('bbbb2222', 'lane two', 'blocked', 5, { waitingFor: 'approve edit' }),
    mk('cccc3333', 'lane three', 'done', 30),
    mk('dddd4444', 'lane four', 'stopped', 50),
    { ...mk('eeee5555', 'interactive', undefined, 1, { kind: 'interactive' }), id: undefined, sessionId: 'eeee5555-0000-4000-8000-000000000000' },
  ];
}
