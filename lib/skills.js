// lib/skills.js
// v2 per-project skill overlays. Bobby already layers a skill as
//   SKILL.md (shipped)  <-  SKILL.local.md (workspace, yours).
// v2 adds a third, project-scoped tier so one project can reshape a skill and
// keep its own learnings without leaking into sibling projects:
//   .bobby/<project>/skills/<skill>/SKILL.local.md   (project instructions)
//   .bobby/<project>/skills/<skill>/learnings.local.md (project learnings)
import fs from 'fs';
import path from 'path';

const OVERLAY_FILES = ['SKILL.local.md', 'learnings.local.md'];

/** Relative path to the active project's skills overlay dir, or null (v1 / no project). */
export function projectSkillsRelDir(config) {
  if (config && config.layout === 'v2' && config._project) return path.join('.bobby', config._project, 'skills');
  return null;
}

/** Absolute learnings overlay file for a specific project + skill. */
export function projectLearningsFile(root, project, skill) {
  return path.join(root, '.bobby', project, 'skills', skill, 'learnings.local.md');
}

/**
 * The ordered list of skill files an agent should read for `skill`, nearest-wins
 * last: shared SKILL.md/.local + learnings, then the project overlay files that
 * exist. Only existing files are returned.
 */
export function resolveSkillLayers(root, config, skill, sharedSkillsRel = '.claude/skills') {
  const layers = [];
  const shared = path.join(root, sharedSkillsRel, skill);
  for (const f of ['SKILL.md', 'SKILL.local.md', 'learnings.md', 'learnings.local.md']) {
    const p = path.join(shared, f);
    if (fs.existsSync(p)) layers.push(p);
  }
  const rel = projectSkillsRelDir(config);
  if (rel) {
    for (const f of OVERLAY_FILES) {
      const p = path.join(root, rel, skill, f);
      if (fs.existsSync(p)) layers.push(p);
    }
  }
  return layers;
}

/**
 * A prompt clause telling an agent to honor the active project's skill overlay.
 * Empty string in v1 or when no project is active, so it appends harmlessly.
 */
export function overlayPromptClause(config) {
  const rel = projectSkillsRelDir(config);
  if (!rel) return '';
  return `\n\nProject skill overlay (project: ${config._project}): before you start, also read — if present — ` +
    `\`${rel}/<your-skill>/SKILL.local.md\` and \`${rel}/<your-skill>/learnings.local.md\`. ` +
    `These are project-specific and WIN over the shared skill instructions and learnings on any conflict.`;
}

/**
 * A prompt clause telling an agent to scope its work to the repos a ticket
 * touches. Empty in v1 or when the project has no repo group.
 */
export function repoTargetingClause(config) {
  if (!config || config.layout !== 'v2') return '';
  const group = config.repo_group || {};
  if (!Object.keys(group).length) return '';
  return `\n\nMulti-repo project: read the ticket's \`repos\` frontmatter (falls back to the project's ` +
    `\`repos\` if unset). For each repo name, resolve its path from the \`repos:\` map in the workspace ` +
    `\`.bobbyrc.yml\` (relative paths are under \`repos/\`), and run that repo's build/test commands from ` +
    `inside its directory. Do NOT touch repos the ticket doesn't list.`;
}
