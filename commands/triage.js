// commands/triage.js
import path from 'path';
import inquirer from 'inquirer';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { listTickets, updateTicket, addComment, daysBetween, readTicket } from '../lib/tickets.js';
import { stageColor } from '../lib/stages.js';
import { success, dim, bold, error } from '../lib/colors.js';

export function registerTriage(program) {
  program
    .command('triage')
    .description('Interactive triage of backlog tickets')
    .option('--stale <days>', 'Only triage tickets older than N days')
    .option('--area <area>', 'Only triage tickets in a specific area')
    .action(async (opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        const filters = { stage: 'backlog', sort: 'oldest' };
        if (opts.area) filters.area = opts.area;
        if (opts.stale) filters.staleDays = parseInt(opts.stale, 10);

        const tickets = listTickets(ticketsDir, filters);

        if (tickets.length === 0) {
          console.log(`  ${dim('No backlog tickets to triage.')}`);
          return;
        }

        console.log('');
        console.log(`  ${bold('BACKLOG TRIAGE')} — ${tickets.length} ticket(s)`);
        console.log('  ═══════════════════════════════════════════════════');
        console.log('');

        const summary = { kept: 0, prioritized: 0, planned: 0, archived: 0, skipped: 0 };

        for (const t of tickets) {
          const age = daysBetween(t.updated || t.created);
          const ticket = readTicket(t.path);
          const hasAC = ticket && ticket.content.includes('- [') &&
            !/\[First criterion\]/.test(ticket.content);

          console.log(`  ${bold(t.id)}  ${t.title}`);
          console.log(`  ${dim(`Priority: ${t.priority} · Area: ${t.area || 'none'} · Age: ${age} days · AC: ${hasAC ? 'yes' : 'missing'}`)}`);
          console.log('');

          const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Action:',
            choices: [
              { name: 'Keep — leave as-is', value: 'keep' },
              { name: 'Prioritize — change priority', value: 'prioritize' },
              { name: 'Plan — move to planning', value: 'plan' },
              { name: 'Archive — close as stale', value: 'archive' },
              { name: 'Skip — decide later', value: 'skip' },
            ],
          }]);

          if (action === 'keep') {
            summary.kept++;
          } else if (action === 'prioritize') {
            const { newPriority } = await inquirer.prompt([{
              type: 'list',
              name: 'newPriority',
              message: 'New priority:',
              choices: ['critical', 'high', 'medium', 'low'],
              default: t.priority,
            }]);
            updateTicket(ticketsDir, t.id, { priority: newPriority });
            addComment(ticketsDir, t.id, 'system', `Reprioritized to ${newPriority} during triage`);
            summary.prioritized++;
          } else if (action === 'plan') {
            updateTicket(ticketsDir, t.id, { stage: 'planning' });
            addComment(ticketsDir, t.id, 'system', 'Moved to planning during triage');
            summary.planned++;
          } else if (action === 'archive') {
            updateTicket(ticketsDir, t.id, { stage: 'done', archived: true });
            addComment(ticketsDir, t.id, 'system', `Archived during triage (stale ${age} days)`);
            summary.archived++;
          } else {
            summary.skipped++;
          }

          console.log('');
        }

        // Summary
        console.log('  ═══════════════════════════════════════════════════');
        console.log(`  ${bold('TRIAGE COMPLETE')}`);
        const parts = [];
        if (summary.kept > 0) parts.push(`${summary.kept} kept`);
        if (summary.prioritized > 0) parts.push(`${summary.prioritized} reprioritized`);
        if (summary.planned > 0) parts.push(`${summary.planned} moved to planning`);
        if (summary.archived > 0) parts.push(`${summary.archived} archived`);
        if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
        console.log(`  ${parts.join(' · ')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
