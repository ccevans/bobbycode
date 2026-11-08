// lib/conductor/worktrees.js
//
// Read-only view of every git worktree in the studio (BOB-189). Worktrees are found with
// `git worktree list --porcelain` in the studio repo and in every repo named in the studio's
// .bobbyrc.yml `repos:`, never by guessing directories. Lanes hand-scaffold worktrees in
// several places (worktrees/, worktrees/robinflow/, repos/<app>/worktrees/,
// .claude/worktrees/, ~/worktrees), so the folders in those places that git does not
// know are listed too (and never touched).
//
// A worktree maps to a ticket by the ticket ID in its FOLDER name (RF-1123-ui, bob-189,
// LR-141-api), matched case-insensitively against the tickets on every studio board. The
// stage of that ticket is the stage the worktree is counted under.
//
// Sizes are NOT measured here unless asked: `du` over ~200 worktrees takes minutes, and
// `status` has to stay fast. measureSizes() is the slow path; the result is cached in
// <hook_state_dir>/worktree-sizes.json and status shows the cached figures.

import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { run as defaultRun } from './exec.js';
import { boardTickets } from './stacks.js';
import { listStudioProjects } from '../config.js';

const SIZE_CACHE_FILE = 'worktree-sizes.json';
const TICKET_TOKEN_RE = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]*)-(\d+)(?![0-9])/g;

// .native resolves the on-disk case on macOS's case-insensitive volumes (see worktree-reaper.js).
const real = (p) => {
  try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
};

/**
 * The repos whose worktrees are in scope: the studio repo itself, then every `repos:` entry
 * of the studio's .bobbyrc.yml. [{ name, path }] with absolute paths. A listed repo whose
 * folder is missing is an error, not a skip.
 */
export function studioRepos(studioRoot) {
  const out = [{ name: '(studio)', path: studioRoot }];
  const rc = path.join(studioRoot, '.bobbyrc.yml');
  const parsed = YAML.parse(fs.readFileSync(rc, 'utf8')) || {};
  const repos = parsed.repos === undefined || parsed.repos === null ? {} : parsed.repos;
  if (typeof repos !== 'object' || Array.isArray(repos)) throw new Error(`${rc}: key "repos" must be a mapping`);
  const seen = new Set([real(studioRoot)]);
  for (const [name, entry] of Object.entries(repos)) {
    if (!entry || typeof entry.path !== 'string' || !entry.path.trim()) {
      throw new Error(`${rc}: repos.${name} has no "path"`);
    }
    const abs = path.resolve(studioRoot, entry.path);
    if (!fs.existsSync(abs)) throw new Error(`${rc}: repos.${name} path ${abs} does not exist`);
    if (seen.has(real(abs))) continue;
    seen.add(real(abs));
    out.push({ name, path: abs });
  }
  return out;
}

/** Parse `git worktree list --porcelain` text. The first block is the repo's main worktree. */
export function parseWorktreeList(text, repoLabel = 'repo') {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const entries = blocks.map((block) => {
    const e = { path: null, branch: null, bare: false, detached: false, locked: null, prunable: null };
    for (const line of block.split('\n')) {
      const [key, ...rest] = line.split(' ');
      const value = rest.join(' ');
      if (key === 'worktree') e.path = value;
      else if (key === 'branch') e.branch = value.replace(/^refs\/heads\//, '');
      else if (key === 'bare') e.bare = true;
      else if (key === 'detached') e.detached = true;
      else if (key === 'locked') e.locked = value || 'locked';
      else if (key === 'prunable') e.prunable = value || 'prunable';
    }
    if (!e.path) throw new Error(`git worktree list for ${repoLabel} returned a block with no "worktree" line`);
    if (e.path.startsWith('"')) throw new Error(`git worktree list for ${repoLabel} returned a quoted path (${e.path}); refusing to guess its real name`);
    return e;
  });
  if (entries.length === 0) throw new Error(`git worktree list for ${repoLabel} returned nothing`);
  return entries;
}

/**
 * Every linked worktree of every repo: [{ repo, repo_path, path, branch, detached, bare,
 * locked, prunable }], plus `registered`, the set of every registered path (main ones too).
 * A failing git throws with git's message.
 */
export function listWorktrees(repos, { run = defaultRun } = {}) {
  const worktrees = [];
  const registered = new Set();
  for (const repo of repos) {
    const entries = parseWorktreeList(run('git', ['-C', repo.path, 'worktree', 'list', '--porcelain']), repo.name);
    entries.forEach((e, i) => {
      registered.add(real(e.path));
      if (i === 0) return;
      worktrees.push({ repo: repo.name, repo_path: repo.path, ...e });
    });
  }
  return { worktrees, registered };
}

/** Ticket keys (PREFIX-n, zero padding dropped) named in a folder name that sit on a board. */
export function ticketsInName(name, tickets) {
  const found = [];
  for (const m of name.matchAll(TICKET_TOKEN_RE)) {
    const hit = tickets.get(`${m[1].toUpperCase()}-${Number(m[2])}`);
    if (hit && !found.some(f => f.id === hit.id)) found.push(hit);
  }
  return found;
}

/**
 * Decorate worktrees with the ticket(s) their folder name carries and one `stage` to count
 * them under: 'no ticket' when the name has no ticket on a board; 'done' only when every
 * ticket named is done; otherwise the stage of the first ticket that is not done.
 */
export function classifyWorktrees(worktrees, tickets) {
  return worktrees.map((w) => {
    const found = ticketsInName(path.basename(w.path), tickets);
    const open = found.find(t => t.stage !== 'done');
    return {
      ...w,
      ticket_ids: found.map(t => t.id),
      stage: found.length === 0 ? 'no ticket' : (open ? open.stage : 'done'),
    };
  });
}

/** The places lanes put worktrees by hand (see the file header). */
export function containerDirs(studioRoot, repos, home = os.homedir()) {
  return [
    path.join(studioRoot, 'worktrees'),
    path.join(studioRoot, 'worktrees', 'robinflow'),
    ...repos.filter(r => r.path !== studioRoot).map(r => path.join(r.path, 'worktrees')),
    path.join(studioRoot, '.claude', 'worktrees'),
    path.join(home, 'worktrees'),
  ];
}

/** Directories one level inside the container dirs that git does not register as a worktree or repo. */
export function nonWorktreeFolders(containers, registered) {
  const containerReal = new Set(containers.map(real));
  const out = [];
  const seen = new Set();
  for (const dir of containers) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      const r = real(full);
      if (registered.has(r) || containerReal.has(r) || seen.has(r)) continue;
      seen.add(r);
      out.push(full);
    }
  }
  return out;
}

