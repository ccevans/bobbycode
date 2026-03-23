// commands/learn.js
import fs from 'fs';
import path from 'path';
import { findProjectRoot } from '../lib/config.js';
import { success, error } from '../lib/colors.js';

const VALID_SKILLS = ['bobby-plan', 'bobby-build', 'bobby-review', 'bobby-test', 'bobby-ship'];

export function registerLearn(program) {
  program
    .command('learn <skill> <pattern> <description>')
    .description('Add an anti-pattern to a skill\'s learnings')
    .option('--source <retroId>', 'Source retrospective ID')
    .action((skill, pattern, description, opts) => {
      try {
        if (!VALID_SKILLS.includes(skill)) {
          error(`Unknown skill '${skill}'. Valid: ${VALID_SKILLS.join(', ')}`);
          process.exit(1);
        }

        const root = findProjectRoot();
        const learningsFile = path.join(root, '.claude', 'skills', skill, 'learnings.md');
        if (!fs.existsSync(learningsFile)) {
          error(`Learnings file not found: ${learningsFile}`);
          process.exit(1);
        }

        let entry = `- **${pattern}**: ${description}`;
        if (opts.source) entry += ` (source: ${opts.source})`;

        let content = fs.readFileSync(learningsFile, 'utf8');
        // Insert after ## Anti-Patterns heading
        content = content.replace(
          /(## Anti-Patterns[^\n]*\n(?:<!--[^>]*-->\n)?)/,
          `$1\n${entry}\n`
        );
        fs.writeFileSync(learningsFile, content, 'utf8');

        success(`Added learning to ${skill}: ${pattern}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
