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

  test('scaffoldProject creates all expected directories', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app',
      stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      areas: ['auth', 'dashboard'],
      skill_routing: { auth: ['dev/fullstack'] },
      commands: { dev: 'npm run dev', test: 'npm test', lint: 'npm run lint' },
      tickets_dir: 'tickets',
      ticket_prefix: 'TKT',
      idea_prefix: 'IDEA',
    });

    // Check directories
    expect(fs.existsSync(path.join(tmpDir, 'tickets', '0-ideas'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tickets', '10-released'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tickets', 'retrospectives'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'work-tickets', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'qe', 'SKILL.md'))).toBe(true);

    // Check files
    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tickets', 'WORKFLOW.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tickets', '.template.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tickets', '.counter'))).toBe(true);
  });

  test('scaffoldProject detects existing project', () => {
    // First init
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [], skill_routing: {},
      commands: {}, tickets_dir: 'tickets',
      ticket_prefix: 'TKT', idea_prefix: 'IDEA',
    });
    // Create a ticket to verify it survives re-init
    fs.mkdirSync(path.join(tmpDir, 'tickets', '1-backlog', 'TKT-001--test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'tickets', '1-backlog', 'TKT-001--test', 'ticket.md'), 'test');

    // Re-init (force)
    scaffoldProject(tmpDir, {
      project: 'test-app-v2', stack: 'generic',
      health_checks: [], areas: [], skill_routing: {},
      commands: {}, tickets_dir: 'tickets',
      ticket_prefix: 'TKT', idea_prefix: 'IDEA',
    });

    // Ticket should survive
    expect(fs.existsSync(path.join(tmpDir, 'tickets', '1-backlog', 'TKT-001--test', 'ticket.md'))).toBe(true);
    // Config should be updated
    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(config).toContain('test-app-v2');
  });
});
