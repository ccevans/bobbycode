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
const INIT_GOVERNOR = { min_free_ram_mb: 4096, max_docker_stacks: 4 };
// BOB-177: CC set 2 hours in the BOB-173 scope.
const INIT_REAPER = { stack_idle_hours: 2 };

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
  return { projects: [...projects], hook_state_dir: dir, governor, reaper };
}

function validateReaper(reaper, file) {
  if (reaper === undefined || reaper === null) throw fail(file, 'reaper.stack_idle_hours', 'is missing');
  if (typeof reaper !== 'object' || Array.isArray(reaper)) throw fail(file, 'reaper', 'must be a mapping');
  if (!('stack_idle_hours' in reaper) || reaper.stack_idle_hours === null) throw fail(file, 'reaper.stack_idle_hours', 'is missing');
  const h = reaper.stack_idle_hours;
  if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
    throw fail(file, 'reaper.stack_idle_hours', 'must be a positive number of hours');
  }
  return { stack_idle_hours: h };
}

const GOVERNOR_KEYS = ['min_free_ram_mb', 'max_docker_stacks'];

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
  };
  const body = [
    '# bobby conductor config. Written by `bobby conductor init`; every key is required.',
    '# A missing or invalid key is an error, never a default.',
    '# projects: ticket boards counted by `bobby conductor status`.',
    '# hook_state_dir: where session hooks write <sessionId>.handoff markers.',
    '# governor.min_free_ram_mb: `conductor check` refuses below this much free RAM (CC, 2026-11-08).',
    '# governor.max_docker_stacks: `conductor check stack` refuses at this many running stacks (CC, 2026-11-08).',
    '# reaper.stack_idle_hours: `conductor reap --stacks` stops a ticket stack idle this long with no working lane (CC, 2026-11-08).',
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
