// lib/workspace.js
// v2 workspace helpers: one workspace holds many projects and a shared pool of
// repos. Boards live at .bobby/<project>/; repos live (by default) under repos/.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';
import { listWorkspaceProjects } from './config.js';

const CONFIG_FILE = '.bobbyrc.yml';

export function workspaceConfigPath(root) { return path.join(root, CONFIG_FILE); }

export function readRawWorkspaceConfig(root) {
  const p = workspaceConfigPath(root);
  if (!fs.existsSync(p)) throw new Error('Not a Bobby workspace. Run `bobby workspace init`.');
  return YAML.parse(fs.readFileSync(p, 'utf8')) || {};
}
export function writeWorkspaceConfig(root, cfg) {
  fs.writeFileSync(workspaceConfigPath(root), YAML.stringify(cfg, { lineWidth: 120 }), 'utf8');
}
export function isV2(root) {
  const p = workspaceConfigPath(root);
  if (!fs.existsSync(p)) return false;
  return (YAML.parse(fs.readFileSync(p, 'utf8')) || {}).layout === 'v2';
}

/** Convert (or create) the current dir into a v2 workspace. Idempotent. */
export function upgradeToV2(root) {
  const p = workspaceConfigPath(root);
  const cfg = fs.existsSync(p) ? (YAML.parse(fs.readFileSync(p, 'utf8')) || {}) : {};
  cfg.workspace = cfg.workspace || cfg.project || path.basename(root);
  cfg.layout = 'v2';
  if (!cfg.repos || Array.isArray(cfg.repos)) cfg.repos = {};   // v1 array -> v2 group map
  cfg.git_conventions = cfg.git_conventions || { feature_branch_prefix: 'feature' };
  cfg.workflows = cfg.workflows || { default: ['plan', 'build', 'review', 'test'] };
  delete cfg.project;                                            // workspace isn't a single project
  // Obsolete in v2: board location is per-project (.bobby/<project>/…) and the
  // prefix lives in each project's config. Leaving these on the workspace file
  // is misleading, so drop them on convert.
  for (const k of ['tickets_dir', 'sessions_dir', 'sprints_dir', 'ticket_prefix']) delete cfg[k];
  writeWorkspaceConfig(root, cfg);
  fs.mkdirSync(path.join(root, '.bobby'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repos'), { recursive: true });
  ensureGitignore(root);
  return cfg;
}

function ensureGitignore(root) {
  const gi = path.join(root, '.gitignore');
  let text = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  // active-project is per-developer state (which project *you* are on) — never
  // shared, or teammates would fight over it in commits.
  const needed = ['repos/', '.bobby/*/sessions/', '.bobby/active-project'];
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
  const group = readRawWorkspaceConfig(root).repos || {};
  for (const r of repos) if (!group[r]) throw new Error(`Repo '${r}' is not in the workspace group. Add it: bobby repo add ${r} <path|url>`);
  for (const leaf of ['tickets', 'sessions', 'docs', 'retrospectives']) fs.mkdirSync(path.join(dir, leaf), { recursive: true });
  const pc = { project: name, prefix: prefix || defaultPrefix(name), repos };
  fs.writeFileSync(path.join(dir, CONFIG_FILE), YAML.stringify(pc, { lineWidth: 120 }), 'utf8');
  fs.writeFileSync(path.join(dir, 'architecture-wakeup.md'), `# ${name} — architecture wakeup\n\n_Run \`bobby run arch --project ${name}\` to populate._\n`);
  fs.writeFileSync(path.join(dir, 'decisions.yaml'), 'decisions: []\n');
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
  if (!listWorkspaceProjects(root).includes(name)) throw new Error(`No such project '${name}'`);
  fs.writeFileSync(path.join(root, '.bobby', 'active-project'), name, 'utf8');
}
export function getActiveProject(root) {
  const f = path.join(root, '.bobby', 'active-project');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
}

// ---------- repos (the shared group) ----------
function isGitUrl(s) { return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(s) || s.endsWith('.git'); }

/**
 * Add a repo to the workspace group.
 *  - a git URL  -> cloned into repos/<name>, recorded as a relative path
 *  - an existing dir under the workspace -> recorded as a relative path
 *  - an existing dir elsewhere -> recorded as an absolute path (external, opt-out)
 */
export function addRepo(root, name, target, { stack, test } = {}) {
  const cfg = readRawWorkspaceConfig(root);
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
  writeWorkspaceConfig(root, cfg);
  return entry;
}

/**
 * Restore the repo group on a fresh checkout: clone any group repo whose path
 * is missing but has a recorded url. Returns a per-repo status list.
 */
export function setupRepos(root) {
  const repos = readRawWorkspaceConfig(root).repos || {};
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
  const repos = readRawWorkspaceConfig(root).repos || {};
  return Object.entries(repos).map(([name, e]) => ({
    name, path: typeof e === 'string' ? e : e.path, stack: (e && e.stack) || '—',
  }));
}
