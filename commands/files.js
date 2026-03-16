// commands/files.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { bold, dim, error } from '../lib/colors.js';

export function registerFiles(program) {
  program
    .command('files <id>')
    .description('List all files in a ticket folder')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const found = findTicket(path.join(root, config.tickets_dir), id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        console.log('');
        console.log(`  ${bold(`Files for ${id}`)} ${dim(`(${found.stage})`)}`);
        console.log('');
        const entries = fs.readdirSync(found.path, { withFileTypes: true });
        for (const entry of entries) {
          const prefix = entry.isDirectory() ? '📁' : '📄';
          console.log(`    ${prefix} ${entry.name}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
