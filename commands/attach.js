// commands/attach.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { success, error, warn } from '../lib/colors.js';

export function registerAttach(program) {
  program
    .command('attach <id> <files...>')
    .description('Attach files (screenshots, logs, etc.) to a ticket')
    .option('--dir <subdir>', 'Subdirectory inside test-evidence', 'screenshots')
    .option('--move', 'Move the file instead of copying (removes the original)')
    .action((id, files, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        const found = findTicket(ticketsDir, id);
        if (!found) {
          error(`Ticket ${id} not found`);
          process.exit(1);
        }

        const destDir = path.join(found.path, 'test-evidence', opts.dir);
        fs.mkdirSync(destDir, { recursive: true });

        let attached = 0;
        for (const file of files) {
          const resolved = path.resolve(file);
          if (!fs.existsSync(resolved)) {
            warn(`File not found: ${file}`);
            continue;
          }
          const basename = path.basename(resolved);
          const dest = path.join(destDir, basename);
          fs.copyFileSync(resolved, dest);
          if (opts.move) fs.unlinkSync(resolved); // copy is the default — never destroy the original silently
          attached++;
        }

        if (attached === 0) {
          error('No files were attached');
          process.exit(1);
        }

        success(`Attached ${attached} file${attached === 1 ? '' : 's'} to ${id} in test-evidence/${opts.dir}/`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
