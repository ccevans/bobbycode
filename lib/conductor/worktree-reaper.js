// lib/conductor/worktree-reaper.js
//
// `conductor reap --worktrees` (BOB-189). The conductor's only code that removes a worktree,
// and it does exactly one thing:
//
//   git -C <the worktree's main repo> worktree remove --force <path>
//
// which deletes the folder and git's record of it and KEEPS the branch. Nothing here runs
// a recursive delete of its own.
//
// A worktree is removed only when every rule holds:
//   - it is a linked worktree git lists (worktrees.js); main checkouts are never listed as
//     candidates and a locked or prunable one (folder already gone) is kept.
//   - the ticket ID in its folder name is on a studio board and EVERY ticket named is done.
//     No ticket in the name, or one that is not on a board, keeps it.
//   - `git status --porcelain --untracked-files=normal` is empty: no modified or staged tracked
//     file and no untracked, non-ignored file (a review.md or test-evidence/ nobody committed
//     is work that would go with the folder, BOB-191). Only IGNORED files (node_modules, .next,
//     logs) go with the folder; committed work is on the branch, which stays. The untracked
//     mode is passed explicitly so a user's status.showUntrackedFiles=no cannot hide them.
//   - a detached HEAD must already be on some local or remote branch: a detached worktree has
//     no branch of its own to keep, so removing it would orphan commits made on it.
//   - no live session's cwd is inside it. Live means any session `claude agents` lists that
//     is not already ended: working, waiting on CC, interactive, unknown, or finished with
//     its process still running.
//   - it does not hold the directory this command runs from.
//
// Changes confined to the scratch folders conductor.yml lists (reaper.worktree_scratch_paths,
// e.g. coverage/ and tmp/: rspec SimpleCov output, tmp/**/.keep deletions) do not count as
// changes (BOB-193). They go with the folder; a change with any path outside them still keeps it.
//
// Candidates come from one snapshot. Right before each removal the sessions, the ticket
// boards and `git status` are read again and the full rule re-run, so a lane that started in
// between keeps its folder. If git or claude fails, that is an explicit error or a `failed`
// row; it is never read as "clean" or "no sessions".

import path from 'path';
import fs from 'fs';
import { readAgents, classifySessions, groupSessions } from './sessions.js';
import { run as defaultRun } from './exec.js';
import { scanWorktrees, measureSizes, formatKb } from './worktrees.js';

// .native: macOS volumes are case-insensitive and only the native realpath returns the on-disk
// case, so a session cwd typed as `.../rf-1815-staging` still matches git's `.../RF-1815-staging`.
const real = (p) => {
  try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
};

const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);

/** Folders of every session that has not ended. */
export function liveCwds(sessions) {
  const ended = new Set(groupSessions(sessions).stopped);
  return sessions.filter(s => !ended.has(s) && s.cwd).map(s => ({ cwd: real(s.cwd), name: s.name }));
}

/** "review.md, test-evidence/ (+3)": the first two entries git status lists, then how many more. */
function untrackedSummary(entries) {
  const shown = entries.slice(0, 2).join(', ');
  return entries.length > 2 ? `${shown} (+${entries.length - 2})` : shown;
}

