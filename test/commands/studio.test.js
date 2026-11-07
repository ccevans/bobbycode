// test/commands/studio.test.js
// End-to-end: registry auto-touch, bobby projects, brief --all, global idea inbox.
import { execSync, spawnSync } from 'child_process';
import { initStudio, createProject, setActiveProject } from '../../lib/studio.js';
import { createTicket } from '../../lib/tickets.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('studio commands', () => {
  const bobby = path.resolve('bin/bobby.js');
  let tmpHome;
  let projA;
  let projB;
  let outside;

  // Spawn the CLI with HOME pointed at the temp studio and the registry ENABLED
  // (the suite-wide BOBBY_NO_REGISTRY guard is stripped for these tests).
  const runIn = (cwd, args) => {
    const env = { ...process.env, HOME: tmpHome };
    delete env.BOBBY_NO_REGISTRY;
    return execSync(`node ${bobby} ${args}`, { cwd, encoding: 'utf8', env });
  };

  const makeProject = (dir, name) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), YAML.stringify({
      project: name, stack: 'generic',
      tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions', sprints_dir: '.bobby/sprints',
      ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(path.join(dir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobby', 'tickets', '.counter'), '0');
  };

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wscmd-'));
    projA = path.join(tmpHome, 'proj-a');
    projB = path.join(tmpHome, 'proj-b');
    outside = path.join(tmpHome, 'elsewhere');
    makeProject(projA, 'alpha');
    makeProject(projB, 'beta');
    fs.mkdirSync(outside);
  });

  afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }); });

  test('running any command inside a project auto-registers it', () => {
    runIn(projA, 'ticket list');
    const registry = YAML.parse(fs.readFileSync(path.join(tmpHome, '.bobby', 'projects.yml'), 'utf8'));
    expect(registry.projects.map(p => p.name)).toContain('alpha');
  });

  test('bobby projects lists registered projects with counts', () => {
    runIn(projA, 'ticket create -t "One"');
    runIn(projB, 'ticket create -t "Two"');
    runIn(projB, 'ticket move TKT-001 build');
    const out = runIn(outside, 'projects');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).toContain('1 in flight');
    expect(out).toContain('1 backlog');
  });

  test('brief --all shows every project and its next action', () => {
    runIn(projA, 'ticket create -t "Alpha task"');
    runIn(projB, 'ticket create -t "Beta task"');
    runIn(projB, 'ticket move TKT-001 build');
    const out = runIn(projA, 'brief --all');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).toContain('bobby run review TKT-001'); // beta's in-flight next action
  });

  test('bare brief outside any project falls back to studio mode', () => {
    runIn(projA, 'ticket create -t "Task"');
    const out = runIn(outside, 'brief');
    expect(out).toContain('All projects');
    expect(out).toContain('alpha');
  });

  test('idea outside a project captures to the global inbox', () => {
    const out = runIn(outside, 'idea "an idea from anywhere"');
    expect(out).toContain('global inbox');
    const inbox = YAML.parse(fs.readFileSync(path.join(tmpHome, '.bobby', 'inbox.yml'), 'utf8'));
    expect(inbox.ideas[0].text).toBe('an idea from anywhere');
  });

  test('idea promote --inbox pulls a global idea into the current project', () => {
    runIn(outside, 'idea "global thought"');
    const out = runIn(projA, 'idea promote 1 --inbox');
    expect(out).toContain('TKT-001');
    // Ticket landed in alpha
    const dirs = fs.readdirSync(path.join(projA, '.bobby', 'tickets')).filter(e => e.startsWith('TKT-'));
    expect(dirs).toHaveLength(1);
    // Inbox idea marked promoted
    const inbox = YAML.parse(fs.readFileSync(path.join(tmpHome, '.bobby', 'inbox.yml'), 'utf8'));
    expect(inbox.ideas[0].promoted).toBe('TKT-001');
  });

  test('project ideas and the inbox stay separate', () => {
    runIn(projA, 'idea "project-local"');
    runIn(outside, 'idea "global"');
    expect(runIn(projA, 'idea list')).toContain('project-local');
    expect(runIn(projA, 'idea list')).not.toContain('global');
    expect(runIn(projA, 'idea list --inbox')).toContain('global');
  });

  test('promote outside a project errors with guidance', () => {
    runIn(outside, 'idea "homeless idea"');
    expect(() => runIn(outside, 'idea promote 1')).toThrow();
  });
});

