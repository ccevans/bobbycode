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
    run('ticket create -t "Add login page" --area auth');

    // TKT-001 should be in backlog
    let output = run('ticket list backlog');
    expect(output).toContain('TKT-001');

    // Move through the lifecycle using aliases
    run('ticket move TKT-001 plan');
    run('ticket move TKT-001 build');
    run('ticket comment TKT-001 "Implemented login form" --by dev');
    run('ticket move TKT-001 review');
    run('ticket move TKT-001 test');
    run('ticket move TKT-001 ship');
    run('ticket move TKT-001 done');

    // Should be in done
    output = run('ticket list done');
    expect(output).toContain('TKT-001');

    // View should show the ticket
    output = run('ticket view TKT-001');
    expect(output).toContain('done');
  });

  test('create → build → reject → rebuild → review lifecycle', () => {
    run('ticket create -t "Fix bug" --type bug -p high');
    run('ticket move TKT-001 plan');
    run('ticket move TKT-001 build');
    run('ticket move TKT-001 review');
    run('ticket move TKT-001 reject "Still broken"');

    // Reject moves back to building
    let output = run('ticket list building');
    expect(output).toContain('TKT-001');

    // Can move back to review
    run('ticket move TKT-001 review');
    output = run('ticket list reviewing');
    expect(output).toContain('TKT-001');
  });

  test('block and unblock', () => {
    run('ticket create -t "Blocked ticket" --type feature');
    run('ticket move TKT-001 build');
    run('ticket move TKT-001 block "Waiting on API access"');

    let output = run('ticket list blocked');
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
    run('ticket move TKT-001 unblock');
    output = run('ticket list building');
    expect(output).toContain('TKT-001');
  });

  test('retro and learn', () => {
    run('ticket create -t "Retro test" --type bug -p high');
    run('retro TKT-001 "missing-validation"');

    const retroDir = path.join(tmpDir, '.bobby', 'tickets', 'retrospectives');
    const retros = fs.readdirSync(retroDir).filter(f => f.endsWith('.md'));
    expect(retros.length).toBe(1);
    expect(retros[0]).toContain('missing-validation');

    run('learn bobby-build "missing-validation" "Always validate inputs"');

    // `bobby learn` writes to the user-owned overlay, never to the shipped
    // learnings.md — the shipped file is replaced on every upgrade.
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'bobby-build');
    expect(fs.readFileSync(path.join(skillDir, 'learnings.local.md'), 'utf8'))
      .toContain('missing-validation');
    expect(fs.readFileSync(path.join(skillDir, 'learnings.md'), 'utf8'))
      .not.toContain('missing-validation');
  });

  test('skill create scaffolds a runnable, learnable custom skill', () => {
    run('skill create smoke-test "Run smoke tests." --agent');

    const skillDir = path.join(tmpDir, '.claude', 'skills', 'smoke-test');
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'learnings.local.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'smoke-test.md'))).toBe(true);

    // runnable by name, and bobby learn writes to its .local file
    expect(run('run smoke-test')).toContain('smoke-test');
    run('learn smoke-test "flaky-suite" "Quarantine before debugging"');
    expect(fs.readFileSync(path.join(skillDir, 'learnings.local.md'), 'utf8')).toContain('flaky-suite');

    // reserved namespace is enforced
    let err = '';
    try { run('skill create bobby-mine'); } catch (e) { err = (e.stdout || '') + (e.stderr || ''); }
    expect(err).toContain('reserved');
  });

  test('custom agents are runnable by name and never pruned', () => {
    const agentPath = path.join(tmpDir, '.claude', 'agents', 'deploy-check.md');
    fs.writeFileSync(agentPath, '# Deploy Check\nVerify staging before deploy.\n', 'utf8');

    const out = run('run deploy-check');
    expect(out).toContain('deploy-check');
    expect(out).toContain('.claude/agents/deploy-check.md');

    // unknown names should surface the custom agents that do exist
    let err = '';
    try { run('run not-a-real-agent'); } catch (e) { err = (e.stdout || '') + (e.stderr || ''); }
    expect(err).toContain('deploy-check');
  });

  test('run next shows stage-aware prompt', () => {
    run('ticket create -t "Next test"');

    // Backlog → tells you to move to planning
    let output = run('run next TKT-001');
    expect(output).toContain('in backlog');
    expect(output).toContain('bobby ticket move TKT-001 plan');

    // Move to planning → shows bobby-plan prompt
    run('ticket move TKT-001 plan');
    output = run('run next TKT-001');
    expect(output).toContain('bobby-plan');
  });

  test('run batch finds tickets in stage', () => {
    run('ticket create -t "Batch A"');
    run('ticket create -t "Batch B"');
    run('ticket move TKT-001 plan');
    run('ticket move TKT-002 plan');

    const output = run('run plan');
    expect(output).toContain('2 ticket(s) in planning');
    expect(output).toContain('TKT-001');
    expect(output).toContain('TKT-002');
  });

  test('run batch skips assigned tickets', () => {
    run('ticket create -t "Assigned"');
    run('ticket create -t "Available"');
    run('ticket move TKT-001 plan');
    run('ticket move TKT-002 plan');
    run('ticket assign TKT-001 bobby-plan');

    const output = run('run plan');
    expect(output).toContain('1 ticket(s) in planning');
    expect(output).toContain('TKT-002');
    expect(output).not.toContain('TKT-001');
  });

  test('move clears assignment', () => {
    run('ticket create -t "Clear assign"');
    run('ticket assign TKT-001 bobby-plan');
    run('ticket move TKT-001 plan');

    // After move, assignment should be cleared
    const output = run('ticket view TKT-001');
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
    run('ticket create -t "Auth system" --epic');
    run('ticket create -t "Login page" --parent TKT-001 -p high');
    run('ticket create -t "Signup page" --parent TKT-001 -p medium');

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
    run('ticket create -t "Not an epic"');
    expect(() => run('run feature TKT-001')).toThrow();
  });

  test('run feature errors on epic with no children', () => {
    run('ticket create -t "Empty epic" --epic');
    expect(() => run('run feature TKT-001')).toThrow();
  });

  test('run feature orders in-progress tickets first', () => {
    run('ticket create -t "My feature" --epic');
    run('ticket create -t "Backlog task" --parent TKT-001 -p high');
    run('ticket create -t "Building task" --parent TKT-001 -p low');
    run('ticket move TKT-003 build');

    const output = run('run feature TKT-001');
    // TKT-003 (building) should appear before TKT-002 (backlog)
    const idx3 = output.indexOf('TKT-003');
    const idx2 = output.indexOf('TKT-002');
    expect(idx3).toBeLessThan(idx2);
  });

  test('create epic and child tickets', () => {
    run('ticket create -t "Big feature" --epic');

    // Verify epic type in frontmatter
    const ticketsDir = path.join(tmpDir, '.bobby', 'tickets');
    const entries = fs.readdirSync(ticketsDir).filter(e => e.startsWith('TKT-001'));
    const ticketFile = path.join(ticketsDir, entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.type).toBe('epic');

    // Create child ticket
    run('ticket create -t "Sub task" --parent TKT-001');
    const childEntries = fs.readdirSync(ticketsDir).filter(e => e.startsWith('TKT-002'));
    const childFile = path.join(ticketsDir, childEntries[0], 'ticket.md');
    const childData = matter(fs.readFileSync(childFile, 'utf8')).data;
    expect(childData.parent).toBe('TKT-001');
  });

  test('auto-advance epic when all children reach same stage', () => {
    run('ticket create -t "Auto epic" --epic');
    run('ticket create -t "Child A" --parent TKT-001');
    run('ticket create -t "Child B" --parent TKT-001');

    // Move both children to shipping
    run('ticket move TKT-002 shipping');
    run('ticket move TKT-003 shipping');

    // Epic should have auto-advanced to shipping
    const ticketsDir = path.join(tmpDir, '.bobby', 'tickets');
    const entries = fs.readdirSync(ticketsDir).filter(e => e.startsWith('TKT-001'));
    const { data } = matter(fs.readFileSync(path.join(ticketsDir, entries[0], 'ticket.md'), 'utf8'));
    expect(data.stage).toBe('shipping');
  });

  // TKT-052: prompts carry the RESOLVED tickets dir, so the path works no matter
  // where the agent that receives the prompt is running from. Asserted by opening
  // the file the prompt names, not by matching its text.
  describe('the tickets path a run prompt names is openable', () => {
    // Resolve the ticket.md path a prompt names, from `cwd`, expanding the
    // `TKT-001*` glob segment. Returns the file's contents, or null.
    const openFromPrompt = (prompt, ticketId, cwd) => {
      const m = new RegExp('`([^`]*' + ticketId + '\\*/ticket\\.md)`').exec(prompt);
      if (!m) return null;
      const parent = path.dirname(path.dirname(path.resolve(cwd, m[1])));
      if (!fs.existsSync(parent)) return null;
      const hit = fs.readdirSync(parent).find(e => e.startsWith(ticketId));
      if (!hit) return null;
      const file = path.join(parent, hit, 'ticket.md');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    };

    test('bobby run build emits a ticket path that resolves from an unrelated cwd', () => {
      run('ticket create -t "Prompt path check"');
      run('ticket move TKT-001 build');

      const prompt = run('run build TKT-001');

      // os.tmpdir() stands in for "some other directory" — a worktree, in the
      // app's case. A relative `.bobby/tickets/...` resolves to nothing here.
      expect(openFromPrompt(prompt, 'TKT-001', os.tmpdir())).toContain('Prompt path check');
    });

    test('bobby run workflow emits the same resolvable path', () => {
      run('ticket create -t "Workflow path check"');

      // Orchestration prompts template the id as {TICKET_ID}; substitute it the
      // way the orchestrator agent is told to, then open what is left.
      const prompt = run('run workflow TKT-001').replace(/\{TICKET_ID\}/g, 'TKT-001');

      expect(openFromPrompt(prompt, 'TKT-001', os.tmpdir())).toContain('Workflow path check');
    });
  });
});
