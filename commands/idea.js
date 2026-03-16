// commands/idea.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { nextIdeaId } from '../lib/counter.js';
import { slugify } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

export function registerIdea(program) {
  program
    .command('idea <title>')
    .description('Create a lightweight idea in 0-ideas')
    .option('--area <area>', 'Feature area')
    .option('--author <name>', 'Who suggested it', 'unknown')
    .action((title, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const id = nextIdeaId(ticketsDir, config.idea_prefix);
        const slug = slugify(title);
        const filename = `${id}--${slug}.md`;
        const filepath = path.join(ticketsDir, '0-ideas', filename);
        const dt = new Date().toISOString().split('T')[0];

        const content = `# ${id}: ${title}

**Author:** ${opts.author}
**Date:** ${dt}
**Area:** ${opts.area || '_unspecified_'}

## Description
_Describe the idea here._

## Notes
_Optional context, links, screenshots, etc._
`;
        fs.writeFileSync(filepath, content, 'utf8');
        success(`Created ${id} — ${title}`);
        console.log(`  → ${config.tickets_dir}/0-ideas/${filename}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
