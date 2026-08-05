// test/lib/skills.test.js — studio per-project skill overlays.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveSkillLayers, overlayPromptClause, projectSkillsRelDir, projectLearningsFile, repoTargetingClause } from '../../lib/skills.js';

function mkSkill(root, name) {
  const d = path.join(root, '.claude', 'skills', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), '# shipped');
  fs.writeFileSync(path.join(d, 'learnings.md'), '# shipped learnings');
}

describe('per-project skill overlays', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-skill-')); mkSkill(root, 'bobby-build'); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('v1 config: no project tier, clause is empty', () => {
    const cfg = {};
    expect(projectSkillsRelDir(cfg)).toBeNull();
    expect(overlayPromptClause(cfg)).toBe('');
    expect(resolveSkillLayers(root, cfg, 'bobby-build').map(p => path.basename(p)))
      .toEqual(['SKILL.md', 'learnings.md']);
  });

  test('studio with project: overlay files layer on last, nearest-wins', () => {
    const cfg = { studio: 's', _project: 'robinoffer' };
    // no overlay files yet → same as shared
    expect(resolveSkillLayers(root, cfg, 'bobby-build')).toHaveLength(2);
    // add project overlay files
    const pdir = path.join(root, '.bobby', 'robinoffer', 'skills', 'bobby-build');
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, 'SKILL.local.md'), '# project override');
    fs.writeFileSync(path.join(pdir, 'learnings.local.md'), '# project learnings');
    const layers = resolveSkillLayers(root, cfg, 'bobby-build');
    expect(layers.map(p => path.basename(p))).toEqual(['SKILL.md', 'learnings.md', 'SKILL.local.md', 'learnings.local.md']);
    // project files come from the project dir, last (win)
    expect(layers[layers.length - 1]).toBe(path.join(pdir, 'learnings.local.md'));
  });

  test('overlayPromptClause names the project and points at the overlay dir', () => {
    const clause = overlayPromptClause({ studio: 's', _project: 'robinoffer' });
    expect(clause).toContain('project: robinoffer');
    expect(clause).toContain(path.join('.bobby', 'robinoffer', 'skills'));
    expect(clause).toContain('WIN over the shared skill');
  });

  test('repoTargetingClause fires only for a studio with a repo group', () => {
    expect(repoTargetingClause({})).toBe('');
    expect(repoTargetingClause({ studio: 's', repo_group: {} })).toBe('');
    const c = repoTargetingClause({ studio: 's', repo_group: { app: { path: 'repos/app' } } });
    expect(c).toContain("ticket's `repos` frontmatter");
    expect(c).toContain("Do NOT touch repos the ticket doesn't list");
  });

  test('projectLearningsFile targets .bobby/<project>/skills/<skill>/learnings.local.md', () => {
    expect(projectLearningsFile(root, 'listrobin', 'bobby-build'))
      .toBe(path.join(root, '.bobby', 'listrobin', 'skills', 'bobby-build', 'learnings.local.md'));
  });
});
