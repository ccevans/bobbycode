// commands/learn.js
import fs from 'fs';
import path from 'path';
import { findProjectRoot, readConfig } from '../lib/config.js';
import { success, error } from '../lib/colors.js';
import { getTarget } from '../lib/targets/index.js';
import { autoSync } from '../lib/auto-sync.js';

export function registerLearn(program) {
  program
    .command('learn <skill> <pattern> <description>')
    .description('Add an anti-pattern to a skill\'s learnings')
    .option('--source <retroId>', 'Source retrospective ID')
    .action((skill, pattern, description, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const target = getTarget(config.target || 'claude-code');
        const skillsDir = path.join(root, target.paths().skills);
        const skillDir = path.join(skillsDir, skill);

        if (!fs.existsSync(skillDir)) {
          const validSkills = fs.readdirSync(skillsDir)
            .filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
            .sort();
          error(`Unknown skill '${skill}'. Valid: ${validSkills.join(', ')}`);
          process.exit(1);
        }

        // Always write to the user-owned overlay. `learnings.md` is shipped and
        // is replaced on every upgrade — anything written there would be lost.
        const learningsFile = path.join(skillDir, 'learnings.local.md');
        let entry = `- **${pattern}**: ${description}`;
        if (opts.source) entry += ` (source: ${opts.source})`;

        const HEADING = '## Anti-Patterns';
        let content = fs.existsSync(learningsFile)
          ? fs.readFileSync(learningsFile, 'utf8')
          : `# ${skill} — This Project's Learnings\n\n${HEADING}\n`;

        // A missing heading used to make the replace a silent no-op that still
        // reported success (bobby-shared had no heading at all). Append instead.
        if (content.includes(HEADING)) {
          content = content.replace(
            /(## Anti-Patterns[^\n]*\n(?:<!--[^>]*-->\n)?)/,
            `$1\n${entry}\n`
          );
        } else {
          content = `${content.replace(/\s*$/, '')}\n\n${HEADING}\n\n${entry}\n`;
        }
        fs.writeFileSync(learningsFile, content, 'utf8');
        autoSync(root);

        success(`Added learning to ${skill}: ${pattern}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
