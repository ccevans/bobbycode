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
//   - `git status --porcelain -uno` is empty: no modified or staged tracked file. Untracked
//     and ignored files (node_modules, .next, logs) do not block it and go with the folder;
//     committed work is on the branch, which stays.
//   - a detached HEAD must already be on some local or remote branch: a detached worktree has
//     no branch of its own to keep, so removing it would orphan commits made on it.
//   - no live session's cwd is inside it. Live means any session `claude agents` lists that
//     is not already ended: working, waiting on CC, interactive, unknown, or finished with
//     its process still running.
//   - it does not hold the directory this command runs from.
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

function describe(w) {
  return { repo: w.repo, path: w.path, branch: w.branch, ticket: w.ticket_ids.join(', ') || null, stage: w.stage };
}

/**
 * Sort classified worktrees (worktrees.js classifyWorktrees) into candidates and kept
 * ones, each kept one with its reason. `dirty(path)` returns the porcelain text of
 * `git status -uno` for a path; it is only called for a worktree that passed every other rule.
 * `onBranch(path)` says whether a detached HEAD is already on a branch; only asked for detached ones.
 */
export function evaluateWorktrees(worktrees, { live, cwd, dirty, onBranch }) {
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
    if (changes.trim()) {
      const n = changes.trim().split('\n').length;
      keep(`${n} tracked file(s) modified or staged`, { notable: true, group: 'tracked files modified or staged' });
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
    candidates.push({ ...describe(w), repo_path: w.repo_path, reason: `${w.ticket_ids.join(', ')} done, tracked files clean, no live session inside` });
  }
  return { candidates, kept };
}

function readDirty(run) {
  return (p) => run('git', ['-C', p, 'status', '--porcelain', '-uno']);
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
  const plan = evaluateWorktrees(scan.worktrees, { live: liveCwds(sessions), cwd, dirty: readDirty(run), onBranch: readOnBranch(run) });
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
        const again = evaluateWorktrees(only, { live: liveCwds(fresh.sessions), cwd, dirty: readDirty(run), onBranch: readOnBranch(run) });
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
export function renderWorktreeReap(report, { apply }) {
  const lines = [];
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
  for (const k of report.kept.filter(x => x.notable)) {
    lines.push(`  kept  ${k.repo}  ${k.path}  ${k.ticket}  ${k.why}${k.error ? `: ${k.error}` : ''}`);
  }
  lines.push(`Folders that are not git worktrees (listed, never touched): ${report.non_worktree_folders.length}`);
  for (const f of report.non_worktree_folders) lines.push(`  ${f}`);
  return lines.join('\n');
}
