// commands/comment.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { addComment } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerComment(program) {
  program
    .command('comment <id> <note...>')
    .description('Add a note to a ticket')
    .option('--by <who>', 'Who is commenting', 'user')
    .action((id, noteParts, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const note = noteParts.join(' ');

        addComment(ticketsDir, id, opts.by, note);
        success(`Comment added to ${id}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
