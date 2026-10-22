// commands/worktree.js
//
// Per-ticket git worktree management. Each ticket gets its own worktree +
// branch so concurrent bobby sessions on different tickets can't flip each
// other's branches mid-build.
//
// Reuses the primitives in lib/dashboard/worktree.js.

import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot, findMainWorktreeRoot, resolveTicketsDir } from '../lib/config.js';
import { findTicket, readTicket, writeTicket } from '../lib/tickets.js';
import {
  computeWorktreePlacement,
  createWorktree,
  removeWorktree,
  listWorktrees,
} from '../lib/dashboard/worktree.js';
import { success, bold, dim, error } from '../lib/colors.js';

function repoRoot(projectRoot) {
  return findMainWorktreeRoot() || projectRoot;
}

function placementFor(repoRootDir, config, id, kind = 'ticket') {
  return computeWorktreePlacement(repoRootDir, config, id, kind);
}

function persistWorktreeOnTicket(ticketsDir, id, worktreePath, branch) {
  const found = findTicket(ticketsDir, id);
  if (!found) return;
  const ticket = readTicket(found.path);
  ticket.data.worktree_path = worktreePath;
  ticket.data.worktree_branch = branch;
  ticket.data.updated = new Date().toISOString().split('T')[0];
  writeTicket(found.path, ticket.data, ticket.content);
}

function clearWorktreeOnTicket(ticketsDir, id) {
  const found = findTicket(ticketsDir, id);
  if (!found) return;
  const ticket = readTicket(found.path);
  delete ticket.data.worktree_path;
  delete ticket.data.worktree_branch;
  ticket.data.updated = new Date().toISOString().split('T')[0];
  writeTicket(found.path, ticket.data, ticket.content);
}

export function registerWorktree(program) {
  const wt = program
    .command('worktree')
    .description('Per-ticket git worktree management (POC — single-repo)');

  wt.command('create <id>')
    .description('Create a git worktree + branch for a ticket (or an epic with --feature)')
    .option('--feature', 'Scope the worktree to a feature/epic rather than a single ticket')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const repo = repoRoot(root);
        const kind = opts.feature ? 'feature' : 'ticket';
        let { worktreePath, branch } = placementFor(repo, config, id, kind);

        // Feature-scoped worktrees use the feature branch convention so PRs
        // line up with downstream tooling (ship, deploy, etc.).
        if (opts.feature) {
          const featurePrefix = (config.git_conventions && config.git_conventions.feature_branch_prefix) || 'feature';
          const titleSlug = String(found.data.title || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          branch = `${featurePrefix}/${id.toLowerCase()}${titleSlug ? `-${titleSlug}` : ''}`;
        }

        const result = createWorktree(repo, { worktreePath, branch });
        persistWorktreeOnTicket(ticketsDir, id, worktreePath, branch);

        if (result.created) {
          success(`${bold(id)} → worktree created`);
        } else {
          success(`${bold(id)} → worktree already exists`);
        }
        console.log(dim(`  path:   ${worktreePath}`));
        console.log(dim(`  branch: ${branch}`));
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  wt.command('path <id>')
    .description('Print the worktree path for a ticket (for `cd $(bobby worktree path TKT-XXX)`)')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        // Prefer stored path; fall back to computed placement.
        const stored = found.data.worktree_path;
        if (stored && fs.existsSync(stored)) {
          console.log(stored);
          return;
        }
        const repo = repoRoot(root);
        const { worktreePath } = placementFor(repo, config, id);
        if (!fs.existsSync(worktreePath)) {
          error(`No worktree for ${id}. Run \`bobby worktree create ${id}\` first.`);
          process.exit(1);
        }
        console.log(worktreePath);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  wt.command('remove <id>')
    .description('Remove a ticket worktree. Fails if uncommitted changes (use --force to override).')
    .option('--force', 'Force remove even with uncommitted changes')
    .option('--delete-branch', 'Also delete the branch')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const repo = repoRoot(root);
        const stored = found.data.worktree_path;
        const storedBranch = found.data.worktree_branch;
        const { worktreePath, branch } = placementFor(repo, config, id);
        const targetPath = stored || worktreePath;
        const targetBranch = storedBranch || branch;

        const result = removeWorktree(repo, targetPath, {
          deleteBranch: opts.deleteBranch,
          branch: targetBranch,
          force: opts.force,
        });
        clearWorktreeOnTicket(ticketsDir, id);

        if (result.removed) success(`${bold(id)} → worktree removed`);
        else success(`${bold(id)} → no worktree to remove`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  wt.command('list')
    .description('List all bobby-managed worktrees (ticket + feature scopes)')
    .action(() => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const repo = repoRoot(root);
        const worktrees = listWorktrees(repo);

        const prefix = config.git_conventions.worktree_prefix || 'bobby';
        const featurePrefix = config.git_conventions.feature_branch_prefix || 'feature';

        const managed = worktrees.filter(w =>
          w.branch && (
            w.branch.startsWith(`${prefix}/`) ||
            w.branch.startsWith(`${featurePrefix}/`)
          )
        );
        if (managed.length === 0) {
          console.log(dim('No bobby worktrees.'));
          return;
        }
        for (const w of managed) {
          console.log(`${bold(w.branch)}  ${dim(w.path)}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
