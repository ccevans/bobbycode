// lib/auto-sync.js
import { execSync } from 'child_process';
import { info } from './colors.js';

/**
 * Auto-commit .bobby/ changes if there are any.
 * Silent on success (just an info line), noisy on failure (logs warning but doesn't throw).
 */
export function autoSync(rootDir, bobbyDir = '.bobby') {
  try {
    const status = execSync(`git status --porcelain "${bobbyDir}"`, {
      cwd: rootDir, encoding: 'utf8',
    }).trim();
    if (!status) return;

    execSync(`git add "${bobbyDir}"`, { cwd: rootDir, stdio: 'pipe' });
    execSync('git commit -m "bobby: auto-sync"', { cwd: rootDir, stdio: 'pipe' });
    info('Auto-synced Bobby data');
  } catch {
    // Don't break the command if sync fails (e.g., no git repo)
  }
}
