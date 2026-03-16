// commands/view.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { stageColor } from '../lib/stages.js';
import { bold, dim, error } from '../lib/colors.js';

export function registerView(program) {
  program
    .command('view <id>')
    .description('View ticket details')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const colorFn = stageColor(found.stage);
        console.log('');
        console.log(`  ${dim('Stage:')} ${colorFn(bold(found.stage))}`);
        console.log(`  ${dim('Path:')}  ${config.tickets_dir}/${found.stage}/${found.dirname}/`);
        console.log('');
        console.log(fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8'));

        if (fs.existsSync(path.join(found.path, 'plan.md'))) {
          console.log('');
          console.log(`  ${dim('───── Implementation Plan ─────')}`);
          const planLines = fs.readFileSync(path.join(found.path, 'plan.md'), 'utf8').split('\n');
          console.log(planLines.slice(0, 5).join('\n'));
          console.log(`  ${dim('... (see plan.md for full plan)')}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
