// lib/config.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';

const CONFIG_FILE = '.bobbyrc.yml';

const DEFAULTS = {
  bobby_dir: '.bobby',
  ticket_prefix: 'TKT',
  idea_prefix: 'IDEA',
  target: 'claude-code',
  health_checks: [],
  areas: [],
  skill_routing: {},
  backlog_limit: null,
  backlog_stale_days: 30,
  parallel_isolation: 'none',
  testing_tools: ['curl'],
};

export function readConfig(rootDir) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error('Not a Bobby project. Run `bobby init` first.');
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw) || {};
  const merged = { ...DEFAULTS, ...parsed };

  // Derive tickets_dir and sessions_dir from bobby_dir unless explicitly set
  const bobbyDir = merged.bobby_dir;
  if (!parsed.tickets_dir) merged.tickets_dir = `${bobbyDir}/tickets`;
  if (!parsed.sessions_dir) merged.sessions_dir = `${bobbyDir}/sessions`;

  return merged;
}

export function writeConfig(rootDir, config) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const content = YAML.stringify(config, { lineWidth: 120 });
  fs.writeFileSync(configPath, content, 'utf8');
}

export function configExists(rootDir) {
  return fs.existsSync(path.join(rootDir, CONFIG_FILE));
}

export function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Not a Bobby project. Run `bobby init` first.');
}

/**
 * If cwd is inside a git worktree, return the main worktree's root.
 * Returns null if not in a worktree or git unavailable.
 */
export function findMainWorktreeRoot() {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const gitCommonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const absGitDir = path.resolve(gitDir);
    const absCommonDir = path.resolve(gitCommonDir);
    if (absGitDir !== absCommonDir) {
      return path.resolve(absCommonDir, '..');
    }
  } catch { /* not in git repo */ }
  return null;
}

/**
 * Resolve the tickets directory — always points to the main worktree's copy.
 */
export function resolveTicketsDir(root, config) {
  const mainRoot = findMainWorktreeRoot();
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.tickets_dir);
}

/**
 * Resolve the sessions directory — always points to the main worktree's copy.
 */
export function resolveSessionsDir(root, config) {
  const mainRoot = findMainWorktreeRoot();
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.sessions_dir);
}
