// lib/dashboard/worktree.js
//
// Git worktree manager for the dashboard. Each workspace gets its own git
// worktree on its own branch so parallel agents don't collide. Uses `git`
// CLI directly (no libgit2 dep) — matches what bobby already does elsewhere.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Run a git command in `cwd` and return stdout (trimmed). Throws on non-zero exit.
 */
function git(cwd, args, opts = {}) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).toString().trim();
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : '';
    throw new Error(`git ${args} failed: ${stderr || e.message}`);
  }
}

/**
 * Return the main branch name for a repo — either `main` or `master`.
 * Falls back to `main` if neither exists yet.
 */
export function detectMainBranch(repoRoot) {
  try {
    const branches = git(repoRoot, 'branch --list main master').split('\n').map(b => b.replace(/^[* ]+/, '').trim()).filter(Boolean);
    if (branches.includes('main')) return 'main';
    if (branches.includes('master')) return 'master';
    return 'main';
  } catch {
    return 'main';
  }
}

/**
 * Slugify a string for use in a branch name.
 */
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Return the default worktree root (parent dir containing all bobby worktrees).
 * Resolved relative to the repo root.
 */
export function resolveWorktreeRoot(repoRoot, config) {
  const cfg = config?.dashboard?.worktree_root || '../bobby-wt';
  return path.resolve(repoRoot, cfg);
}

/**
 * Compute the worktree path and branch name for a given ticket + stage.
 * Deterministic — calling twice returns the same values.
 */
export function computeWorktreePlacement(repoRoot, config, ticketId, stage = 'work') {
  const root = resolveWorktreeRoot(repoRoot, config);
  const dir = `${ticketId}-${slug(stage)}`;
  const worktreePath = path.join(root, dir);
  const branch = `bobby/${slug(ticketId)}-${slug(stage)}`;
  return { worktreePath, branch };
}

/**
 * Canonicalize a filesystem path — resolves symlinks (e.g. macOS /var →
 * /private/var) so our string comparison against `git worktree list` output
 * works reliably. Returns the original path if it doesn't yet exist.
 */
function canonical(p) {
  try { return fs.realpathSync(p); }
  catch { return path.resolve(p); }
}

/**
 * Return the list of worktrees registered with git, each as { path, branch }.
 * Paths are canonicalized so callers can compare with `canonical(wtPath)`.
 */
