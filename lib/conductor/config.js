// lib/conductor/config.js
//
// <studio root>/.bobby/conductor.yml. Every key is required: a missing file or a
// missing/invalid key is an Error that names the file and the key. Nothing here
// supplies a default; `bobby conductor init` is the only place values are chosen.
//
// Later conductor tickets add their own required keys and must extend
// INIT_KEYS / validateConfig / `conductor init` together.

import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { listStudioProjects } from '../config.js';

export const CONDUCTOR_FILE = 'conductor.yml';

// The numbers `conductor init` writes. CC's decision, recorded on BOB-173 (2026-11-08),
// for the M4 (48 GB). This is the only place they are chosen; loading never falls back to them.
// BOB-189: CC set 50 GB free disk (2026-11-08, the day the disk hit 99%).
const INIT_GOVERNOR = { min_free_ram_mb: 4096, max_docker_stacks: 4, min_free_disk_gb: 50 };
// BOB-177: CC set 2 hours in the BOB-173 scope.
// BOB-193: CC named coverage/, tmp/ and log/ as scratch (2026-11-10): changes confined to them do
// not keep a done ticket's worktree.
const INIT_REAPER = { stack_idle_hours: 2, worktree_scratch_paths: ['coverage/', 'tmp/', 'log/'] };
// BOB-193: CC picked an hourly worktree reap on the M4 (2026-11-10). The log sits next to hook-state.
const INIT_WORKTREE_TIMER_MINUTES = 60;
// BOB-180: CC set 6 lanes (BOB-173 decision, 2026-11-08). The claim TTL was not named by CC;
// 30 minutes covers the gap between a lane pulling a ticket and its session showing the ID.
const INIT_WIP = { max_lanes: 6 };
const INIT_CLAIMS = { ttl_minutes: 30 };
// BOB-183: a message undelivered this long is flagged on `conductor status`. Chosen here, once.
const INIT_INBOX = { stale_minutes: 30 };

/**
 * Nearest ancestor of `startDir` whose .bobbyrc.yml carries a `studio:` key.
 * Walks past non-studio .bobbyrc.yml files so a repo checkout under
 * <studio>/worktrees/ still resolves to the studio.
 */
export function findStudioRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    const rc = path.join(dir, '.bobbyrc.yml');
    if (fs.existsSync(rc)) {
      const parsed = YAML.parse(fs.readFileSync(rc, 'utf8')) || {};
      if (parsed.studio) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`bobby conductor must run inside a studio (no .bobbyrc.yml with a "studio:" key above ${startDir})`);
    }
    dir = parent;
  }
}

export function conductorFilePath(studioRoot) {
  return path.join(studioRoot, '.bobby', CONDUCTOR_FILE);
}

function fail(file, key, problem) {
  return new Error(`${file}: key "${key}" ${problem}`);
}

