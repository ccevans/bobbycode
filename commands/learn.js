// commands/learn.js
import fs from 'fs';
import path from 'path';
import { findProjectRoot, readConfig, resolveActiveProject, resolveRepoPath } from '../lib/config.js';
import { projectLearningsFile } from '../lib/skills.js';
import { success, error } from '../lib/colors.js';
import { getTarget } from '../lib/targets/index.js';
import { autoSync } from '../lib/auto-sync.js';

/**
 * Resolve a real skills directory to validate a skill NAME against.
 *
 * v1 (single-repo): the project root carries `<root>/.claude/skills`, so that is
 * the dir. In a STUDIO the root has NO `.claude/skills` — skills live inside each
 * code repo (`repos/<name>/.claude/skills`) — so fall back to the first of the
 * active project's repos that actually carries them. Returns null when none is
 * reachable (e.g. a studio whose repos aren't checked out here); callers must
 * then degrade rather than blindly `readdirSync` a directory that isn't there.
 */
function resolveSkillsDir(root, config, skillsRel) {
  const local = path.join(root, skillsRel);
  if (fs.existsSync(local)) return local;        // v1, and any studio that has one
  if (config.studio) {
    const group = config.repo_group || config.repos || {};
    const names = (config.project_repos && config.project_repos.length)
      ? config.project_repos
      : Object.keys(group);
    for (const name of names) {
      try {
        const dir = path.join(resolveRepoPath(root, config, name), skillsRel);
        if (fs.existsSync(dir)) return dir;
      } catch { /* name not in the studio's repo group — skip it */ }
    }
  }
  return null;
}

export function registerLearn(program) {
  program
    .command('learn <skill> <pattern> <description>')
    .description('Add an anti-pattern to a skill\'s learnings')
    .option('--source <retroId>', 'Source retrospective ID')
    .option('--studio', 'Write to the shared studio learnings, not the active project')
    .action((skill, pattern, description, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const target = getTarget(config.target || 'claude-code');
        const skillsRel = target.paths().skills;

        // Where the skill NAME is validated. In a studio the studio root has no
        // `.claude/skills` (skills live in the code repos), so this resolves a
        // repo's dir instead of the nonexistent studio-root one — the old code
        // `readdirSync`'d `<studio-root>/.claude/skills` and died with ENOENT
        // before it ever reached the (correct) project-overlay write path. A
        // null result means no skills dir is reachable here: we can't validate
        // the name, but we must not crash — the write below creates the overlay.
        const skillsDir = resolveSkillsDir(root, config, skillsRel);
        if (skillsDir && !fs.existsSync(path.join(skillsDir, skill))) {
          const validSkills = fs.readdirSync(skillsDir)
            .filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
            .sort();
          error(`Unknown skill '${skill}'. Valid: ${validSkills.join(', ')}`);
          process.exit(1);
        }

        // v2: a learning defaults to the active project so a lesson from one
        // project doesn't leak into its siblings. `--studio` forces the
        // shared overlay. v1 (or no active project) always writes shared.
        // Both `learnings.md` files are shipped/replaced on upgrade, so we only
        // ever write the user-owned `.local` variant.
        const project = (config.studio && !opts.studio) ? resolveActiveProject(root) : null;
        let learningsFile;
        if (project) {
          // Studio default (what every agent hits): the project overlay under
          // .bobby/<project>/skills — mkdir'd here since it may not exist yet.
          learningsFile = projectLearningsFile(root, project, skill);
          fs.mkdirSync(path.dirname(learningsFile), { recursive: true });
        } else if (skillsDir) {
          // v1, or `--studio` with a reachable skills dir: write the user-owned
          // overlay right next to the shared skill.
          learningsFile = path.join(skillsDir, skill, 'learnings.local.md');
        } else {
          // No active project (so no per-project overlay) and no reachable skills
          // dir — only possible in a studio with `--studio` (or nothing selected)
          // whose repos aren't checked out here. Nothing to target; say so
          // clearly instead of crashing on a missing path.
          throw new Error(
            `Cannot record a learning for '${skill}': no skills directory is reachable ` +
            `and no project is active. Select a project (BOBBY_PROJECT / bobby project use) ` +
            `or run where ${skillsRel} exists.`
          );
        }
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
        autoSync(root, [path.relative(root, learningsFile)]);

        const scope = project ? `project ${project}` : 'studio';
        success(`Added learning to ${skill} (${scope}): ${pattern}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
