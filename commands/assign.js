// commands/assign.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';
import chalk from 'chalk';

export function registerAssign(program) {
  program
    .command('assign <id> <name>')
    .description('Assign ticket to someone')
    .action((id, name) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const found = findTicket(path.join(root, config.tickets_dir), id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const ticketFile = path.join(found.path, 'ticket.md');
        let content = fs.readFileSync(ticketFile, 'utf8');
        content = content.replace(/^\*\*Assigned to:\*\*.*/m, `**Assigned to:** ${name}`);
        const dt = new Date().toISOString().split('T')[0];
        content = content.replace(/^\*\*Updated:\*\*.*/m, `**Updated:** ${dt}`);
        fs.writeFileSync(ticketFile, content, 'utf8');

        success(`${id} assigned to ${chalk.cyan(name)}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