/** The studio's boards: every project, not only the ones counted by `status`. */
export function allBoardTickets(studioRoot) {
  return boardTickets(studioRoot, listStudioProjects(studioRoot));
}

/** Everything read-only the status board and the reaper both need. */
export function scanWorktrees(studioRoot, { run = defaultRun, home = os.homedir() } = {}) {
  const repos = studioRepos(studioRoot);
  const { worktrees, registered } = listWorktrees(repos, { run });
  const classified = classifyWorktrees(worktrees, allBoardTickets(studioRoot));
  return {
    repos,
    worktrees: classified,
    non_worktree_folders: nonWorktreeFolders(containerDirs(studioRoot, repos, home), registered),
  };
}

// ---- sizes (slow path, cached) ----

export function sizeCachePath(hookStateDir) {
  return path.join(hookStateDir, SIZE_CACHE_FILE);
}

/** { <path>: { kb, measured_at } }. A missing file is an empty cache; an unreadable one is an error. */
export function readSizeCache(hookStateDir) {
  const file = sizeCachePath(hookStateDir);
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: unreadable size cache (${e.message}); delete it and re-measure with --sizes`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || !Object.values(parsed).every(v => v && Number.isFinite(v.kb) && Number.isFinite(Date.parse(v.measured_at)))) {
    throw new Error(`${file}: size cache has an unexpected shape; delete it and re-measure with --sizes`);
  }
  return parsed;
}

function writeSizeCache(hookStateDir, cache) {
  const file = sizeCachePath(hookStateDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * `du -sk` each path (nominal size: a hardlinked node_modules counts in every worktree that
 * holds it, so the sum is more than the space removing them frees). Updates the cache and
 * returns it. A `du` failure throws naming the path.
 */
export function measureSizes(paths, { hookStateDir, run = defaultRun, now = Date.now() }) {
  const cache = readSizeCache(hookStateDir);
  for (const p of paths) {
    const out = run('du', ['-sk', p]);
    const kb = Number(out.split(/\s+/)[0]);
    if (!Number.isFinite(kb)) throw new Error(`\`du -sk ${p}\` returned "${out.trim()}"`);
    cache[p] = { kb, measured_at: new Date(now).toISOString() };
  }
  writeSizeCache(hookStateDir, cache);
  return cache;
}

/**
 * Worktree counts by stage for `status`: { repos, total, by_stage: [{ stage, count,
 * sized, size_kb }], non_worktree_folders, sizes_measured_at }. `sized` is how many of the
 * stage's worktrees have a cached size and `size_kb` their sum (null when none).
 */
export function worktreeSummary(scan, cache) {
  const groups = new Map();
  let newest = null;
  for (const w of scan.worktrees) {
    const g = groups.get(w.stage) || { stage: w.stage, count: 0, sized: 0, size_kb: null };
    g.count += 1;
    const c = cache[w.path];
    if (c) {
      g.sized += 1;
      g.size_kb = (g.size_kb || 0) + c.kb;
      if (!newest || c.measured_at > newest) newest = c.measured_at;
    }
    groups.set(w.stage, g);
  }
  const by_stage = [...groups.values()].sort((a, b) => (a.stage === 'done' ? -1 : b.stage === 'done' ? 1 : b.count - a.count));
  return {
    repos: scan.repos.length,
    total: scan.worktrees.length,
    by_stage,
    non_worktree_folders: scan.non_worktree_folders,
    sizes_measured_at: newest,
  };
}

export function formatKb(kb) {
  const gb = kb / (1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(kb / 1024)} MB`;
}
