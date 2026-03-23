// test/commands/init.test.js
import { scaffoldProject } from '../../commands/init.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('bobby init (scaffolding)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-init-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('scaffoldProject creates all expected directories and files', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app',
      stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      areas: ['auth', 'dashboard'],
      commands: { dev: 'npm run dev', test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Single tickets directory (no stage sub-folders)
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', 'retrospectives'))).toBe(true);

    // Skills
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-build', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-test', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-plan', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-ship', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-ux', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-ux', 'references', 'brand_guidelines.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-pm', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-qe', 'SKILL.md'))).toBe(true);

    // Agents directory
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents'))).toBe(true);

    // Config and docs
    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', 'WORKFLOW.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', 'README.md'))).toBe(true);
  });

  test('scaffoldProject preserves existing tickets on re-init', () => {
    // First init
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Create a ticket in the single tickets dir
    const ticketDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, 'ticket.md'), 'test');

    // Re-init
    scaffoldProject(tmpDir, {
      project: 'test-app-v2', stack: 'generic',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Ticket should survive
    expect(fs.existsSync(path.join(ticketDir, 'ticket.md'))).toBe(true);
    // Config should be updated
    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(config).toContain('test-app-v2');
  });

  test('scaffoldProject does not overwrite existing counter', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Simulate counter advancement
    const counterFile = path.join(tmpDir, '.bobby', 'tickets', '.counter');
    fs.writeFileSync(counterFile, '5');

    // Re-init
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Counter should be preserved
    expect(fs.readFileSync(counterFile, 'utf8')).toBe('5');
  });
});
