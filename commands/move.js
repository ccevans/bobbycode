// commands/move.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir, findMainWorktreeRoot } from '../lib/config.js';
import { moveTicket, findTicket, addComment, readTicket, writeTicket } from '../lib/tickets.js';
import { resolveTransition, stageColor } from '../lib/stages.js';
import { success, warn, bold, dim, error } from '../lib/colors.js';
import { tryLogEntry } from '../lib/session.js';
import { assertWalkedBeforeDone } from '../lib/walk.js';
import { runScopeCheck, formatScopeCheck } from '../lib/scope-check.js';
import { computeWorktreePlacement, removeWorktree } from '../lib/dashboard/worktree.js';

// Auto-reclaim a ticket's worktree once it ships. Ship has already pushed the
// branch to origin by this point (bobby-ship's own pre-flight requires it),
// so the local checkout is disposable — recreating it later just means
// checking the still-existing remote branch out again. Best-effort and
// silent on any failure (uncommitted changes, no worktree, not a git repo):
// a cleanup miss must never turn `ticket move done` into a hard failure.
function autoRemoveShippedWorktree(root, config, ticketsDir, id) {
  const found = findTicket(ticketsDir, id);
  if (!found || !found.data.worktree_path) return null;

  try {
    const repo = findMainWorktreeRoot() || root;
    const { worktreePath: computedPath, branch: computedBranch } = computeWorktreePlacement(repo, config, id);
    const targetPath = found.data.worktree_path || computedPath;
    const targetBranch = found.data.worktree_branch || computedBranch;

    const result = removeWorktree(repo, targetPath, { branch: targetBranch, force: false });
    if (!result.removed) return null;

    const ticket = readTicket(found.path);
    delete ticket.data.worktree_path;
    delete ticket.data.worktree_branch;
    ticket.data.updated = new Date().toISOString().split('T')[0];
    writeTicket(found.path, ticket.data, ticket.content);
    return result;
  } catch {
    return null;
  }
}

// Leaving building for any of these runs the scope check (reject/block/unblock never do).
const SCOPE_CHECK_TARGETS = ['security', 'reviewing', 'testing', 'shipping', 'done'];

export function registerMove(program) {
  program
    .command('move <id> <alias>')
    .argument('[reason]', 'Reason (for reject/block)')
    .description('Move ticket to a stage. Aliases: plan, build, review, test, ship, done, reject, block, unblock')
    .option('--by <who>', 'Who is moving it', 'system')
    .option('--skip-walk <reason>', 'Close an epic without a passing acceptance walk, saying why (recorded on the ticket)')
    .action((id, alias, reason, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        // Read current stage before move for session logging
        const before = findTicket(ticketsDir, id);
        const fromStage = before ? before.data.stage : 'unknown';

        // Handle special aliases
        if (alias === 'reject') {
          const comment = reason || 'Rejected';
          moveTicket(ticketsDir, id, 'building', opts.by, `REJECTED: ${comment}`);
          const colorFn = stageColor('building');
          success(`${bold(id)} → ${colorFn('building')} (rejected)`);
          tryLogEntry(root, config, { type: 'move', ticket: id, from: fromStage, to: 'building', detail: `REJECTED: ${comment}` });
          return;
        }

        if (alias === 'block') {
          const comment = reason || 'Blocked';
          moveTicket(ticketsDir, id, 'blocked', opts.by, comment);
          const colorFn = stageColor('blocked');
          success(`${bold(id)} → ${colorFn('blocked')}: ${comment}`);
          tryLogEntry(root, config, { type: 'move', ticket: id, from: fromStage, to: 'blocked', detail: comment });
          return;
        }

        if (alias === 'unblock') {
          const found = findTicket(ticketsDir, id);
          if (!found) { error(`Ticket ${id} not found`); process.exit(1); }
          const restoreStage = found.data.previous_stage || 'backlog';
          moveTicket(ticketsDir, id, restoreStage, opts.by, 'Unblocked');
          const colorFn = stageColor(restoreStage);
          success(`${bold(id)} → ${colorFn(restoreStage)} (unblocked)`);
          tryLogEntry(root, config, { type: 'move', ticket: id, from: 'blocked', to: restoreStage, detail: 'Unblocked' });
          return;
        }

        // Resolve alias to stage name
        const targetStage = resolveTransition(alias);
        if (!targetStage) {
          error(`Unknown alias '${alias}'. Use: plan, build, review, test, ship, done, reject, block, unblock`);
          process.exit(1);
        }

        // An epic is done only after its acceptance walk passes (lib/walk.js).
        if (targetStage === 'done') assertWalkedBeforeDone(before, opts.skipWalk || null);

        const comment = opts.skipWalk ? `Closed without a passing acceptance walk: ${opts.skipWalk}` : (reason || '');
        moveTicket(ticketsDir, id, targetStage, opts.by, comment);
        const colorFn = stageColor(targetStage);
        success(`${bold(id)} → ${colorFn(targetStage)}`);
        tryLogEntry(root, config, { type: 'move', ticket: id, from: fromStage, to: targetStage, detail: comment });

        if (fromStage === 'building' && SCOPE_CHECK_TARGETS.includes(targetStage)) {
          scopeCheck({ ticketsDir, before, id, root, config });
        }

        if (targetStage === 'done') {
          const cleanup = autoRemoveShippedWorktree(root, config, ticketsDir, id);
          if (cleanup) console.log(dim(`  worktree reclaimed${cleanup.docker?.tornDown ? ' (docker stack torn down)' : ''}`));
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}

// Warn-only: the move has already happened, so nothing in here may fail it.
function scopeCheck({ ticketsDir, before, id, root, config }) {
  try {
    const result = runScopeCheck({
      cwd: process.cwd(),
      ticketPath: before.path,
      studioRoot: config.studio ? root : null,
    });
    const { lines, comment } = formatScopeCheck(result, id);
    const clean = result.status === 'clean' || result.status === 'empty';
    lines.forEach((line, i) => {
      if (i === 0) (clean ? success : warn)(line);
      else console.log(`   ${line}`);
    });
    if (comment) addComment(ticketsDir, id, 'scope-check', comment);
  } catch (e) {
    warn(`Scope check failed: ${e.message}`);
  }
}
