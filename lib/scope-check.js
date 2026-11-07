// lib/scope-check.js
// "Stay in the ticket" — when a ticket leaves building, list the files changed on
// the branch that plan.md does not name, so the reviewer and the human see drift.
// Warn-only: it reports, it never blocks the move.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { detectMainBranch } from './dashboard/worktree.js';

const FILES_HEADING = /^#{1,6}\s*(?:\d+[.)]?\s*)?Files\b/im;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const lines = (out) => out.split('\n').map(l => l.trim()).filter(Boolean);

// Bobby's own bookkeeping is not the ticket's work.
const isBookkeeping = (f) => f.startsWith('.bobby/') || path.basename(f) === 'learnings.local.md';

/**
 * Files changed on the current branch of the git repo holding `cwd`: committed since
 * the base, uncommitted, and untracked.
 * @returns {{ ok: true, base: string, files: string[], top: string } | { ok: false, reason: string, top?: string }}
 */
export function changedFilesOnBranch(cwd) {
  let top;
  try {
    top = git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    return { ok: false, reason: 'not a git repository' };
  }
  const main = detectMainBranch(top);
  let current;
  try {
    current = git(top, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return { ok: false, reason: 'no commits yet', top };
  }
  const base = current === main ? '@{upstream}' : main;
  try {
    git(top, ['rev-parse', '--verify', '--quiet', base]);
  } catch {
    return {
      ok: false,
      reason: current === main ? `on ${main} with no upstream to compare against` : `base branch ${main} not found`,
      top,
    };
  }
  const names = [
    ...lines(git(top, ['diff', '--name-only', `${base}...HEAD`])),
    ...lines(git(top, ['diff', '--name-only', 'HEAD'])),
    ...lines(git(top, ['ls-files', '--others', '--exclude-standard'])),
  ];
  const files = [...new Set(names)].filter(f => !isBookkeeping(f)).sort();
  return { ok: true, base, files, top };
}

/**
 * Which changed files does the plan not name? A file is named when the plan text
 * contains its repo-relative path, or a backticked directory (`dir/`) that prefixes it.
 * @returns {{ listsFiles: boolean, named: string[], outOfPlan: string[] }}
 */
export function planFileCheck(planText, files) {
  const text = planText || '';
  const listsFiles = FILES_HEADING.test(text);
  const dirs = [...text.matchAll(/`([^`\s]+\/)`/g)].map(m => m[1].replace(/^\.\//, ''));
  const named = [];
  const outOfPlan = [];
  for (const f of files) {
    if (text.includes(f) || dirs.some(d => f.startsWith(d))) named.push(f);
    else outOfPlan.push(f);
  }
  return { listsFiles, named, outOfPlan };
}

/**
 * @returns {{ status: 'not-run'|'empty'|'clean'|'drift'|'unlisted'|'noplan', base?, files?, outOfPlan?, reason? }}
 */
export function runScopeCheck({ cwd, ticketPath, studioRoot = null }) {
  const changed = changedFilesOnBranch(cwd);
  // The studio root is not where code lives; say so before any other reason.
  if (studioRoot && changed.top && fs.realpathSync(changed.top) === fs.realpathSync(studioRoot)) {
    return { status: 'not-run', reason: 'run from the code repo checkout, not the studio root' };
  }
  if (!changed.ok) return { status: 'not-run', reason: changed.reason };
  const { base, files } = changed;
  if (files.length === 0) return { status: 'empty', base, files };

  const planPath = path.join(ticketPath, 'plan.md');
  if (!fs.existsSync(planPath)) return { status: 'noplan', base, files };
  const check = planFileCheck(fs.readFileSync(planPath, 'utf8'), files);
  if (!check.listsFiles) return { status: 'unlisted', base, files };
  if (check.outOfPlan.length === 0) return { status: 'clean', base, files };
  return { status: 'drift', base, files, outOfPlan: check.outOfPlan };
}

/**
 * @returns {{ lines: string[], comment: string|null }}
 */
export function formatScopeCheck(result, id) {
  const { status, files = [], outOfPlan = [] } = result;
  switch (status) {
    case 'not-run':
      return { lines: [`Scope check not run: ${result.reason}`], comment: null };
    case 'empty':
      return { lines: [`Scope check: no changed files vs ${result.base}`], comment: null };
    case 'clean':
      return { lines: [`Scope check: all ${files.length} changed file(s) are named in plan.md`], comment: null };
    case 'drift':
      return {
        lines: [
          `Scope check: ${outOfPlan.length} changed file(s) not named in plan.md:`,
          ...outOfPlan.map(f => `  ${f}`),
          `Each needs a reason tied to the ticket, or revert it and file it: bobby ticket create … --found-in ${id}`,
        ],
        comment: `Scope check: out of plan — ${outOfPlan.join(', ')}`,
      };
    default: {
      const why = status === 'noplan' ? 'no plan.md' : 'plan.md has no "Files to modify" section';
      return {
        lines: [`Scope check: ${why} — ${files.length} changed file(s) unchecked:`, ...files.map(f => `  ${f}`)],
        comment: `Scope check: unchecked (plan lists no files) — ${files.join(', ')}`,
      };
    }
  }
}