export function listWorktrees(repoRoot) {
  const out = git(repoRoot, 'worktree list --porcelain');
  const result = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) result.push(current);
      current = { path: canonical(line.slice('worktree '.length)), branch: null };
    } else if (line.startsWith('branch ')) {
      if (current) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Create a git worktree on a new branch forked from the current HEAD (or
 * main, if `baseBranch` is provided). Idempotent: if the worktree already
 * exists at `worktreePath`, returns without re-creating.
 */
export function createWorktree(repoRoot, { worktreePath, branch, baseBranch }) {
  const canonWtPath = canonical(worktreePath);

  if (fs.existsSync(worktreePath)) {
    const registered = listWorktrees(repoRoot).some(w => w.path === canonWtPath);
    if (registered) return { worktreePath, branch, created: false };
    throw new Error(`Path ${worktreePath} exists but is not a registered git worktree`);
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  const base = baseBranch || detectMainBranch(repoRoot);
  // Does the branch already exist? If so, check it out instead of creating.
  const existingBranches = git(repoRoot, 'branch --list ' + JSON.stringify(branch));
  if (existingBranches) {
    git(repoRoot, `worktree add ${JSON.stringify(worktreePath)} ${JSON.stringify(branch)}`);
  } else {
    git(repoRoot, `worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(worktreePath)} ${JSON.stringify(base)}`);
  }

  return { worktreePath, branch, created: true };
}

/**
 * Remove a worktree. If `deleteBranch` is true, also delete the branch.
 * `force` uses `--force` to remove even if the worktree has uncommitted changes.
 */
export function removeWorktree(repoRoot, worktreePath, { deleteBranch = false, branch, force = false } = {}) {
  const canonWtPath = canonical(worktreePath);
  const registered = listWorktrees(repoRoot).some(w => w.path === canonWtPath);

  if (!registered) {
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
    return { removed: false };
  }

  const forceFlag = force ? ' --force' : '';
  git(repoRoot, `worktree remove${forceFlag} ${JSON.stringify(worktreePath)}`);

  if (deleteBranch && branch) {
    try {
      git(repoRoot, `branch -D ${JSON.stringify(branch)}`);
    } catch {
      // Branch may have been merged and gone; ignore.
    }
  }

  return { removed: true };
}

/**
 * Commit all current changes in a worktree as a checkpoint. Returns the new
 * commit SHA. Returns null if there was nothing to commit.
 */
export function commitCheckpoint(worktreePath, message) {
  // Stage everything (including untracked)
  git(worktreePath, 'add -A');
  // Any staged changes?
  try {
    git(worktreePath, 'diff --cached --quiet');
    // diff --quiet exits 0 if no changes → nothing to commit
    return null;
  } catch {
    // diff --cached --quiet exited non-zero → there ARE staged changes
  }
  git(worktreePath, `commit -m ${JSON.stringify(message)} --no-verify`);
  return git(worktreePath, 'rev-parse HEAD');
}

/**
 * Return the unified diff between the worktree's branch and the main branch.
 * Limited to a configurable size to keep the dashboard responsive.
 */
export function diffAgainstMain(repoRoot, branch, { maxBytes = 500000 } = {}) {
  const mainBranch = detectMainBranch(repoRoot);
  let diff;
  try {
    diff = git(repoRoot, `diff ${JSON.stringify(mainBranch)}...${JSON.stringify(branch)}`);
  } catch (e) {
    // Branch may not exist yet (no commits) — return empty diff.
    return { diff: '', truncated: false };
  }
  if (diff.length > maxBytes) {
    return { diff: diff.slice(0, maxBytes), truncated: true };
  }
  return { diff, truncated: false };
}

/**
 * Return a list of changed files in the worktree's branch vs main with stats.
 */
export function changedFiles(repoRoot, branch) {
  const mainBranch = detectMainBranch(repoRoot);
  let raw;
  try {
    raw = git(repoRoot, `diff --numstat ${JSON.stringify(mainBranch)}...${JSON.stringify(branch)}`);
  } catch {
    return [];
  }
  if (!raw) return [];
  return raw.split('\n').map(line => {
    const [added, removed, file] = line.split('\t');
    return {
      file,
      added: added === '-' ? null : parseInt(added, 10),
      removed: removed === '-' ? null : parseInt(removed, 10),
    };
  }).filter(e => e.file);
}

/**
 * Merge a workspace branch into main (in the main repo checkout, not the
 * worktree). Uses --no-ff so there's always a merge commit. Fails loudly if
 * the merge has conflicts — the user must resolve manually.
 *
 * Strategy: checkout main in the main repo, merge the branch, then leave
 * main checked out. The caller is responsible for removing the worktree
 * afterward.
 */
export function mergeToMain(repoRoot, branch, { message } = {}) {
  const mainBranch = detectMainBranch(repoRoot);
  // Stash any in-progress work in the main repo to avoid clobbering.
  let stashed = false;
  try {
    const status = git(repoRoot, 'status --porcelain');
    if (status) {
      git(repoRoot, 'stash push -u -m "bobby-dashboard-auto-stash"');
      stashed = true;
    }
  } catch { /* ignore */ }

  try {
    git(repoRoot, `checkout ${JSON.stringify(mainBranch)}`);
    const mergeMsg = message || `Merge ${branch} into ${mainBranch} (bobby)`;
    git(repoRoot, `merge --no-ff ${JSON.stringify(branch)} -m ${JSON.stringify(mergeMsg)}`);
  } finally {
    if (stashed) {
      try { git(repoRoot, 'stash pop'); } catch { /* merge may have left changes */ }
    }
  }

  const sha = git(repoRoot, 'rev-parse HEAD');
  return { merged: true, sha, mainBranch };
}

/**
 * Current branch in a given directory (worktree or main repo).
 */
export function currentBranch(cwd) {
  return git(cwd, 'branch --show-current');
}

/**
 * Check whether a directory is the root of a git repo.
 */
export function isGitRepo(cwd) {
  try {
    git(cwd, 'rev-parse --show-toplevel');
    return true;
  } catch {
    return false;
  }
}
