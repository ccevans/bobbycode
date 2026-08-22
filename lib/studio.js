// lib/studio.js
// Studio helpers: one studio holds many projects and a shared pool of repos.
// Boards live at .bobby/<project>/; repos live (by default) under repos/.
// (The machine-wide project index lives in lib/registry.js — different concept.)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';
import { listStudioProjects } from './config.js';
import { seedDecisionsFile } from './decisions.js';

const CONFIG_FILE = '.bobbyrc.yml';

export function studioConfigPath(root) { return path.join(root, CONFIG_FILE); }

export function readStudioConfig(root) {
  const p = studioConfigPath(root);
  if (!fs.existsSync(p)) throw new Error('Not a Bobby studio. Run `bobby init`.');
  return YAML.parse(fs.readFileSync(p, 'utf8')) || {};
}
export function writeStudioConfig(root, cfg) {
  fs.writeFileSync(studioConfigPath(root), YAML.stringify(cfg, { lineWidth: 120 }), 'utf8');
}
export function isStudio(root) {
  const p = studioConfigPath(root);
  if (!fs.existsSync(p)) return false;
  return !!(YAML.parse(fs.readFileSync(p, 'utf8')) || {}).studio;
}

/** Convert (or create) the current dir into a studio. Idempotent. */
export function initStudio(root) {
  const p = studioConfigPath(root);
  const cfg = fs.existsSync(p) ? (YAML.parse(fs.readFileSync(p, 'utf8')) || {}) : {};
  cfg.studio = cfg.studio || cfg.project || path.basename(root);   // the `studio:` key marks a studio
  if (!cfg.repos || Array.isArray(cfg.repos)) cfg.repos = {};   // legacy array -> group map
  cfg.git_conventions = cfg.git_conventions || { feature_branch_prefix: 'feature' };
  cfg.workflows = cfg.workflows || { default: ['plan', 'build', 'review', 'test'] };
  delete cfg.project;                                            // a studio isn't a single project
  delete cfg.layout;                                             // legacy marker, superseded by `studio:`
  // Obsolete in a studio: board location is per-project (.bobby/<project>/…) and
  // the prefix lives in each project's config. Leaving these on the studio file
  // is misleading, so drop them on convert.
  for (const k of ['tickets_dir', 'sessions_dir', 'sprints_dir', 'ticket_prefix']) delete cfg[k];
  writeStudioConfig(root, cfg);
  fs.mkdirSync(path.join(root, '.bobby'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repos'), { recursive: true });
  ensureGitignore(root);
  return cfg;
}

/**
 * Grow a legacy single-board project into a studio in place, without losing
 * work: the existing .bobby/tickets board (and its metadata) becomes the
 * studio's FIRST project. This is what makes "one model" real — you never run a
 * separate setup step; the first `bobby project new` / `bobby repo add` calls
 * this, so a single-board project and a studio are the same thing at different
 * sizes. Idempotent: a no-op if already a studio.
 */
export function promoteV1ToStudio(root) {
  const cfgPath = studioConfigPath(root);
  const v1 = fs.existsSync(cfgPath) ? (YAML.parse(fs.readFileSync(cfgPath, 'utf8')) || {}) : {};
  if (v1.studio) return v1.studio;   // already a studio

  const name = slugName(v1.project || path.basename(root));
  const prefix = v1.ticket_prefix || defaultPrefix(name);
  initStudio(root);   // adds `studio:`, repos/, gitignore; drops obsolete v1 keys

  const bobby = path.join(root, '.bobby');
  const projDir = path.join(bobby, name);
  fs.mkdirSync(projDir, { recursive: true });
  // Move the existing board + metadata into the first project (tickets preserved).
  for (const item of ['tickets', 'sessions', 'docs', 'retrospectives', 'architecture-wakeup.md', 'decisions.yaml']) {
    const src = path.join(bobby, item);
    const dst = path.join(projDir, item);
    if (fs.existsSync(src) && !fs.existsSync(dst)) fs.renameSync(src, dst);
  }
  // Fill in anything the project still lacks.
  for (const leaf of ['tickets', 'sessions', 'docs', 'retrospectives']) fs.mkdirSync(path.join(projDir, leaf), { recursive: true });
  const pcPath = path.join(projDir, CONFIG_FILE);
  if (!fs.existsSync(pcPath)) fs.writeFileSync(pcPath, YAML.stringify({ project: name, prefix, repos: [] }, { lineWidth: 120 }));
  seedDecisionsFile(path.join(projDir, 'decisions.yaml'));
  if (!fs.existsSync(path.join(projDir, 'architecture-wakeup.md'))) fs.writeFileSync(path.join(projDir, 'architecture-wakeup.md'), `# ${name} — architecture wakeup\n`);
  setActiveProject(root, name);
  return name;
}

function slugName(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'main';
}

function ensureGitignore(root) {
  const gi = path.join(root, '.gitignore');
  let text = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  // active-project is per-developer state (which project *you* are on) — never
  // shared, or teammates would fight over it in commits.
  // run.lock is a LIVE claim on a ticket (BOB-120), not a fact about it. Committed,
  // it would travel to other machines carrying a pid and host that mean nothing
  // there, and the age ceiling would be the only thing freeing the ticket — so a
  // fresh clone could find work blocked for hours by a run that ended long ago.
  const needed = ['repos/', '.bobby/*/sessions/', '.bobby/active-project', '.bobby/*/tickets/*/run.lock'];
  const lines = text.split('\n');
  let changed = false;
  for (const n of needed) {
    if (!lines.some(l => l.trim() === n)) { text += (text.endsWith('\n') || text === '' ? '' : '\n') + n + '\n'; changed = true; }
  }
  if (changed) fs.writeFileSync(gi, text, 'utf8');
}

// ---------- projects ----------
export function createProject(root, name, { prefix, repos = [] } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Invalid project name '${name}' (use lowercase, digits, dashes)`);
  const dir = path.join(root, '.bobby', name);
  if (fs.existsSync(path.join(dir, CONFIG_FILE))) throw new Error(`Project '${name}' already exists`);
  const group = readStudioConfig(root).repos || {};
  for (const r of repos) if (!group[r]) throw new Error(`Repo '${r}' is not in the studio's repo group. Add it: bobby repo add ${r} <path|url>`);
  for (const leaf of ['tickets', 'sessions', 'docs', 'retrospectives']) fs.mkdirSync(path.join(dir, leaf), { recursive: true });
  const pc = { project: name, prefix: prefix || defaultPrefix(name), repos };
  fs.writeFileSync(path.join(dir, CONFIG_FILE), YAML.stringify(pc, { lineWidth: 120 }), 'utf8');
  fs.writeFileSync(path.join(dir, 'architecture-wakeup.md'), `# ${name} — architecture wakeup\n\n_Run \`bobby run arch --project ${name}\` to populate._\n`);
  // Same seed as `bobby init` — a studio project's decision log and an ordinary
  // project's used to be different shapes under the same filename (TKT-063).
  seedDecisionsFile(path.join(dir, 'decisions.yaml'));
  return { dir, config: pc };
}
function defaultPrefix(name) {
  const letters = name.replace(/[^a-z]/gi, '');
  return (letters.slice(0, 2) || name.slice(0, 2)).toUpperCase();
}

export function readProjectConfig(root, name) {
  const p = path.join(root, '.bobby', name, CONFIG_FILE);
  return fs.existsSync(p) ? (YAML.parse(fs.readFileSync(p, 'utf8')) || {}) : {};
}

export function setActiveProject(root, name) {
  if (!listStudioProjects(root).includes(name)) throw new Error(`No such project '${name}'`);
  fs.writeFileSync(path.join(root, '.bobby', 'active-project'), name, 'utf8');
}
export function getActiveProject(root) {
  const f = path.join(root, '.bobby', 'active-project');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
}

// ---------- repos (the shared group) ----------
function isGitUrl(s) { return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(s) || s.endsWith('.git'); }

/**
 * Add a repo to the studio's repo group.
 *  - a git URL  -> cloned into repos/<name>, recorded as a relative path
 *  - an existing dir under the studio -> recorded as a relative path
 *  - an existing dir elsewhere -> recorded as an absolute path (external, opt-out)
 */
export function addRepo(root, name, target, { stack, test } = {}) {
  const cfg = readStudioConfig(root);
  cfg.repos = cfg.repos || {};
  if (cfg.repos[name]) throw new Error(`Repo '${name}' already in the group`);
  let recorded;
  let url = null;
  if (isGitUrl(target)) {
    const dest = path.join(root, 'repos', name);
    fs.mkdirSync(path.join(root, 'repos'), { recursive: true });
    execSync(`git clone ${target} ${JSON.stringify(dest)}`, { stdio: 'pipe' });
    recorded = path.join('repos', name);
    url = target;                          // remember how to re-clone on a fresh checkout
  } else {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) throw new Error(`Path does not exist: ${target}`);
    const rel = path.relative(root, abs);
    recorded = (!rel.startsWith('..') && !path.isAbsolute(rel)) ? rel : abs;
    // If it's a git repo with an origin, record that too so teammates can restore it.
    try { url = execSync('git remote get-url origin', { cwd: abs, stdio: ['pipe', 'pipe', 'pipe'] }).trim() || null; } catch { /* no origin */ }
  }
  const entry = { path: recorded };
  if (url) entry.url = url;
  if (stack) entry.stack = stack;
  if (test) entry.commands = { test };
  cfg.repos[name] = entry;
  writeStudioConfig(root, cfg);
  return entry;
}

/**
 * Restore the repo group on a fresh checkout: clone any group repo whose path
 * is missing but has a recorded url. Returns a per-repo status list.
 */
export function setupRepos(root) {
  const repos = readStudioConfig(root).repos || {};
  const results = [];
  for (const [name, e] of Object.entries(repos)) {
    const entry = typeof e === 'string' ? { path: e } : e;
    const abs = path.isAbsolute(entry.path) ? entry.path : path.join(root, entry.path);
    if (fs.existsSync(abs)) { results.push({ name, status: 'present', path: entry.path }); continue; }
    if (entry.url) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      execSync(`git clone ${entry.url} ${JSON.stringify(abs)}`, { stdio: 'pipe' });
      results.push({ name, status: 'cloned', path: entry.path, url: entry.url });
    } else {
      results.push({ name, status: 'missing', path: entry.path });   // local-only, can't restore
    }
  }
  return results;
}

export function listRepos(root) {
  const repos = readStudioConfig(root).repos || {};
  return Object.entries(repos).map(([name, e]) => ({
    name, path: typeof e === 'string' ? e : e.path, stack: (e && e.stack) || '—',
  }));
}