/** Unquote one porcelain path: git quotes a path with special characters as "a\\tb". */
function unquote(p) {
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1).replace(/\\(["\\])/g, '$1');
  return p;
}

/**
 * One `git status --porcelain` (v1) line into its paths: `XY path`, or `XY orig -> path`
 * for a file git shows as moved or copied (R or C), where both paths count.
 */
export function porcelainPaths(line) {
  return line.slice(3).split(' -> ').map(unquote);
}

/** True when `p` (relative to the worktree root) is one of the scratch folders or inside one. */
export function isScratch(p, scratch) {
  const clean = p.replace(/\/+$/, '');
  return scratch.some((entry) => {
    const dir = entry.replace(/\/+$/, '');
    return clean === dir || clean.startsWith(dir + '/');
  });
}

function describe(w) {
  return { repo: w.repo, path: w.path, branch: w.branch, ticket: w.ticket_ids.join(', ') || null, stage: w.stage };
}

/**
 * Sort classified worktrees (worktrees.js classifyWorktrees) into candidates and kept
 * ones, each kept one with its reason. `dirty(path)` returns the porcelain text of
 * `git status --untracked-files=normal` for a path (ignored files are not listed); it is only
 * called for a worktree that passed every other rule.
 * `onBranch(path)` says whether a detached HEAD is already on a branch; only asked for detached ones.
 */
export function evaluateWorktrees(worktrees, { live, cwd, dirty, onBranch, scratch }) {
  if (!Array.isArray(scratch)) throw new Error('evaluateWorktrees needs the scratch folder list (reaper.worktree_scratch_paths)');
  const candidates = [];
  const kept = [];
  const here = real(cwd);
  for (const w of worktrees) {
    const keep = (why, extra = {}) => kept.push({ ...describe(w), why, ...extra });
    if (w.bare) { keep('bare repository'); continue; }
    if (w.locked) { keep(`locked (${w.locked})`); continue; }
    if (w.prunable) { keep(`folder is gone, git marks it prunable (${w.prunable})`); continue; }
    if (w.ticket_ids.length === 0) { keep('no ticket on a board in the folder name'); continue; }
    if (w.stage !== 'done') { keep(`ticket ${w.ticket_ids.join(', ')} is ${w.stage}`, { group: `ticket is ${w.stage}` }); continue; }
    const target = real(w.path);
    if (inside(here, target)) { keep('this command is running inside it', { notable: true }); continue; }
    const session = live.find(s => inside(s.cwd, target));
    if (session) { keep(`live session "${session.name || '(unnamed)'}" is inside it`, { notable: true }); continue; }
    let changes;
    try {
      changes = dirty(w.path);
    } catch (e) {
      kept.push({ ...describe(w), why: 'git status failed', error: e.message, notable: true });
      continue;
    }
    const all = changes.split('\n').filter(l => l.trim());
    const lines = all.filter(l => !porcelainPaths(l).every(p => isScratch(p, scratch)));
    const scratchOnly = all.length - lines.length;
    const untracked = lines.filter(l => l.startsWith('??')).map(l => l.slice(3));
    const tracked = lines.filter(l => !l.startsWith('??')).map(l => l.slice(3));
    if (tracked.length > 0) {
      keep(`${tracked.length} tracked file(s) modified or staged: ${untrackedSummary(tracked)}`, { notable: true, real_diff: true, group: 'tracked files modified or staged' });
      continue;
    }
    if (untracked.length > 0) {
      keep(`untracked: ${untrackedSummary(untracked)}`, { notable: true, real_diff: true, group: 'untracked files that are not ignored' });
      continue;
    }
    if (w.detached) {
      let safe;
      try {
        safe = onBranch(w.path);
      } catch (e) {
        kept.push({ ...describe(w), why: 'git branch check failed', error: e.message, notable: true });
        continue;
      }
      if (!safe) { keep('detached HEAD is on no branch: removing it would orphan its commits', { notable: true }); continue; }
    }
    const changed = scratchOnly
      ? `only scratch changes (${scratchOnly} under ${scratch.join(', ')})`
      : 'no uncommitted or untracked files';
    candidates.push({ ...describe(w), repo_path: w.repo_path, reason: `${w.ticket_ids.join(', ')} done, ${changed}, no live session inside` });
  }
  return { candidates, kept };
}

function readDirty(run) {
  return (p) => run('git', ['-C', p, 'status', '--porcelain', '--untracked-files=normal']);
}

/** True when a detached HEAD is contained in at least one local or remote branch. */
function readOnBranch(run) {
  return (p) => run('git', ['-C', p, 'for-each-ref', '--contains', 'HEAD', 'refs/heads', 'refs/remotes']).trim() !== '';
}

function snapshot({ studioRoot, config, run, home }) {
  const sessions = classifySessions(readAgents({ run }), { hookStateDir: config.hook_state_dir, now: Date.now() });
  const scan = scanWorktrees(studioRoot, { run, home });
  return { sessions, scan };
}

/**
 * Plan a worktree reap; with `apply`, remove each candidate once. Returns { candidates,
 * kept, non_worktree_folders, results, failed, sizes }. `results` is empty on a dry run:
 * only read commands ran (`git worktree list`, `git status`, `claude agents`, and `du`
 * when `measure` is set).
 */
export function reapWorktrees({ studioRoot, config, apply = false, measure = false, run = defaultRun, cwd = process.cwd(), home }) {
  const { sessions, scan } = snapshot({ studioRoot, config, run, home });
  const scratch = config.reaper.worktree_scratch_paths;
  const plan = evaluateWorktrees(scan.worktrees, { live: liveCwds(sessions), cwd, dirty: readDirty(run), onBranch: readOnBranch(run), scratch });
  let sizes = null;
  if (measure) {
    const cache = measureSizes(plan.candidates.map(c => c.path), { hookStateDir: config.hook_state_dir, run });
    sizes = { kb: plan.candidates.reduce((sum, c) => sum + cache[c.path].kb, 0), measured: plan.candidates.length };
    for (const c of plan.candidates) c.size_kb = cache[c.path].kb;
  }
  const results = [];
  if (apply) {
    for (const c of plan.candidates) {
      let still;
      try {
        const fresh = snapshot({ studioRoot, config, run, home });
        // Only this worktree is re-evaluated: `git status` on every other one is not needed.
        const only = fresh.scan.worktrees.filter(w => w.path === c.path);
        const again = evaluateWorktrees(only, { live: liveCwds(fresh.sessions), cwd, dirty: readDirty(run), onBranch: readOnBranch(run), scratch });
        still = again.candidates[0];
        if (!still) {
          const why = again.kept[0];
          results.push({ ...c, outcome: 'skipped', detail: why ? why.why : 'no longer a git worktree' });
          continue;
        }
      } catch (e) {
        results.push({ ...c, outcome: 'failed', detail: `could not re-check it: ${e.message}` });
        continue;
      }
      try {
        run('git', ['-C', still.repo_path, 'worktree', 'remove', '--force', still.path]);
        results.push({ ...c, outcome: 'removed' });
      } catch (e) {
        results.push({ ...c, outcome: 'failed', detail: e.message });
      }
    }
  }
  const failed = results.filter(r => r.outcome === 'failed').length + plan.kept.filter(k => k.error).length;
  return { ...plan, non_worktree_folders: scan.non_worktree_folders, results, failed, sizes };
}

const sizeText = (c) => (c.size_kb === undefined ? '' : `  ${formatKb(c.size_kb)}`);

/** Text for `bobby conductor reap --worktrees`. */
export function renderWorktreeReap(report, { apply, studioRoot, now = new Date() }) {
  const lines = [`${now.toISOString()}  conductor reap --worktrees${apply ? ' --apply' : ''}`];
  const base = studioRoot ? real(studioRoot) : null;
  const short = (p) => {
    const rel = base ? path.relative(base, real(p)) : p;
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
  };
  const row = (label, c, extra) => lines.push(`  ${label}  ${c.repo}  ${c.path}  ${extra}${sizeText(c)}`);
  if (!apply) {
    lines.push(`Dry run: ${report.candidates.length} worktree(s) would be removed (git worktree remove --force; the branches are kept). Nothing was changed; add --apply to remove them.`);
    for (const c of report.candidates) row('would remove', c, c.reason);
  } else if (report.candidates.length === 0) {
    lines.push('No worktrees to remove.');
  } else {
    for (const r of report.results) row(r.outcome, r, r.detail ? `${r.reason}; ${r.detail}` : r.reason);
  }
  if (report.sizes) {
    lines.push(`Size of the ${report.sizes.measured} candidate(s): ${formatKb(report.sizes.kb)} (du; a hardlinked node_modules counts in each worktree, so the space freed can be less).`);
  } else if (report.candidates.length) {
    lines.push('Sizes not measured (du is slow); add --sizes to measure the candidates.');
  }
  const byReason = new Map();
  for (const k of report.kept) {
    const reason = k.group || k.why;
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  lines.push(`Kept: ${report.kept.length} worktree(s).`);
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  ${n}  ${reason}`);
  // A worktree of a done ticket that was kept is the one worth reading about; list it.
  for (const k of report.kept.filter(x => x.notable && !x.real_diff)) {
    lines.push(`  kept  ${k.repo}  ${k.path}  ${k.ticket}  ${k.why}${k.error ? `: ${k.error}` : ''}`);
  }
  // The ones only a human or the lane can decide on: short enough for the Conductor to relay.
  const realDiffs = report.kept.filter(x => x.real_diff);
  lines.push(`Done tickets kept for real changes: ${realDiffs.length} (a human or the lane decides; reap never removes them)`);
  for (const k of realDiffs) lines.push(`  ${k.ticket}  ${short(k.path)}  ${k.why}`);
  lines.push(`Folders that are not git worktrees (listed, never touched): ${report.non_worktree_folders.length}`);
  for (const f of report.non_worktree_folders) lines.push(`  ${f}`);
  return lines.join('\n');
}
