// test/e2e/lifecycle.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { scaffoldProject } from '../../commands/init.js';

describe('E2E: full ticket lifecycle', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-e2e-'));
    scaffoldProject(tmpDir, {
      project: 'e2e-test', stack: 'generic',
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      areas: ['auth'], commands: { test: 'echo pass', lint: 'echo clean' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  const run = (cmd) => execSync(`node ${bobby} ${cmd}`, { cwd: tmpDir, encoding: 'utf8' });

  test('create → move through stages → done', () => {
    // Create a ticket
    run('create -t "Add login page" --area auth');

    // TKT-001 should be in backlog
    let output = run('list backlog');
    expect(output).toContain('TKT-001');

    // Move through the lifecycle using aliases
    run('move TKT-001 plan');
    run('move TKT-001 build');
    run('comment TKT-001 "Implemented login form" --by dev');
    run('move TKT-001 review');
    run('move TKT-001 test');
    run('move TKT-001 ship');
    run('move TKT-001 done');

    // Should be in done
    output = run('list done');
    expect(output).toContain('TKT-001');

    // View should show the ticket
    output = run('view TKT-001');
    expect(output).toContain('done');
  });

  test('create → build → reject → rebuild → review lifecycle', () => {
    run('create -t "Fix bug" --type bug -p high');
    run('move TKT-001 plan');
    run('move TKT-001 build');
    run('move TKT-001 review');
    run('move TKT-001 reject "Still broken"');

    // Reject moves back to building
    let output = run('list building');
    expect(output).toContain('TKT-001');

    // Can move back to review
    run('move TKT-001 review');
    output = run('list reviewing');
    expect(output).toContain('TKT-001');
  });

  test('block and unblock', () => {
    run('create -t "Blocked ticket" --type feature');
    run('move TKT-001 build');
    run('move TKT-001 block "Waiting on API access"');

    let output = run('list blocked');
    expect(output).toContain('TKT-001');

    // Verify blocked metadata via frontmatter
    const ticketsDir = path.join(tmpDir, '.bobby', 'tickets');
    const entries = fs.readdirSync(ticketsDir).filter(e => e.startsWith('TKT-001'));
    const ticketFile = path.join(ticketsDir, entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.blocked).toBe(true);
    expect(data.blocked_reason).toBe('Waiting on API access');
    expect(data.previous_stage).toBe('building');

    // Unblock restores to previous stage
    run('move TKT-001 unblock');
    output = run('list building');
    expect(output).toContain('TKT-001');
  });

  test('retro and learn', () => {
    run('create -t "Retro test" --type bug -p high');
    run('retro TKT-001 "missing-validation"');

    const retroDir = path.join(tmpDir, '.bobby', 'tickets', 'retrospectives');
    const retros = fs.readdirSync(retroDir).filter(f => f.endsWith('.md'));
    expect(retros.length).toBe(1);
    expect(retros[0]).toContain('missing-validation');

    run('learn bobby-build "missing-validation" "Always validate inputs"');
    const learnings = fs.readFileSync(
      path.join(tmpDir, '.claude', 'skills', 'bobby-build', 'learnings.md'), 'utf8'
    );
    expect(learnings).toContain('missing-validation');
  });

  test('run next shows stage-aware prompt', () => {
    run('create -t "Next test"');

    // Backlog → tells you to move to planning
    let output = run('run next TKT-001');
    expect(output).toContain('in backlog');
    expect(output).toContain('bobby move TKT-001 plan');

    // Move to planning → shows bobby-plan prompt
    run('move TKT-001 plan');
    output = run('run next TKT-001');
    expect(output).toContain('bobby-plan');
  });

  test('run batch finds tickets in stage', () => {
    run('create -t "Batch A"');
    run('create -t "Batch B"');
    run('move TKT-001 plan');
    run('move TKT-002 plan');

    const output = run('run plan');
    expect(output).toContain('2 ticket(s) in planning');
    expect(output).toContain('TKT-001');
    expect(output).toContain('TKT-002');
  });

  test('run batch skips assigned tickets', () => {
    run('create -t "Assigned"');
    run('create -t "Available"');
    run('move TKT-001 plan');
    run('move TKT-002 plan');
    run('assign TKT-001 bobby-plan');

    const output = run('run plan');
    expect(output).toContain('1 ticket(s) in planning');
    expect(output).toContain('TKT-002');
    expect(output).not.toContain('TKT-001');
  });

  test('move clears assignment', () => {
    run('create -t "Clear assign"');
    run('assign TKT-001 bobby-plan');
    run('move TKT-001 plan');

    // After move, assignment should be cleared
    const output = run('view TKT-001');
    // assigned should be empty/null after move
    expect(output).not.toContain('bobby-plan');
  });

  test('run ux works without ticket', () => {
    const output = run('run ux');
    expect(output).toContain('Bobby UX');
    expect(output).toContain('bobby-ux');
  });

  test('run pm works without ticket', () => {
    const output = run('run pm');
    expect(output).toContain('Bobby PM');
    expect(output).toContain('bobby-pm');
  });

  test('run qe works without ticket', () => {
    const output = run('run qe');
    expect(output).toContain('Bobby QE');
    expect(output).toContain('bobby-qe');
  });

  test('run feature with epic and children produces prompt', () => {
    run('create -t "Auth system" --epic');
    run('create -t "Login page" --parent TKT-001 -p high');
    run('create -t "Signup page" --parent TKT-001 -p medium');

    const output = run('run feature TKT-001');
    expect(output).toContain('Bobby Feature');
    expect(output).toContain('Auth system');
    expect(output).toContain('TKT-002');
    expect(output).toContain('TKT-003');
    expect(output).toContain('feature/tkt-001');
    expect(output).toContain('bobby-plan');
    expect(output).toContain('bobby-build');
  });

  test('run feature errors on non-epic ticket', () => {
    run('create -t "Not an epic"');
    expect(() => run('run feature TKT-001')).toThrow();
  });

  test('run feature errors on epic with no children', () => {
    run('create -t "Empty epic" --epic');
    expect(() => run('run feature TKT-001')).toThrow();
  });

  test('run feature orders in-progress tickets first', () => {
    run('create -t "My feature" --epic');
    run('create -t "Backlog task" --parent TKT-001 -p high');
    run('create -t "Building task" --parent TKT-001 -p low');
    run('move TKT-003 build');

    const output = run('run feature TKT-001');
    // TKT-003 (building) should appear before TKT-002 (backlog)
    const idx3 = output.indexOf('TKT-003');
    const idx2 = output.indexOf('TKT-002');
    expect(idx3).toBeLessThan(idx2);
  });

  test('create epic and child tickets', () => {
    run('create -t "Big feature" --epic');

    // Verify epic type in frontmatter
    const ticketsDir = path.join(tmpDir, '.bobby', 'tickets');
    const entries = fs.readdirSync(ticketsDir).filter(e => e.startsWith('TKT-001'));
    const ticketFile = path.join(ticketsDir, entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.type).toBe('epic');

    // Create child ticket
    run('create -t "Sub task" --parent TKT-001');
    const childEntries = fs.readdirSync(ticketsDir).filter(e => e.startsWith('TKT-002'));
    const childFile = path.join(ticketsDir, childEntries[0], 'ticket.md');
    const childData = matter(fs.readFileSync(childFile, 'utf8')).data;
    expect(childData.parent).toBe('TKT-001');
  });
});
