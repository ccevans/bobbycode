// commands/move.js
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { moveTicket, findTicket } from '../lib/tickets.js';
import { resolveTransition, stageColor } from '../lib/stages.js';
import { success, bold, error } from '../lib/colors.js';

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
        const ticketsDir = path.join(root, config.tickets_dir);

        // Handle special aliases
        if (alias === 'reject') {
          const comment = reason || 'Rejected';
          moveTicket(ticketsDir, id, 'building', opts.by, `REJECTED: ${comment}`);
          const colorFn = stageColor('building');
          success(`${bold(id)} → ${colorFn('building')} (rejected)`);
          return;
        }

        if (alias === 'block') {
          const comment = reason || 'Blocked';
          moveTicket(ticketsDir, id, 'blocked', opts.by, comment);
          const colorFn = stageColor('blocked');
          success(`${bold(id)} → ${colorFn('blocked')}: ${comment}`);
          return;
        }

        if (alias === 'unblock') {
          const found = findTicket(ticketsDir, id);
          if (!found) { error(`Ticket ${id} not found`); process.exit(1); }
          const restoreStage = found.data.previous_stage || 'backlog';
          moveTicket(ticketsDir, id, restoreStage, opts.by, 'Unblocked');
          const colorFn = stageColor(restoreStage);
          success(`${bold(id)} → ${colorFn(restoreStage)} (unblocked)`);
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
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
