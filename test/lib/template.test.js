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
      tickets_dir: '.bobby/tickets',
      runs_dir: '.bobby/runs',
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
      tickets_dir: '.bobby/tickets',
      runs_dir: '.bobby/runs',
    };
    renderSkillTemplates(tmpDir, config);
    // 9 skills: bobby-plan, bobby-build, bobby-review, bobby-test, bobby-ship, bobby-ux, bobby-pm, bobby-qe, bobby-pipeline
    expect(fs.existsSync(path.join(tmpDir, 'bobby-plan', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-build', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-test', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ship', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-pm', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-qe', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-pipeline', 'SKILL.md'))).toBe(true);
  });

  test('renderSkillTemplates handles subdirectories (references)', () => {
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      commands: { test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets',
      runs_dir: '.bobby/runs',
    };
    renderSkillTemplates(tmpDir, config);
    // bobby-ux should have references subdirectory with files
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'references', 'brand_guidelines.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'references', 'frontend_design.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'references', 'ui_ux_pro_max.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'references', 'brainstorming.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'references', 'audit_website.md'))).toBe(true);
  });
});
