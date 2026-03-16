// commands/list.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { STAGES, stageColor } from '../lib/stages.js';
import { bold, dim, error } from '../lib/colors.js';

export function registerList(program) {
  program
    .command('list [stage]')
    .description('Show ticket board (optionally filter by stage)')
    .action((filterStage) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);

        console.log('');
        console.log(`  ${bold('TICKET BOARD')}`);
        console.log('  ═══════════════════════════════════════════════════');
        console.log('');

        for (const stage of STAGES) {
          if (filterStage && filterStage !== stage) continue;

          const stageDir = path.join(ticketsDir, stage);
          const colorFn = stageColor(stage);

          let entries = [];
          if (fs.existsSync(stageDir)) {
            if (stage === '0-ideas') {
              entries = fs.readdirSync(stageDir).filter(f => f.match(/^IDEA-.*\.md$/));
            } else {
              entries = fs.readdirSync(stageDir).filter(f => {
                return f.match(new RegExp(`^${config.ticket_prefix}-`)) &&
                  fs.statSync(path.join(stageDir, f)).isDirectory();
              });
            }
          }

          console.log(`  ${colorFn(bold(`▎ ${stage.toUpperCase()}`))} ${dim(`(${entries.length})`)}`);

          if (entries.length === 0) {
            console.log(`    ${dim('(empty)')}`);
          } else if (stage === '0-ideas') {
            for (const entry of entries) {
              const name = entry.replace('.md', '');
              const ideaId = name.split('--')[0];
              const ideaTitle = name.split('--').slice(1).join(' ').replace(/-/g, ' ');
              console.log(`    ${bold(ideaId)}  ${ideaTitle}`);
            }
          } else {
            for (const entry of entries) {
              const ticketId = entry.split('--')[0];
              const ticketTitle = entry.split('--').slice(1).join(' ').replace(/-/g, ' ');
              // Read priority from ticket.md
              let priority = '';
              let assignee = '';
              const ticketFile = path.join(stageDir, entry, 'ticket.md');
              if (fs.existsSync(ticketFile)) {
                const content = fs.readFileSync(ticketFile, 'utf8');
                const pMatch = content.match(/^\*\*Priority:\*\*\s*(.+)/m);
                if (pMatch) priority = pMatch[1].trim();
                const aMatch = content.match(/^\*\*Assigned to:\*\*\s*(.+)/m);
                if (aMatch) assignee = aMatch[1].trim();
              }
              console.log(`    ${bold(ticketId)}  ${ticketTitle}  ${dim(`[${priority}]`)}  ${dim(`→ ${assignee}`)}`);
            }
          }
          console.log('');
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
