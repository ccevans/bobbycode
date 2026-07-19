// test/commands/go.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby go', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-go-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('go with text creates a ticket and runs the pipeline on it', () => {
    const out = run('go "add a landing page"');
    expect(out).toContain('Created TKT-001');
    expect(out).toContain('Bobby Pipeline');
    expect(out).toContain('TKT-001');
    // Ticket really exists
    const dirs = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets')).filter(e => e.startsWith('TKT-001'));
    expect(dirs).toHaveLength(1);
  });

  test('go with unquoted words joins them into a title', () => {
    const out = run('go fix the login flow -p high');
    expect(out).toContain('Created TKT-001');
    const dir = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets')).find(e => e.startsWith('TKT-001'));
    const ticket = fs.readFileSync(path.join(tmpDir, '.bobby', 'tickets', dir, 'ticket.md'), 'utf8');
    expect(ticket).toContain('title: fix the login flow');
    expect(ticket).toContain('priority: high');
  });

  test('go with a ticket id runs the pipeline on that ticket', () => {
    run('ticket create -t "Existing work"');
    const out = run('go TKT-001');
    expect(out).not.toContain('Created'); // no new ticket
    expect(out).toContain('Bobby Pipeline');
    expect(out).toContain('TKT-001');
  });

  test('go with a lowercase id normalizes it', () => {
    run('ticket create -t "Existing work"');
    const out = run('go tkt-001');
    expect(out).toContain('TKT-001');
  });

  test('bare go picks the next action (backlog -> pipeline)', () => {
    run('ticket create -t "Top priority" -p critical');
    const out = run('go');
    expect(out).toContain('bobby run pipeline TKT-001');
    expect(out).toContain('Bobby Pipeline');
  });

  test('bare go pushes the furthest-along in-flight ticket', () => {
    run('ticket create -t "Almost done"');
    run('ticket move TKT-001 test');
    const out = run('go');
    expect(out).toContain('bobby run ship TKT-001');
  });

  test('bare go on an empty board gives starting guidance', () => {
    const out = run('go');
    expect(out).toContain('Board is empty');
    expect(out).toContain('bobby go "');
  });
});
