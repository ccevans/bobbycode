// commands/comment.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerComment(program) {
  program
    .command('comment <id> <section> <note...>')
    .description('Add a dev or QE note to a ticket')
    .action((id, section, noteParts) => {
      try {
        if (!['dev', 'test'].includes(section)) {
          error("Section must be 'dev' or 'test'");
          process.exit(1);
        }

        const root = findProjectRoot();
        const config = readConfig(root);
        const found = findTicket(path.join(root, config.tickets_dir), id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const ticketFile = path.join(found.path, 'ticket.md');
        let content = fs.readFileSync(ticketFile, 'utf8');
        const dt = new Date().toISOString().split('T')[0];
        const note = noteParts.join(' ');
        const entry = `**[${dt}]** ${note}`;

        const marker = section === 'dev' ? '_Engineer updates' : '_Test feedback';
        content = content.replace(
          new RegExp(`(${marker}[^\\n]*\\n)`),
          `$1\n${entry}\n`
        );
        content = content.replace(/^\*\*Updated:\*\*.*/m, `**Updated:** ${dt}`);
        fs.writeFileSync(ticketFile, content, 'utf8');

        success(`${section} note added to ${id}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
