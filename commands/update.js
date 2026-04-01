// commands/update.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { updateTicket } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerUpdate(program) {
  program
    .command('update <id>')
    .description('Update fields on an existing ticket')
    .option('--parent <id>', 'Set parent epic ticket ID')
    .option('-p, --priority <priority>', 'Set priority (critical, high, medium, low)')
    .option('-a, --assigned <name>', 'Set assignee')
    .option('--title <title>', 'Set title')
    .option('--area <area>', 'Set feature area')
    .option('--type <type>', 'Set ticket type')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        const updates = {};
        if (opts.parent !== undefined) updates.parent = opts.parent || null;
        if (opts.priority) updates.priority = opts.priority;
        if (opts.assigned !== undefined) updates.assigned = opts.assigned || null;
        if (opts.title) updates.title = opts.title.trim();
        if (opts.area !== undefined) updates.area = opts.area || null;
        if (opts.type) updates.type = opts.type;

        if (Object.keys(updates).length === 0) {
          error('No updates specified. Use --parent, --priority, --assigned, --title, --area, or --type.');
          process.exit(1);
        }

        const result = updateTicket(ticketsDir, id, updates);
        success(`Updated ${result.id}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
