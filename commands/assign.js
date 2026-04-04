// commands/assign.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { findTicket, writeTicket } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';
import chalk from 'chalk';
import { tryLogEntry } from '../lib/session.js';

export function registerAssign(program) {
  program
    .command('assign <id> <name>')
    .description('Assign ticket to someone')
    .action((id, name) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const data = { ...found.data };
        data.assigned = name;
        data.updated = new Date().toISOString().split('T')[0];
        writeTicket(found.path, data, found.content);

        success(`${id} assigned to ${chalk.cyan(name)}`);
        tryLogEntry(root, config, { type: 'assign', ticket: id, agent: name });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
