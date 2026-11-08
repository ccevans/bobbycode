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
    expect(out).toContain('Bobby Workflow');
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

  test('go --workflow tags the new ticket with that workflow', () => {
    run('go "add payment processing" --workflow secure');
    const dir = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets')).find(e => e.startsWith('TKT-001'));
    const ticket = fs.readFileSync(path.join(tmpDir, '.bobby', 'tickets', dir, 'ticket.md'), 'utf8');
    expect(ticket).toContain('workflow: secure');
  });

  test('go with a ticket id runs the pipeline on that ticket', () => {
    run('ticket create -t "Existing work"');
    const out = run('go TKT-001');
    expect(out).not.toContain('Created'); // no new ticket
    expect(out).toContain('Bobby Workflow');
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
    expect(out).toContain('bobby run workflow TKT-001');
    expect(out).toContain('Bobby Workflow');
  });

  test('bare go pushes the furthest-along in-flight ticket', () => {
    run('ticket create -t "Almost done"');
    run('ticket move TKT-001 test');
    const out = run('go');
    expect(out).toContain('bobby run ship TKT-001');
  });

  test('bare go on an empty board gives starting guidance', () => {
    const out = run('go');
    expect(out).toContain('Nothing to do yet');
    expect(out).toContain('bobby go "');
  });

  test('bare go guides a fresh epic to define the product first', () => {
    run('ticket create -t "A product idea" --epic');
    const out = run('go');
    expect(out).toMatch(/no product definition/);
    expect(out).toContain('bobby run define TKT-001');
  });

  test('bare go guides a defined epic to break down (run plan)', () => {
    run('ticket create -t "A product idea" --epic');
    // A locked feature map means definition is done — decomposition is next.
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'product'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'product', 'feature-map.md'), '# Feature Map\n**Locked:** today\n');
    const out = run('go');
    expect(out).toMatch(/fresh idea/);
    expect(out).toContain('bobby run plan TKT-001');
  });

  test('bare go resumes a mid-definition epic', () => {
    run('ticket create -t "A product idea" --epic');
    run('ticket move TKT-001 personas');
    const out = run('go');
    expect(out).toMatch(/definition is in progress/);
    expect(out).toContain('bobby run define TKT-001');
  });

  test('bare go guides a planned epic to build (run feature)', () => {
    run('ticket create -t "A product idea" --epic');
    run('ticket create -t "child" --parent TKT-001');
    const out = run('go');
    expect(out).toMatch(/build the MVP/);
    expect(out).toContain('bobby run feature TKT-001');
  });
});

describe('bobby go outside a project', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-go-out-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('points you at bobby new instead of erroring', () => {
    // No .bobbyrc.yml here — go must not crash, it should guide.
    const out = execSync(`node ${bobby} go`, {
      cwd: tmpDir, encoding: 'utf8',
      env: { ...process.env, HOME: path.join(tmpDir, '.home') },
    });
    expect(out).toContain("not in a Bobby project");
    expect(out).toContain('bobby new "your idea"');
  });
});

describe('bobby go: stale board guard (TKT-083)', () => {
  const bobby = path.resolve('bin/bobby.js');
  let root, A, B;

  // TKT-083 fixture: local bare repo as origin plus two clones of a Bobby project. No network.
  const g = (cwd, args) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  function makeBoardRepos(root) {
    const origin = path.join(root, 'origin.git');
    const A = path.join(root, 'A');
    g(root, `init -q -b main --bare ${origin}`);
    fs.mkdirSync(path.join(A, '.bobby', 'tickets'), { recursive: true });
    g(A, 'init -q -b main');
    fs.writeFileSync(path.join(A, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic', tickets_dir: '.bobby/tickets',
      sprints_dir: '.bobby/sprints', sessions_dir: '.bobby/sessions', ticket_prefix: 'TKT',
    }));
    fs.writeFileSync(path.join(A, '.bobby', 'tickets', '.counter'), '0');
    g(A, 'add -A'); g(A, 'commit -qm init');
    g(A, `remote add origin ${origin}`); g(A, 'push -q -u origin main');
    const B = path.join(root, 'B');
    g(root, `clone -q ${origin} ${B}`);
    return { origin, A, B };
  }
  // B creates a ticket with the real CLI and pushes it, so A is one board commit behind.
  function bPushesTicket(B, title) {
    execSync(`node ${bobby} ticket create -t "${title}"`, { cwd: B });
    g(B, 'add -A'); g(B, `commit -qm "${title}"`); g(B, 'push -q');
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-gostale-'));
    ({ A, B } = makeBoardRepos(root));
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('go "<text>" refuses when behind: no ticket, no workflow run', () => {
    bPushesTicket(B, 'From B');
    let out = '';
    let code = 0;
    try {
      execSync(`node ${bobby} go "add a page"`, { cwd: A, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { code = e.status; out = String(e.stdout) + String(e.stderr); }
    expect(code).toBe(1);
    expect(out).toContain('1 commit behind origin/main');
    expect(out).not.toContain('Now running it');
    expect(fs.readdirSync(path.join(A, '.bobby', 'tickets')).filter(e => e.startsWith('TKT-'))).toEqual([]);
  });
});
