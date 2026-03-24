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

/**
 * Extract the body from a markdown file (everything after the closing --- of frontmatter).
 */
function extractMarkdownBody(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

/**
 * Copy agent files with SKILL.md and learnings.md content inlined,
 * so agents are self-contained in the plugin (no dangling file references).
 */
function copyAgentsWithInlining(agentsDir, skillsDir, destDir) {
  if (!fs.existsSync(agentsDir)) return;
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(agentsDir)) {
    const srcPath = path.join(agentsDir, entry);
    if (!entry.endsWith('.md') || fs.statSync(srcPath).isDirectory()) continue;

    let content = fs.readFileSync(srcPath, 'utf-8');

    // Find and inline SKILL.md references
    const skillMatch = content.match(/\.claude\/skills\/([^/]+)\/SKILL\.md/);
    if (skillMatch) {
      const skillName = skillMatch[0];
      const skillDir = skillMatch[1];
      const skillPath = path.join(skillsDir, skillDir, 'SKILL.md');
      const skillBody = extractMarkdownBody(skillPath);
      if (skillBody) {
        // Replace the "Load and follow..." line with actual content
        content = content.replace(
          /^.*Load and follow the skill instructions in.*$/m,
          skillBody
        );
      }
    }

    // Find and inline learnings.md references
    const learningsMatch = content.match(/\.claude\/skills\/([^/]+)\/learnings\.md/);
    if (learningsMatch) {
      const learningsDir = learningsMatch[1];
      const learningsPath = path.join(skillsDir, learningsDir, 'learnings.md');
      if (fs.existsSync(learningsPath)) {
        const learningsContent = fs.readFileSync(learningsPath, 'utf-8').trim();
        // Replace the "Read learnings" line with actual content
        content = content.replace(
          /^.*Read `\.claude\/skills\/[^/]+\/learnings\.md`.*$/m,
          `### Learnings & Anti-patterns\n\n${learningsContent}`
        );
      }
    }

    fs.writeFileSync(path.join(destDir, entry), content);
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
        const projectName = typeof config.project === 'string' ? config.project : config.project?.name || 'unknown';

        const skillsDir = path.join(root, '.claude', 'skills');
        const agentsDir = path.join(root, '.claude', 'agents');

        if (!fs.existsSync(skillsDir)) {
          error('No .claude/skills/ found. Run "bobby init" first.');
          process.exit(1);
        }

        // Create temp plugin structure
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-plugin-'));
        const pluginDir = path.join(tmpDir, 'bobby');

        // .claude-plugin/plugin.json
        const manifestDir = path.join(pluginDir, '.claude-plugin');
        fs.mkdirSync(manifestDir, { recursive: true });
        fs.writeFileSync(path.join(manifestDir, 'plugin.json'), JSON.stringify({
          name: 'bobby',
          version: '1.0.0',
          description: `Bobby workflow skills and agents for ${projectName}`,
          author: { name: 'bobby' },
          skills: './skills/',
          agents: './agents/',
        }, null, 2) + '\n');

        // Copy skills (as-is) and agents (with inlined content)
        copyDirRecursive(skillsDir, path.join(pluginDir, 'skills'));
        copyAgentsWithInlining(agentsDir, skillsDir, path.join(pluginDir, 'agents'));

        // Zip
        const zipName = 'bobby.zip';
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
