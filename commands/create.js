// commands/create.js
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { createTicket } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerCreate(program) {
  program
    .command('create')
    .description('Create a new ticket in backlog')
    .requiredOption('-t, --title <title>', 'Ticket title')
    .option('--type <type>', 'Ticket type (bug, feature, improvement, task)', 'feature')
    .option('-p, --priority <priority>', 'Priority (critical, high, medium, low)', 'medium')
    .option('-a, --author <author>', 'Created by', 'unknown')
    .option('--area <area>', 'Feature area')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const result = createTicket(ticketsDir, {
          prefix: config.ticket_prefix,
          title: opts.title,
          type: opts.type,
          priority: opts.priority,
          author: opts.author,
          area: opts.area || '',
          areas: config.areas,
          skillRouting: config.skill_routing,
        });
        success(`Created ${result.id} — ${opts.title}`);
        console.log(`  → ${config.tickets_dir}/1-backlog/${result.dirname}/`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
