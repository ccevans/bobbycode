// commands/move.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { moveTicket, findTicket, addComment } from '../lib/tickets.js';
import { resolveTransition, stageColor } from '../lib/stages.js';
import { success, warn, bold, error } from '../lib/colors.js';
import { tryLogEntry } from '../lib/session.js';
import { runScopeCheck, formatScopeCheck } from '../lib/scope-check.js';

// Leaving building for any of these runs the scope check (reject/block/unblock never do).
const SCOPE_CHECK_TARGETS = ['security', 'reviewing', 'testing', 'shipping', 'done'];

export function registerMove(program) {
  program
    .command('move <id> <alias>')
    .argument('[reason]', 'Reason (for reject/block)')
    .description('Move ticket to a stage. Aliases: plan, build, review, test, ship, done, reject, block, unblock')
    .option('--by <who>', 'Who is moving it', 'system')
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

        const comment = reason || '';
        moveTicket(ticketsDir, id, targetStage, opts.by, comment);
        const colorFn = stageColor(targetStage);
        success(`${bold(id)} → ${colorFn(targetStage)}`);
        tryLogEntry(root, config, { type: 'move', ticket: id, from: fromStage, to: targetStage, detail: comment });

        if (fromStage === 'building' && SCOPE_CHECK_TARGETS.includes(targetStage)) {
          scopeCheck({ ticketsDir, before, id, root, config });
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
