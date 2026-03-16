// commands/plan.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { bold, dim, warn, error } from '../lib/colors.js';

export function registerPlan(program) {
  program
    .command('plan <id>')
    .description('View implementation plan for a ticket')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const found = findTicket(path.join(root, config.tickets_dir), id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }
        const planFile = path.join(found.path, 'plan.md');
        if (fs.existsSync(planFile)) {
          console.log('');
          console.log(`  ${dim(`Plan for ${bold(id)}`)}`);
          console.log('');
          console.log(fs.readFileSync(planFile, 'utf8'));
        } else {
          warn(`No plan.md found for ${id}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
