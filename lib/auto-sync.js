// lib/auto-sync.js
// lib/auto-sync.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { readConfig } from './config.js';
import { getTarget } from './targets/index.js';
import { info } from './colors.js';

/**
 * Returns all Bobby-managed paths for git staging, filtered to those that exist.
 */
export function getBobbyPaths(rootDir) {
  let candidates;
  try {
    const config = readConfig(rootDir);
    const bobbyDir = config.bobby_dir || '.bobby';
    const target = getTarget(config.target || 'claude-code');
    const tp = target.paths();
    candidates = [bobbyDir, tp.skills, tp.agents, tp.commands, tp.rules, '.bobbyrc.yml', 'conductor.json'];
  } catch {
    candidates = ['.bobby', '.claude/skills', '.claude/agents', '.claude/commands', 'CLAUDE.md', '.bobbyrc.yml', 'conductor.json'];
  }
  return candidates.filter(p => fs.existsSync(path.join(rootDir, p)));
}

/**
 * Auto-commit all Bobby-managed file changes.
 * Silent on success (just an info line), doesn't throw on failure.
 */
export function autoSync(rootDir) {
  try {
    const paths = getBobbyPaths(rootDir);
    if (paths.length === 0) return;
    const pathArgs = paths.map(p => `"${p}"`).join(' ');

    const status = execSync(`git status --porcelain -- ${pathArgs}`, {
      cwd: rootDir, encoding: 'utf8',
    }).trim();
    if (!status) return;

    execSync(`git add -- ${pathArgs}`, { cwd: rootDir, stdio: 'pipe' });
    execSync('git commit -m "bobby: auto-sync"', { cwd: rootDir, stdio: 'pipe' });
    info('Auto-synced Bobby data');
  } catch {
    // Don't break the command if sync fails (e.g., no git repo)
  }
}
