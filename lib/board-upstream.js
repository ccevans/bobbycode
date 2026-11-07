// lib/board-upstream.js
// TKT-083: a board that is behind its upstream can hand out ticket IDs the
// upstream already used. Network work (fetch + behind check) lives here for the
// command layer; nextId() only uses the offline half (upstreamHighestId).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const FETCH_TIMEOUT_MS = 30000;
const FETCH_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 500;
const LOCK_RE = /cannot lock ref|Unable to create '.*\.lock'/;

/**
 * Thin execFileSync wrapper (never a shell string). A child that exits
 * non-zero throws an Error carrying `status` and `stderr`; a spawn failure
 * (no numeric status, e.g. ENOENT) is rethrown untouched.
 */
function git(args, cwd, extra = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    ...extra,
  }).trim();
}

/** Run git; a non-zero exit returns null, anything else (spawn failure) throws. */
function gitOrNull(args, cwd) {
  try {
    return git(args, cwd);
  } catch (e) {
    if (typeof e.status === 'number') return null;
    throw e;
  }
}

function nearestExisting(p) {
  let cur = p;
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur;
}

/**
 * Describe the upstream of the repo holding `ticketsDir`, or null when there
 * is nothing to be behind (not a repo, detached HEAD, no upstream configured,
 * board outside the repo).
 */
export function boardUpstream(ticketsDir) {
  const cwd = nearestExisting(ticketsDir);
  const repoRoot = gitOrNull(['rev-parse', '--show-toplevel'], cwd);
  if (!repoRoot) return null;
  const branch = gitOrNull(['symbolic-ref', '-q', '--short', 'HEAD'], repoRoot);
  if (!branch) return null;
  const remote = gitOrNull(['config', '--get', `branch.${branch}.remote`], repoRoot);
  const merge = gitOrNull(['config', '--get', `branch.${branch}.merge`], repoRoot);
  if (!remote || !merge) return null;

  // realpath both sides: macOS tmpdirs sit behind the /var -> /private/var symlink
  const realAnc = fs.realpathSync(cwd);
  const realDir = path.join(realAnc, path.relative(cwd, ticketsDir));
  const relDir = path.relative(fs.realpathSync(repoRoot), realDir);
  if (relDir.startsWith('..') || path.isAbsolute(relDir)) return null;

  if (remote === '.') {
    const localBranch = merge.replace(/^refs\/heads\//, '');
    return { repoRoot, remote: null, remoteBranch: localBranch, trackingRef: merge, label: localBranch, relDir, branch };
  }
  const remoteBranch = merge.replace(/^refs\/heads\//, '');
  return {
    repoRoot, remote, remoteBranch, branch,
    trackingRef: `refs/remotes/${remote}/${remoteBranch}`,
    label: `${remote}/${remoteBranch}`,
    relDir,
  };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fetchFailure(message) {
  const err = new Error(message);
  err.fetchFailed = true;
  return err;
}

/** Fetch the upstream branch. Throws an explicit error (fetchFailed) on failure. */
export function fetchUpstream(up) {
  if (!up.remote) return;
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      git(['fetch', '--quiet', up.remote, `+refs/heads/${up.remoteBranch}:${up.trackingRef}`], up.repoRoot, { timeout: FETCH_TIMEOUT_MS });
      return;
    } catch (e) {
      lastErr = e;
      const stderr = String(e.stderr || '');
      // The remote answered but the branch isn't there (set up with -u before its
      // first push, or deleted): nothing to be behind. Drop any stale tracking ref.
      if (typeof e.status === 'number' && /couldn't find remote ref/.test(stderr)) {
        if (trackingExists(up)) git(['update-ref', '-d', up.trackingRef], up.repoRoot);
        return;
      }
      // A retry for concurrent fetches in one repo, not a fallback.
      if (typeof e.status === 'number' && LOCK_RE.test(stderr) && attempt < FETCH_RETRIES) {
        sleepSync(FETCH_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }
  const url = gitOrNull(['remote', 'get-url', up.remote], up.repoRoot);
  const where = `${up.remote}${url ? ` (${url})` : ''}`;
  if (lastErr.code === 'ETIMEDOUT') {
    throw fetchFailure(`Fetching ${where} timed out after ${FETCH_TIMEOUT_MS / 1000}s while checking the board is current. Fix the remote or your access, then retry.`);
  }
  if (typeof lastErr.status !== 'number') throw lastErr;
  const reason = String(lastErr.stderr || '').split('\n').map(s => s.trim()).find(Boolean) || `git exited ${lastErr.status}`;
  throw fetchFailure(`Could not fetch ${where} to check the board is current: ${reason}. Fix the remote or your access, then retry.`);
}

function trackingExists(up) {
  return gitOrNull(['rev-parse', '--verify', '-q', up.trackingRef], up.repoRoot) !== null;
}

/** Upstream commits that touch the board directory and are not in HEAD. */
export function commitsBehind(up) {
  if (!trackingExists(up)) return 0;
  const pathspec = up.relDir ? [up.relDir] : ['.'];
  const unborn = gitOrNull(['rev-parse', '--verify', '-q', 'HEAD'], up.repoRoot) === null;
  const range = unborn ? up.trackingRef : `HEAD..${up.trackingRef}`;
  return parseInt(git(['rev-list', '--count', range, '--', ...pathspec], up.repoRoot), 10);
}

/**
 * Highest ticket number the upstream tree holds for `prefix`. Offline: reads
 * the already-fetched tracking ref. 0 when there is no upstream.
 */
export function upstreamHighestId(ticketsDir, prefix) {
  const up = boardUpstream(ticketsDir);
  if (!up || !trackingExists(up)) return 0;
  const args = ['ls-tree', '--name-only', up.trackingRef];
  if (up.relDir) args.push('--', `${up.relDir}/`);
  const out = git(args, up.repoRoot);
  const re = new RegExp(`^${prefix}-(\\d+)--`);
  let max = 0;
  for (const line of out.split('\n')) {
    const m = path.basename(line).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function pullHint(up) {
  return up.remote
    ? `git -C ${up.repoRoot} pull --rebase ${up.remote} ${up.remoteBranch}`
    : `git -C ${up.repoRoot} rebase ${up.remoteBranch}`;
}

/** Fetch, then refuse (throw) when the board is behind its upstream. */
export function assertBoardCurrent(ticketsDir) {
  const up = boardUpstream(ticketsDir);
  if (!up) return;
  fetchUpstream(up);
  const n = commitsBehind(up);
  if (n > 0) {
    throw new Error(`Board is ${n} commit${n === 1 ? '' : 's'} behind ${up.label}; it may hand out a ticket ID ${up.label} already used. Pull first: ${pullHint(up)}`);
  }
}

/**
 * For brief: { state: 'none' | 'current' | 'behind' | 'unknown', ... }.
 * A fetch error is the visible 'unknown' state; spawn failures still throw.
 */
export function boardFreshness(ticketsDir) {
  const up = boardUpstream(ticketsDir);
  if (!up) return { state: 'none' };
  try {
    fetchUpstream(up);
  } catch (e) {
    if (e.fetchFailed) return { state: 'unknown', reason: e.message };
    throw e;
  }
  const count = commitsBehind(up);
  return count > 0 ? { state: 'behind', count, label: up.label } : { state: 'current' };
}
