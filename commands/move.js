// commands/move.js
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { moveTicket } from '../lib/tickets.js';
import { stageColor } from '../lib/stages.js';
import { success, bold, error } from '../lib/colors.js';

export function registerMove(program) {
  program
    .command('move <id> <stage>')
    .description('Move ticket to a specific stage')
    .option('--by <who>', 'Who is moving it', 'system')
    .option('--comment <text>', 'Comment for the history')
    .action((id, stage, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const result = moveTicket(ticketsDir, id, stage, opts.by, opts.comment);
        const colorFn = stageColor(stage);
        success(`${bold(id)} → ${colorFn(stage)}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
