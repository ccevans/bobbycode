// commands/export.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { slugify } from '../lib/tickets.js';
import { success, error } from '../lib/colors.js';

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function registerExport(program) {
  program
    .command('export-plugin')
    .description('Export Bobby skills and agents as a Cowork plugin (.zip)')
    .option('-o, --output <path>', 'Output directory', '.')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const outputDir = path.resolve(opts.output);
        const projectSlug = slugify(config.project);

        const skillsDir = path.join(root, '.claude', 'skills');
        const agentsDir = path.join(root, '.claude', 'agents');

        if (!fs.existsSync(skillsDir)) {
          error('No .claude/skills/ found. Run "bobby init" first.');
          process.exit(1);
        }

        // Create temp plugin structure
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-plugin-'));
        const pluginDir = path.join(tmpDir, `bobby-${projectSlug}`);

        // .claude-plugin/plugin.json
        const manifestDir = path.join(pluginDir, '.claude-plugin');
        fs.mkdirSync(manifestDir, { recursive: true });
        fs.writeFileSync(path.join(manifestDir, 'plugin.json'), JSON.stringify({
          name: `bobby-${projectSlug}`,
          version: '1.0.0',
          description: `Bobby workflow skills and agents for ${config.project}`,
          skills: './skills/',
          agents: './agents/',
        }, null, 2) + '\n');

        // Copy skills and agents
        copyDirRecursive(skillsDir, path.join(pluginDir, 'skills'));
        copyDirRecursive(agentsDir, path.join(pluginDir, 'agents'));

        // Zip
        const zipName = `bobby-${projectSlug}.zip`;
        const zipPath = path.join(outputDir, zipName);
        execSync(`cd "${pluginDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: 'pipe' });

        // Cleanup
        fs.rmSync(tmpDir, { recursive: true });

        success(`Exported plugin: ${zipPath}`);
        console.log('');
        console.log('  Upload to Claude Desktop: Customize → Upload Plugin');
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
