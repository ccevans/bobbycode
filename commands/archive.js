// commands/archive.js
import path from 'path';
import inquirer from 'inquirer';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { listTickets, updateTicket, addComment, daysBetween } from '../lib/tickets.js';
import { success, warn, dim, bold, error } from '../lib/colors.js';

export function registerArchive(program) {
  program
    .command('archive [ids...]')
    .description('Archive stale backlog tickets')
    .option('--stale <days>', 'Archive tickets older than N days (overrides .bobbyrc.yml)')
    .option('--dry-run', 'Show what would be archived without making changes')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (ids, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);

        let targets;

        if (ids.length > 0) {
          // Archive specific tickets
          const all = listTickets(ticketsDir);
          targets = all.filter(t => ids.includes(t.id));
          const missing = ids.filter(id => !targets.find(t => t.id === id));
          if (missing.length > 0) {
            error(`Tickets not found: ${missing.join(', ')}`);
            process.exit(1);
          }
        } else {
          // Auto-discover stale backlog tickets
          const staleDays = parseInt(opts.stale, 10) || config.backlog_stale_days || 60;
          const backlog = listTickets(ticketsDir, { stage: 'backlog' });
          targets = backlog.filter(t => daysBetween(t.updated || t.created) >= staleDays);

          if (targets.length === 0) {
            console.log(`  ${dim(`No backlog tickets older than ${staleDays} days.`)}`);
            return;
          }
        }

        console.log('');
        console.log(`  ${bold('ARCHIVE')} — ${targets.length} ticket(s)`);
        console.log('');

        for (const t of targets) {
          const age = daysBetween(t.updated || t.created);
          console.log(`    ${bold(t.id)}  ${t.title}  ${dim(`[${t.priority}]`)}  ${dim(`${age} days old`)}`);
        }
        console.log('');

        if (opts.dryRun) {
          console.log(`  ${dim('Dry run — no changes made.')}`);
          return;
        }

        if (!opts.yes) {
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Archive ${targets.length} ticket(s)?`,
            default: false,
          }]);
          if (!confirm) {
            console.log(`  ${dim('Cancelled.')}`);
            return;
          }
        }

        for (const t of targets) {
          const age = daysBetween(t.updated || t.created);
          updateTicket(ticketsDir, t.id, { stage: 'done', archived: true });
          addComment(ticketsDir, t.id, 'system', `Archived: stale for ${age} days`);
        }

        success(`Archived ${targets.length} ticket(s).`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
