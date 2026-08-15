// test/commands/learn.test.js
// `bobby learn` in both layouts. The studio cases pin PRO-028: the studio root
// has NO .claude/skills (skills live inside the code repos), so the skill-name
// validation must resolve a repo's skills dir instead of readdirSync'ing the
// nonexistent studio-root dir — and the learning must land in the project overlay.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby learn', () => {
  const bobby = path.resolve('bin/bobby.js');
  let tmp;

  // Registry disabled so the command can't reach outside the temp dir; HOME
  // pinned there too. autoSync is a no-op without a git repo.
  const run = (cwd, args, extraEnv = {}) => {
    const env = { ...process.env, HOME: tmp, BOBBY_NO_REGISTRY: '1', ...extraEnv };
    return execSync(`node ${bobby} ${args}`, { cwd, encoding: 'utf8', env });
  };

  const seedSkill = (skillsDir, name) => {
    const d = path.join(skillsDir, name);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'SKILL.md'), `# ${name}\n`);
  };

  const makeStudio = () => {
    const root = path.join(tmp, 'studio');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, '.bobbyrc.yml'), YAML.stringify({
      studio: 'demo',
      repos: { web: { path: 'repos/web' } },
    }));
    const projDir = path.join(root, '.bobby', 'alpha');
    fs.mkdirSync(path.join(projDir, 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(projDir, '.bobbyrc.yml'),
      YAML.stringify({ project: 'alpha', prefix: 'AL', repos: ['web'] }));
    fs.writeFileSync(path.join(projDir, 'tickets', '.counter'), '0');
    // The skills live in the code repo, NOT at the studio root.
    seedSkill(path.join(root, 'repos', 'web', '.claude', 'skills'), 'bobby-build');
    return { root, projDir };
  };

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-learn-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  // --- v1 (single-repo) — must stay exactly as before ---

  test('v1: writes to .claude/skills/<skill>/learnings.local.md', () => {
    const root = path.join(tmp, 'app');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, '.bobbyrc.yml'),
      YAML.stringify({ project: 'app', stack: 'generic' }));
    seedSkill(path.join(root, '.claude', 'skills'), 'bobby-build');

    const out = run(root, 'learn bobby-build "my-pattern" "my description"');

    const file = path.join(root, '.claude', 'skills', 'bobby-build', 'learnings.local.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('my-pattern');
    expect(out).toMatch(/Added learning to bobby-build/);
  });

  test('v1: unknown skill is rejected', () => {
    const root = path.join(tmp, 'app');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, '.bobbyrc.yml'),
      YAML.stringify({ project: 'app', stack: 'generic' }));
    seedSkill(path.join(root, '.claude', 'skills'), 'bobby-build');

    expect(() => run(root, 'learn not-a-skill "p" "d"')).toThrow(/Unknown skill/);
  });

  // --- studio (multi-repo) — the PRO-028 regression ---

  test('studio: writes the project overlay and does NOT crash on the missing studio-root .claude/skills', () => {
    const { root, projDir } = makeStudio();
    expect(fs.existsSync(path.join(root, '.claude', 'skills'))).toBe(false); // precondition

    const out = run(root, 'learn bobby-build "studio-pattern" "studio desc"', { BOBBY_PROJECT: 'alpha' });

    const overlay = path.join(projDir, 'skills', 'bobby-build', 'learnings.local.md');
    expect(fs.existsSync(overlay)).toBe(true);
    expect(fs.readFileSync(overlay, 'utf8')).toContain('studio-pattern');
    // Accurate scope in the confirmation message.
    expect(out).toMatch(/project alpha/);
  });

  test('studio: unknown skill still rejected (validated against a repo skills dir)', () => {
    makeStudio();
    expect(() => run(path.join(tmp, 'studio'), 'learn bogus-skill "p" "d"', { BOBBY_PROJECT: 'alpha' }))
      .toThrow(/Unknown skill/);
  });
});
