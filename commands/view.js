// commands/view.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { stageColor } from '../lib/stages.js';
import { bold, dim, error } from '../lib/colors.js';

export function registerView(program) {
  program
    .command('view <id>')
    .description('View ticket details')
    .option('--plan', 'Show implementation plan (plan.md)')
    .option('--files', 'List files in ticket folder')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const colorFn = stageColor(found.stage);

        if (opts.files) {
          // List files in ticket folder
          console.log('');
          console.log(`  ${bold(id)} — Files:`);
          const entries = fs.readdirSync(found.path);
          for (const entry of entries) {
            console.log(`    ${entry}`);
          }
          return;
        }

        if (opts.plan) {
          // Show plan.md
          const planPath = path.join(found.path, 'plan.md');
          if (!fs.existsSync(planPath)) {
            console.log(`  ${dim('No plan.md found for')} ${bold(id)}`);
            return;
          }
          console.log(fs.readFileSync(planPath, 'utf8'));
          return;
        }

        // Default: show ticket details
        console.log('');
        console.log(`  ${dim('Stage:')} ${colorFn(bold(found.stage))}`);
        console.log(`  ${dim('Path:')}  ${config.tickets_dir}/${found.dirname}/`);
        if (found.data.blocked) {
          console.log(`  ${dim('Blocked:')} ${found.data.blocked_reason || 'yes'}`);
        }
        if (found.data.parent) {
          console.log(`  ${dim('Parent:')} ${found.data.parent}`);
        }
        console.log('');

        // Print the full ticket.md content (body only, not frontmatter)
        const ticketFile = path.join(found.path, 'ticket.md');
        console.log(found.content);

        if (fs.existsSync(path.join(found.path, 'plan.md'))) {
          console.log('');
          console.log(`  ${dim('───── Implementation Plan ─────')}`);
          const planLines = fs.readFileSync(path.join(found.path, 'plan.md'), 'utf8').split('\n');
          console.log(planLines.slice(0, 5).join('\n'));
          console.log(`  ${dim('... (use --plan for full plan)')}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
