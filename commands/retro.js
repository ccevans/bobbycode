// commands/retro.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket, slugify } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerRetro(program) {
  program
    .command('retro <id> <pattern>')
    .description('Create a retrospective from a ticket')
    .action((id, pattern) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const retroDir = path.join(ticketsDir, 'retrospectives');
        fs.mkdirSync(retroDir, { recursive: true });

        // Get next retro ID
        const counterFile = path.join(retroDir, '.retro-counter');
        let num = 0;
        if (fs.existsSync(counterFile)) {
          num = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
        }
        num++;
        fs.writeFileSync(counterFile, String(num), 'utf8');
        const retroId = `RETRO-${String(num).padStart(3, '0')}`;

        // Get ticket metadata
        const found = findTicket(ticketsDir, id);
        let ticketTitle = '', ticketPriority = '', ticketArea = '', rejectionHistory = '';
        const currentStage = found ? found.stage : 'unknown';
        if (found) {
          const content = fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8');
          const tMatch = content.match(/^# (.+)/m);
          if (tMatch) ticketTitle = tMatch[1];
          const pMatch = content.match(/^\*\*Priority:\*\*\s*(.+)/m);
          if (pMatch) ticketPriority = pMatch[1].trim();
          const aMatch = content.match(/^\*\*Area:\*\*\s*(.+)/m);
          if (aMatch) ticketArea = aMatch[1].trim();
          rejectionHistory = content.split('\n').filter(l => l.includes('needs-rework')).join('\n') || '_No rejection history found._';
        }

        const dt = new Date().toISOString().split('T')[0];
        const slug = slugify(pattern);
        const retroFile = path.join(retroDir, `${retroId}--${slug}.md`);

        const retroContent = `# ${retroId}: ${pattern}

**Discovered:** ${dt}
**Source tickets:** ${id}
**Stage caught:** ${currentStage}
**Category:** <!-- code-quality | process | testing | security | performance -->

## Ticket Context
- **Title:** ${ticketTitle || 'Unknown'}
- **Priority:** ${ticketPriority || 'Unknown'}
- **Area:** ${ticketArea || 'Unknown'}

## Rejection History
${rejectionHistory}

## Problem
<!-- What went wrong -->

## Root Cause
<!-- Why it happened -->

## Fix
<!-- How to prevent it -->

## Applies To
<!-- Which skills/stages should check for this -->
`;
        fs.writeFileSync(retroFile, retroContent, 'utf8');
        success(`Created ${retroId} — ${pattern}`);
        console.log(`  → ${config.tickets_dir}/retrospectives/${retroId}--${slug}.md`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
