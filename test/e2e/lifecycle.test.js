// test/e2e/lifecycle.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scaffoldProject } from '../../commands/init.js';

describe('E2E: full ticket lifecycle', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-e2e-'));
    scaffoldProject(tmpDir, {
      project: 'e2e-test', stack: 'generic',
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      areas: ['auth'], skill_routing: {}, commands: { test: 'echo pass', lint: 'echo clean' },
      tickets_dir: 'tickets', ticket_prefix: 'TKT', idea_prefix: 'IDEA',
    });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  const run = (cmd) => execSync(`node ${bobby} ${cmd}`, { cwd: tmpDir, encoding: 'utf8' });

  test('idea → promote → create → start → review → peer-approve → approve → release', () => {
    // Create an idea and promote it
    run('idea "Add login page" --area auth');
    run('promote IDEA-001');

    // TKT-001 should be in backlog
    let output = run('list 1-backlog');
    expect(output).toContain('TKT-001');

    // Full lifecycle
    run('refine TKT-001');
    run('ready TKT-001');
    run('start TKT-001');
    run('comment TKT-001 dev "Implemented login form"');
    run('review TKT-001');
    run('peer-approve TKT-001');
    run('approve TKT-001');
    run('release TKT-001');

    // Should be in 10-released
    output = run('list 10-released');
    expect(output).toContain('TKT-001');

    // History should have all transitions
    output = run('view TKT-001');
    expect(output).toContain('backlog');
    expect(output).toContain('10-released');
  });

  test('create → start → reject → reopen → review lifecycle', () => {
    run('create -t "Fix bug" --type bug -p high');
    run('refine TKT-001');
    run('ready TKT-001');
    run('start TKT-001');
    run('review TKT-001');
    run('peer-approve TKT-001');
    run('reject TKT-001 "Still broken"');

    let output = run('list 8-needs-rework');
    expect(output).toContain('TKT-001');

    run('reopen TKT-001');
    output = run('list 4-in-progress');
    expect(output).toContain('TKT-001');
  });

  test('block and unblock', () => {
    run('create -t "Blocked ticket" --type feature');
    run('refine TKT-001');
    run('ready TKT-001');
    run('start TKT-001');
    run('block TKT-001 "Waiting on API access"');

    let output = run('list 9-blocked');
    expect(output).toContain('TKT-001');

    run('unblock TKT-001');
    output = run('list 1-backlog');
    expect(output).toContain('TKT-001');
  });

  test('retro and learn', () => {
    run('create -t "Retro test" --type bug -p high');
    run('retro TKT-001 "missing-validation"');

    const retroDir = path.join(tmpDir, 'tickets', 'retrospectives');
    const retros = fs.readdirSync(retroDir).filter(f => f.endsWith('.md'));
    expect(retros.length).toBe(1);
    expect(retros[0]).toContain('missing-validation');

    run('learn work-tickets "missing-validation" "Always validate inputs"');
    const learnings = fs.readFileSync(
      path.join(tmpDir, '.claude', 'skills', 'work-tickets', 'learnings.md'), 'utf8'
    );
    expect(learnings).toContain('missing-validation');
  });
});
