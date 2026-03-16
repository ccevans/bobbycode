// commands/promote.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findIdea, createTicket } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerPromote(program) {
  program
    .command('promote <ideaId>')
    .description('Promote an idea to a ticket in backlog')
    .action((ideaId) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const ideaFile = findIdea(ticketsDir, ideaId);
        if (!ideaFile) { error(`Idea ${ideaId} not found in 0-ideas/`); process.exit(1); }

        // Extract title from idea
        const ideaContent = fs.readFileSync(ideaFile, 'utf8');
        const titleMatch = ideaContent.match(/^# .+?: (.+)/m);
        const title = titleMatch ? titleMatch[1] : 'Untitled idea';

        // Extract area
        const areaMatch = ideaContent.match(/^\*\*Area:\*\*\s*(.+)/m);
        let area = areaMatch ? areaMatch[1].trim() : '';
        if (area === '_unspecified_') area = '';

        const result = createTicket(ticketsDir, {
          prefix: config.ticket_prefix,
          title,
          type: 'feature',
          priority: 'medium',
          author: `promoted-from-${ideaId}`,
          area,
          areas: config.areas,
          skillRouting: config.skill_routing,
        });

        // Delete the idea file
        fs.unlinkSync(ideaFile);

        success(`${ideaId} promoted to ${result.id} in 1-backlog`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
