// commands/create.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { createTicket, listTickets } from '../lib/tickets.js';
import { success, warn, error } from '../lib/colors.js';
import { tryLogEntry } from '../lib/session.js';

export function registerCreate(program) {
  program
    .command('create')
    .description('Create a new ticket in backlog')
    .requiredOption('-t, --title <title>', 'Ticket title')
    .option('--type <type>', 'Ticket type (bug, feature, improvement, task)', 'feature')
    .option('-p, --priority <priority>', 'Priority (critical, high, medium, low)', 'medium')
    .option('-a, --author <author>', 'Created by', 'unknown')
    .option('--area <area>', 'Feature area')
    .option('--epic', 'Create as an epic (bobby-plan will break it down)')
    .option('--parent <id>', 'Parent epic ticket ID')
    .option('--services <names>', 'Comma-separated service names this ticket touches')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const result = createTicket(ticketsDir, {
          prefix: config.ticket_prefix,
          title: opts.title.trim(),
          type: opts.epic ? 'epic' : opts.type,
          priority: opts.priority,
          author: opts.author,
          area: opts.area || '',
          parent: opts.parent || null,
          services: opts.services ? opts.services.split(',').map(s => s.trim()) : null,
        });
        success(`Created ${result.id} — ${opts.title}`);
        console.log(`  → ${config.tickets_dir}/${result.dirname}/`);
        tryLogEntry(root, config, { type: 'create', ticket: result.id, title: opts.title, ticketType: opts.epic ? 'epic' : opts.type, parent: opts.parent || null });
        if (opts.epic) {
          console.log(`  → Type: epic — run 'bobby run plan ${result.id}' to break it down`);
        }

        // Backlog cap warning
        if (config.backlog_limit) {
          const backlogCount = listTickets(ticketsDir, { stage: 'backlog' }).length;
          if (backlogCount > config.backlog_limit) {
            warn(`Backlog has ${backlogCount} items (limit: ${config.backlog_limit}). Run: bobby triage`);
          }
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
