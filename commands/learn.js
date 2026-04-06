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
        const learningsFile = path.join(skillsDir, skill, 'learnings.md');

        if (!fs.existsSync(learningsFile)) {
          // Discover which skills have learnings files
          const validSkills = fs.readdirSync(skillsDir)
            .filter(d => fs.existsSync(path.join(skillsDir, d, 'learnings.md')))
            .sort();
          error(`Unknown skill '${skill}'. Valid: ${validSkills.join(', ')}`);
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
        autoSync(root, config.bobby_dir || '.bobby');

        success(`Added learning to ${skill}: ${pattern}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
