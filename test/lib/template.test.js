// test/lib/template.test.js
import { renderTemplate, renderSkillTemplates } from '../../lib/template.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('template', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-tpl-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('renderTemplate renders EJS with config data', () => {
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth', 'billing'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      commands: { test: 'npm test', lint: 'npm run lint', dev: 'npm run dev', build: 'npm run build' },
      tickets_dir: 'tickets',
    };
    const result = renderTemplate('CLAUDE.md.ejs', config);
    expect(result).toContain('test-app');
    expect(result).toContain('auth');
    expect(result).toContain('http://localhost:3000');
  });

  test('renderSkillTemplates creates skill files', () => {
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      commands: { test: 'npm test', lint: 'npm run lint' },
      tickets_dir: 'tickets',
    };
    renderSkillTemplates(tmpDir, config);
    expect(fs.existsSync(path.join(tmpDir, 'work-tickets', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'qe', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'peer-review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'refine-tickets', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'release-tickets', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'ideate', 'SKILL.md'))).toBe(true);
    // Check content has templated values
    const workTickets = fs.readFileSync(path.join(tmpDir, 'work-tickets', 'SKILL.md'), 'utf8');
    expect(workTickets).toContain('http://localhost:3000');
    expect(workTickets).toContain('npm test');
  });
});
