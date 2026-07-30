// test/lib/overlay.test.js
//
// The overlay contract: `X.ext` is shipped and regenerated on every upgrade;
// `X.local.ext` is the user's and is seeded once, then never written again.
// Breaking this silently destroys user customization, so it is pinned here.
import { isUserOwned, renderSkillTemplates, pruneStaleShipped } from '../../lib/template.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_PATHS = { agents: '.claude/agents', skills: '.claude/skills', commands: '.claude/commands', rules: 'CLAUDE.md' };
const DATA = {
  project: 'overlay-test',
  stack: 'generic',
  areas: [],
  health_checks: [],
  commands: { test: 'npm test', lint: 'npm run lint', dev: 'npm run dev', build: 'npm run build' },
  tickets_dir: '.bobby/tickets',
  bobby_dir: '.bobby',
  paths: DEFAULT_PATHS,
};

describe('overlay ownership', () => {
  describe('isUserOwned', () => {
    test.each([
      'SKILL.local.md',
      'CLAUDE.local.md',
      'learnings.local.md',
      'bobby-build.local.md',
      'settings.local.json',
    ])('%s is user-owned', (name) => {
      expect(isUserOwned(name)).toBe(true);
    });

    test.each([
      'SKILL.md',
      'CLAUDE.md',
      'learnings.md',
      'bobby-build.md',
      'local.md',           // not an overlay — no base file
      'my.local.md.bak',    // .local must be the final segment before the ext
    ])('%s is shipped', (name) => {
      expect(isUserOwned(name)).toBe(false);
    });
  });

  describe('renderSkillTemplates', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-overlay-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('seeds .local files on first render', () => {
      renderSkillTemplates(tmpDir, DATA);
      expect(fs.existsSync(path.join(tmpDir, 'bobby-design', 'learnings.local.md'))).toBe(true);
    });

    test('never overwrites a .local file on re-render', () => {
      renderSkillTemplates(tmpDir, DATA);
      const local = path.join(tmpDir, 'bobby-design', 'learnings.local.md');
      fs.writeFileSync(local, 'MY PROJECT LEARNING', 'utf8');

      renderSkillTemplates(tmpDir, DATA);

      expect(fs.readFileSync(local, 'utf8')).toBe('MY PROJECT LEARNING');
    });

    test('preserves a .local file the user created that Bobby never ships', () => {
      renderSkillTemplates(tmpDir, DATA);
      const custom = path.join(tmpDir, 'bobby-design', 'SKILL.local.md');
      fs.writeFileSync(custom, 'PROJECT DESIGN RULES', 'utf8');

      renderSkillTemplates(tmpDir, DATA);

      expect(fs.readFileSync(custom, 'utf8')).toBe('PROJECT DESIGN RULES');
    });

    test('DOES overwrite shipped files, so upgrades actually deliver', () => {
      renderSkillTemplates(tmpDir, DATA);
      const shipped = path.join(tmpDir, 'bobby-design', 'learnings.md');
      const original = fs.readFileSync(shipped, 'utf8');
      fs.writeFileSync(shipped, 'stale', 'utf8');

      renderSkillTemplates(tmpDir, DATA);

      expect(fs.readFileSync(shipped, 'utf8')).toBe(original);
    });

    test('every skill ships both a learnings.md and a learnings.local.md', () => {
      renderSkillTemplates(tmpDir, DATA);
      const skills = fs.readdirSync(tmpDir).filter(d => fs.statSync(path.join(tmpDir, d)).isDirectory());
      expect(skills.length).toBeGreaterThan(0);
      for (const skill of skills) {
        expect(fs.existsSync(path.join(tmpDir, skill, 'learnings.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, skill, 'learnings.local.md'))).toBe(true);
      }
    });

    test('every SKILL.md tells the agent to read its .local overlay', () => {
      renderSkillTemplates(tmpDir, DATA);
      const skills = fs.readdirSync(tmpDir).filter(d => fs.existsSync(path.join(tmpDir, d, 'SKILL.md')));
      for (const skill of skills) {
        const body = fs.readFileSync(path.join(tmpDir, skill, 'SKILL.md'), 'utf8');
        expect(body).toMatch(/\.local\.md/);
      }
    });

    test('pruneStaleShipped removes only stale bobby-* shipped files', () => {
      const dir = path.join(tmpDir, 'agents');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'bobby-old.md'), 'no longer ships');
      fs.writeFileSync(path.join(dir, 'bobby-old.local.md'), 'MY OVERRIDES');
      fs.writeFileSync(path.join(dir, 'bobby-build.md'), 'still ships');
      fs.writeFileSync(path.join(dir, 'my-agent.md'), 'custom, non-bobby name');

      const removed = pruneStaleShipped(dir, new Set(['bobby-build.md']));

      expect(removed).toEqual(['bobby-old.md']);
      // stale shipped file gone; everything the user owns is untouched
      expect(fs.existsSync(path.join(dir, 'bobby-old.md'))).toBe(false);
      expect(fs.readFileSync(path.join(dir, 'bobby-old.local.md'), 'utf8')).toBe('MY OVERRIDES');
      expect(fs.existsSync(path.join(dir, 'bobby-build.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'my-agent.md'))).toBe(true);
    });

    test('pruneStaleShipped on a missing directory is a no-op', () => {
      expect(pruneStaleShipped(path.join(tmpDir, 'nope'), new Set())).toEqual([]);
    });

    test('no raw EJS survives rendering', () => {
      renderSkillTemplates(tmpDir, DATA);
      const walk = (dir) => fs.readdirSync(dir).flatMap((e) => {
        const p = path.join(dir, e);
        return fs.statSync(p).isDirectory() ? walk(p) : [p];
      });
      for (const file of walk(tmpDir)) {
        expect(fs.readFileSync(file, 'utf8')).not.toMatch(/<%[=-]?\s/);
      }
    });
  });
});