// TKT-084: a ticket ID (or the folder) names the studio project — no `project use` first.
describe('studio project inference (CLI)', () => {
  const bobby = path.resolve('bin/bobby.js');
  let studio;
  let home;

  const run = (cwd, args, env = {}) => {
    const e = { ...process.env, HOME: home, ...env };
    delete e.BOBBY_PROJECT;
    Object.assign(e, env);
    const r = spawnSync('node', [bobby, ...args], { cwd, encoding: 'utf8', env: e });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-infer-home-'));
    studio = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-infer-studio-')));
    initStudio(studio);
    createProject(studio, 'robinflow', { prefix: 'RF' });
    createProject(studio, 'bobby', { prefix: 'BOB' });
    createTicket(path.join(studio, '.bobby', 'robinflow', 'tickets'), { prefix: 'RF', title: 'robin ticket' });
    createTicket(path.join(studio, '.bobby', 'bobby', 'tickets'), { prefix: 'BOB', title: 'bob ticket' });
    fs.mkdirSync(path.join(studio, 'repos', 'app'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(studio, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('TC1: a ticket ID picks its project from the studio root', () => {
    const r = run(studio, ['ticket', 'view', 'RF-001']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('RF-001--robin-ticket');
  });

  test('TC2: the same from a subdirectory with no .bobbyrc.yml of its own', () => {
    const r = run(path.join(studio, 'repos', 'app'), ['ticket', 'view', 'BOB-001']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('BOB-001--bob-ticket');
  });

  test('TC3: a write lands on the ID\'s board only', () => {
    const r = run(studio, ['ticket', 'move', 'RF-001', 'plan']);
    expect(r.code).toBe(0);
    const stageOf = (proj) => {
      const d = fs.readdirSync(path.join(studio, '.bobby', proj, 'tickets')).find(n => /-001--/.test(n));
      return fs.readFileSync(path.join(studio, '.bobby', proj, 'tickets', d, 'ticket.md'), 'utf8').match(/^stage: (\w+)/m)[1];
    };
    expect(stageOf('robinflow')).toBe('planning');
    expect(stageOf('bobby')).toBe('backlog');
  });

  test('TC4: --found-in on create infers the project', () => {
    const r = run(studio, ['ticket', 'create', '-t', 'finding', '--found-in', 'RF-001']);
    expect(r.code).toBe(0);
    const dirs = fs.readdirSync(path.join(studio, '.bobby', 'robinflow', 'tickets')).filter(n => n.startsWith('RF-'));
    expect(dirs.some(n => n.startsWith('RF-002--'))).toBe(true);
  });

  test('TC5/TC6: a studio git worktree sees (and writes) the main active-project', () => {
    git(studio, 'init -q');
    git(studio, '-c user.email=t@t -c user.name=t add -A');
    git(studio, '-c user.email=t@t -c user.name=t commit -q -m init');
    git(studio, `worktree add -q ${path.join(studio, 'wt-x')} -b x`);
    setActiveProject(studio, 'bobby');
    const wt = path.join(studio, 'wt-x');
    const list = run(wt, ['ticket', 'list']);
    expect(list.code).toBe(0);
    expect(list.out).toContain('BOB-001  bob ticket');
    const use = run(wt, ['project', 'use', 'robinflow']);
    expect(use.code).toBe(0);
    expect(fs.readFileSync(path.join(studio, '.bobby', 'active-project'), 'utf8')).toBe('robinflow');
    expect(fs.existsSync(path.join(wt, '.bobby', 'active-project'))).toBe(false);
  });

  test('TC7: cwd under worktrees/<project>/ selects that project over the file', () => {
    setActiveProject(studio, 'bobby');
    const cwd = path.join(studio, 'worktrees', 'robinflow', 'RF-001-ui');
    fs.mkdirSync(cwd, { recursive: true });
    const r = run(cwd, ['ticket', 'list']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('RF-001  robin ticket');
    expect(r.out).not.toContain('BOB-001');
  });

  test('TC8: --project and BOBBY_PROJECT beat the ID, and --project beats the env', () => {
    const a = run(studio, ['ticket', 'view', 'RF-001'], { BOBBY_PROJECT: 'bobby' });
    expect(a.code).toBe(1);
    expect(a.err + a.out).toMatch(/RF-001.*not found|not found/i);
    const b = run(studio, ['--project', 'robinflow', 'ticket', 'view', 'RF-001'], { BOBBY_PROJECT: 'bobby' });
    expect(b.code).toBe(0);
    expect(b.out).toContain('RF-001--robin-ticket');
    const c = run(studio, ['--project', 'bobby', 'ticket', 'view', 'RF-001']);
    expect(c.code).toBe(1);
  });

  test('TC9: an unknown prefix is an explicit error naming the projects', () => {
    const r = run(studio, ['ticket', 'view', 'XX-9']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no project in this studio uses prefix XX');
    expect(r.err).toContain('robinflow (RF)');
    expect(r.err).toContain('bobby (BOB)');
  });

  test('TC11: free text is never read as an ID', () => {
    const r = run(studio, ['go', 'fix', 'utf-8', 'parsing']);
    expect(r.err).not.toContain('no project in this studio uses prefix');
  });
});