function validateConfig(parsed, file) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file}: expected a YAML mapping of keys`);
  }
  if (!('projects' in parsed) || parsed.projects === null) throw fail(file, 'projects', 'is missing');
  const { projects } = parsed;
  if (!Array.isArray(projects) || projects.length === 0 || !projects.every(p => typeof p === 'string' && p.trim())) {
    throw fail(file, 'projects', 'must be a non-empty list of project names');
  }
  if (!('hook_state_dir' in parsed) || parsed.hook_state_dir === null) throw fail(file, 'hook_state_dir', 'is missing');
  const dir = parsed.hook_state_dir;
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    throw fail(file, 'hook_state_dir', 'must be an absolute directory path');
  }
  const governor = validateGovernor(parsed.governor, file);
  const reaper = validateReaper(parsed.reaper, file);
  const wip = validatePositiveInt(parsed.wip, file, 'wip', 'max_lanes');
  const claims = validatePositiveInt(parsed.claims, file, 'claims', 'ttl_minutes');
  const inbox = validateInbox(parsed.inbox, file);
  const worktree_timer = validateWorktreeTimer(parsed.worktree_timer, file);
  return { projects: [...projects], hook_state_dir: dir, governor, reaper, wip, claims, inbox, worktree_timer };
}

// A section with one required positive-integer key: { <key>: n }.
function validatePositiveInt(section, file, name, key) {
  if (section === undefined || section === null) throw fail(file, `${name}.${key}`, 'is missing');
  if (typeof section !== 'object' || Array.isArray(section)) throw fail(file, name, 'must be a mapping');
  if (!(key in section) || section[key] === null) throw fail(file, `${name}.${key}`, 'is missing');
  const n = section[key];
  if (!Number.isInteger(n) || n <= 0) throw fail(file, `${name}.${key}`, 'must be a positive integer');
  return { [key]: n };
}

function validateInbox(inbox, file) {
  if (inbox === undefined || inbox === null) throw fail(file, 'inbox.stale_minutes', 'is missing');
  if (typeof inbox !== 'object' || Array.isArray(inbox)) throw fail(file, 'inbox', 'must be a mapping');
  if (!('stale_minutes' in inbox) || inbox.stale_minutes === null) throw fail(file, 'inbox.stale_minutes', 'is missing');
  const m = inbox.stale_minutes;
  if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0) {
    throw fail(file, 'inbox.stale_minutes', 'must be a positive number of minutes');
  }
  return { stale_minutes: m };
}

function validateReaper(reaper, file) {
  if (reaper === undefined || reaper === null) throw fail(file, 'reaper.stack_idle_hours', 'is missing');
  if (typeof reaper !== 'object' || Array.isArray(reaper)) throw fail(file, 'reaper', 'must be a mapping');
  if (!('stack_idle_hours' in reaper) || reaper.stack_idle_hours === null) throw fail(file, 'reaper.stack_idle_hours', 'is missing');
  const h = reaper.stack_idle_hours;
  if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
    throw fail(file, 'reaper.stack_idle_hours', 'must be a positive number of hours');
  }
  const scratch = validateScratchPaths(reaper, file);
  return { stack_idle_hours: h, worktree_scratch_paths: scratch };
}

// Folders, relative to a worktree's root, whose changes `reap --worktrees` treats as clean.
// An empty list is a valid, explicit "nothing is scratch". Entries load exactly as written.
function validateScratchPaths(reaper, file) {
  const key = 'reaper.worktree_scratch_paths';
  if (!('worktree_scratch_paths' in reaper) || reaper.worktree_scratch_paths === null) throw fail(file, key, 'is missing');
  const list = reaper.worktree_scratch_paths;
  if (!Array.isArray(list)) throw fail(file, key, 'must be a list of folders relative to a worktree (e.g. coverage/)');
  return list.map((entry) => {
    if (typeof entry !== 'string') throw fail(file, key, 'must list folder paths as strings');
    const p = entry.replace(/\/+$/, '');
    const parts = p.split('/');
    if (!p || p.startsWith('/') || parts.some(part => part === '' || part === '.' || part === '..')) {
      throw fail(file, key, `has "${entry}": each entry must be a folder relative to the worktree root, without "." or ".."`);
    }
    return entry;
  });
}

function validateWorktreeTimer(timer, file) {
  if (timer === undefined || timer === null) throw fail(file, 'worktree_timer.interval_minutes', 'is missing');
  if (typeof timer !== 'object' || Array.isArray(timer)) throw fail(file, 'worktree_timer', 'must be a mapping');
  if (!('interval_minutes' in timer) || timer.interval_minutes === null) throw fail(file, 'worktree_timer.interval_minutes', 'is missing');
  const m = timer.interval_minutes;
  if (!Number.isInteger(m) || m <= 0) throw fail(file, 'worktree_timer.interval_minutes', 'must be a positive integer');
  if (!('log_file' in timer) || timer.log_file === null) throw fail(file, 'worktree_timer.log_file', 'is missing');
  const log = timer.log_file;
  if (typeof log !== 'string' || !path.isAbsolute(log)) throw fail(file, 'worktree_timer.log_file', 'must be an absolute file path');
  return { interval_minutes: m, log_file: log };
}

const GOVERNOR_KEYS = ['min_free_ram_mb', 'max_docker_stacks', 'min_free_disk_gb'];

function validateGovernor(governor, file) {
  if (governor === undefined || governor === null) throw fail(file, `governor.${GOVERNOR_KEYS[0]}`, 'is missing');
  if (typeof governor !== 'object' || Array.isArray(governor)) throw fail(file, 'governor', 'must be a mapping');
  const out = {};
  for (const key of GOVERNOR_KEYS) {
    if (!(key in governor) || governor[key] === null) throw fail(file, `governor.${key}`, 'is missing');
    const n = governor[key];
    if (!Number.isInteger(n) || n <= 0) throw fail(file, `governor.${key}`, 'must be a positive integer');
    out[key] = n;
  }
  return out;
}

/** Read and validate conductor.yml. Throws naming the file (and key). */
export function loadConductorConfig(studioRoot) {
  const file = conductorFilePath(studioRoot);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} does not exist. Run \`bobby conductor init\` to write it.`);
  }
  let parsed;
  try {
    parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: invalid YAML (${e.message})`);
  }
  return validateConfig(parsed, file);
}

/**
 * Write conductor.yml with every key explicit. Refuses to overwrite: the
 * exclusive-create flag makes the existence check and the write one step.
 * `projects` defaults to every project in the studio only when the caller
 * passes none, and the result is written out, never read back as a default.
 */
export function initConductorConfig(studioRoot, { projects } = {}) {
  const file = conductorFilePath(studioRoot);
  const known = listStudioProjects(studioRoot);
  const chosen = projects && projects.length ? projects : known;
  if (chosen.length === 0) throw new Error(`No projects found in ${studioRoot}/.bobby; cannot write ${file}`);
  const unknown = chosen.filter(p => !known.includes(p));
  if (unknown.length) {
    throw new Error(`Unknown project(s) ${unknown.join(', ')}. Studio projects: ${known.join(', ')}`);
  }
  const values = {
    projects: chosen,
    hook_state_dir: path.join(os.homedir(), '.bobby', 'hook-state'),
    governor: { ...INIT_GOVERNOR },
    reaper: { ...INIT_REAPER },
    wip: { ...INIT_WIP },
    claims: { ...INIT_CLAIMS },
    inbox: { ...INIT_INBOX },
    worktree_timer: {
      interval_minutes: INIT_WORKTREE_TIMER_MINUTES,
      log_file: path.join(os.homedir(), '.bobby', 'conductor-reap-worktrees.log'),
    },
  };
  const body = [
    '# bobby conductor config. Written by `bobby conductor init`; every key is required.',
    '# A missing or invalid key is an error, never a default.',
    '# projects: ticket boards counted by `bobby conductor status`.',
    '# hook_state_dir: where session hooks write <sessionId>.handoff markers.',
    '# governor.min_free_ram_mb: `conductor check` refuses below this much free RAM (CC, 2026-11-08).',
    '# governor.max_docker_stacks: `conductor check stack` refuses at this many running stacks (CC, 2026-11-08).',
    '# governor.min_free_disk_gb: `conductor check` and `conductor next` refuse below this much free disk on the studio volume (CC, 2026-11-08).',
    '# reaper.stack_idle_hours: `conductor reap --stacks` stops a ticket stack idle this long with no working lane (CC, 2026-11-08).',
    '# reaper.worktree_scratch_paths: `conductor reap --worktrees` treats changes confined to these folders (relative to a worktree) as clean (CC, 2026-11-10).',
    '# wip.max_lanes: `conductor next` refuses when this many live lane sessions (working or waiting on CC) exist (CC, 2026-11-08).',
    '# claims.ttl_minutes: a ticket `conductor next` handed out is not handed out again for this long.',
    '# inbox.stale_minutes: `conductor status` flags a message undelivered this long (BOB-183).',
    '# worktree_timer: `conductor reap --worktrees --print-plist` prints a launchd job that runs `reap --worktrees --apply` every interval_minutes, logging to log_file (CC, 2026-11-10).',
    YAML.stringify(values),
  ].join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, body, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error(`${file} already exists; not overwriting it.`);
    throw e;
  }
  return { file, values };
}
