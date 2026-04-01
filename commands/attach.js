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

        let moved = 0;
        for (const file of files) {
          const resolved = path.resolve(file);
          if (!fs.existsSync(resolved)) {
            warn(`File not found: ${file}`);
            continue;
          }
          const basename = path.basename(resolved);
          const dest = path.join(destDir, basename);
          fs.copyFileSync(resolved, dest);
          fs.unlinkSync(resolved);
          moved++;
        }

        if (moved === 0) {
          error('No files were attached');
          process.exit(1);
        }

        success(`Attached ${moved} file${moved === 1 ? '' : 's'} to ${id} in test-evidence/${opts.dir}/`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
