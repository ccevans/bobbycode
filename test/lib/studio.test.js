// test/lib/studio.test.js — studio/project resolution.
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readConfig, resolveTicketsDir, resolveActiveProject,
  listStudioProjects, resolveRepoPath,
} from '../../lib/config.js';
import { execSync } from 'child_process';
import {
  initStudio, createProject, setActiveProject, addRepo, readProjectConfig,
  setupRepos, readStudioConfig,
} from '../../lib/studio.js';
import {
  isStudio, promoteV1ToStudio, getActiveProject,
} from '../../lib/studio.js';
import { createTicket, readTicket } from '../../lib/tickets.js';
import { appendDecision, readDecisions, seedText } from '../../lib/decisions.js';

describe('studio', () => {
  let root;
  beforeEach(() => {
    delete process.env.BOBBY_PROJECT;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-v2-'));
    initStudio(root);
    fs.mkdirSync(path.join(root, 'repos', 'app'), { recursive: true });
    addRepo(root, 'app', path.join(root, 'repos', 'app'), { stack: 'rails-react', test: 'rspec' });
  });
  afterEach(() => {
    delete process.env.BOBBY_PROJECT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('initStudio marks the studio and scaffolds repos/', () => {
    expect(readConfig(root).studio).toBeTruthy();
    expect(fs.existsSync(path.join(root, 'repos'))).toBe(true);
  });

  test('createProject writes a project with its own board and prefix', () => {
    createProject(root, 'robinoffer', { prefix: 'RO', repos: ['app'] });
    expect(listStudioProjects(root)).toContain('robinoffer');
    expect(readProjectConfig(root, 'robinoffer')).toMatchObject({ prefix: 'RO', repos: ['app'] });
    expect(fs.existsSync(path.join(root, '.bobby', 'robinoffer', 'tickets'))).toBe(true);
  });

  // A studio project used to seed `decisions: []` while `bobby init` seeded a
  // bare list — two shapes under one filename, and nothing read the file, so
  // nothing noticed. TKT-063.
  test('a project decision log has the same shape as an init project decision log', () => {
    createProject(root, 'robinoffer', { prefix: 'RO' });
    const projectLog = path.join(root, '.bobby', 'robinoffer', 'decisions.yaml');
    expect(fs.readFileSync(projectLog, 'utf8')).toBe(seedText());
    expect(readDecisions(projectLog)).toEqual([]);

    appendDecision(projectLog, { id: 'one-shape', fact: 'f', why: 'w' });
    expect(readDecisions(projectLog).map(d => d.id)).toEqual(['one-shape']);
  });

  test('createProject rejects a repo not in the group', () => {
    expect(() => createProject(root, 'x', { repos: ['nope'] })).toThrow(/not in the studio's repo group/);
  });

  test('active-project selection precedence: explicit > env > file > sole > null', () => {
    createProject(root, 'robinoffer', { prefix: 'RO', repos: ['app'] });
    // exactly one project → sole
    expect(resolveActiveProject(root)).toBe('robinoffer');
    createProject(root, 'listrobin', { prefix: 'LR', repos: ['app'] });
    // two projects, nothing selected → null
    expect(resolveActiveProject(root)).toBeNull();
    // file
    setActiveProject(root, 'robinoffer');
    expect(resolveActiveProject(root)).toBe('robinoffer');
    // env beats file
    process.env.BOBBY_PROJECT = 'listrobin';
    expect(resolveActiveProject(root)).toBe('listrobin');
    // explicit beats env
    expect(resolveActiveProject(root, 'robinoffer')).toBe('robinoffer');
  });

  test('readConfig cascades project over studio (prefix + board dir)', () => {
    createProject(root, 'robinoffer', { prefix: 'RO', repos: ['app'] });
    setActiveProject(root, 'robinoffer');
    const cfg = readConfig(root);
    expect(cfg._project).toBe('robinoffer');
    expect(cfg.ticket_prefix).toBe('RO');
    expect(cfg.tickets_dir).toBe('.bobby/robinoffer/tickets');
    expect(cfg.repo_group.app).toBeTruthy();          // group visible
    expect(cfg.project_repos).toEqual(['app']);        // project subset
  });

  test('resolveTicketsDir returns the active project board, and errors with no project', () => {
    createProject(root, 'robinoffer', { prefix: 'RO', repos: ['app'] });
    createProject(root, 'listrobin', { prefix: 'LR', repos: ['app'] });
    // no project selected → actionable error
    expect(() => resolveTicketsDir(root, readConfig(root))).toThrow(/Select a project/);
    setActiveProject(root, 'robinoffer');
    expect(resolveTicketsDir(root, readConfig(root)))
      .toBe(path.join(root, '.bobby', 'robinoffer', 'tickets'));
  });

  test('per-project counters are independent (RO-001 and LR-001 coexist)', () => {
    createProject(root, 'robinoffer', { prefix: 'RO', repos: ['app'] });
    createProject(root, 'listrobin', { prefix: 'LR', repos: ['app'] });
    setActiveProject(root, 'robinoffer');
    const ro = createTicket(resolveTicketsDir(root, readConfig(root)), { prefix: 'RO', title: 'first' });
    process.env.BOBBY_PROJECT = 'listrobin';
    const lr = createTicket(resolveTicketsDir(root, readConfig(root)), { prefix: 'LR', title: 'first' });
    expect(ro.id).toBe('RO-001');
    expect(lr.id).toBe('LR-001');   // does NOT continue RO's sequence
  });

  test('active-project is gitignored (per-dev state, never shared)', () => {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gi.split('\n').map(l => l.trim())).toContain('.bobby/active-project');
  });

  test('createTicket records the repos a ticket touches', () => {
    createProject(root, 'robinoffer', { prefix: 'RO', repos: ['app'] });
    setActiveProject(root, 'robinoffer');
    const tdir = path.join(root, '.bobby', 'robinoffer', 'tickets');
    const t = createTicket(tdir, { prefix: 'RO', title: 'touch app', repos: ['app'] });
    const fm = readTicket(path.join(tdir, t.dirname)).data;
    expect(fm.repos).toEqual(['app']);
  });

  test('repo url is recorded, and studio setup restores a missing repo from it', () => {
    // A local bare repo stands in for a remote (offline clone).
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-remote-')) + '.git';
    const seed = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-seed-'));
    execSync('git init -q', { cwd: seed });
    execSync('git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: seed });
    execSync(`git clone -q --bare ${JSON.stringify(seed)} ${JSON.stringify(remote)}`);
    try {
      addRepo(root, 'cloned', remote);                       // .git suffix → treated as a url, cloned
      expect(readStudioConfig(root).repos.cloned.url).toBe(remote);
      // simulate a fresh checkout: repos/ is gone
      fs.rmSync(path.join(root, 'repos', 'cloned'), { recursive: true, force: true });
      const results = setupRepos(root);
      const cloned = results.find(r => r.name === 'cloned');
      expect(cloned.status).toBe('cloned');
      expect(fs.existsSync(path.join(root, 'repos', 'cloned', '.git'))).toBe(true);
    } finally {
      fs.rmSync(remote, { recursive: true, force: true });
      fs.rmSync(seed, { recursive: true, force: true });
    }
  });

  test('studio setup reports a local-only repo (no url) as missing', () => {
    const local = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-local-'));   // no git origin
    try {
      addRepo(root, 'localonly', local);
      expect(readStudioConfig(root).repos.localonly.url).toBeUndefined();
      fs.rmSync(local, { recursive: true, force: true });
      const r = setupRepos(root).find(x => x.name === 'localonly');
      expect(r.status).toBe('missing');
    } finally {
      fs.rmSync(local, { recursive: true, force: true });
    }
  });

  test('resolveRepoPath resolves relative under the studio, passes absolute through', () => {
    const cfg = readConfig(root);
    expect(resolveRepoPath(root, cfg, 'app')).toBe(path.join(root, 'repos', 'app'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-ext-'));
    try {
      addRepo(root, 'ext', external);   // an existing repo outside the studio (opt-out)
      expect(resolveRepoPath(root, readConfig(root), 'ext')).toBe(external);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
});

describe('one model: single-board project grows into a studio', () => {
  let root;
  // A legacy single-board (v1) project, built by hand — no studio key.
  const makeV1 = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-v1-'));
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'),
      'project: myapp\nstack: generic\nticket_prefix: TKT\ntickets_dir: .bobby/tickets\n');
    fs.mkdirSync(path.join(dir, '.bobby', 'tickets', 'TKT-001--seed'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobby', 'tickets', 'TKT-001--seed', 'ticket.md'), '---\nid: TKT-001\n---\nseed\n');
    fs.writeFileSync(path.join(dir, '.bobby', 'tickets', '.counter'), '1');
    return dir;
  };
  beforeEach(() => { delete process.env.BOBBY_PROJECT; root = makeV1(); });
  afterEach(() => { delete process.env.BOBBY_PROJECT; fs.rmSync(root, { recursive: true, force: true }); });

  test('a v1 project reads correctly with no studio (back-compat)', () => {
    const cfg = readConfig(root);
    expect(cfg.studio).toBeFalsy();
    expect(resolveTicketsDir(root, cfg)).toBe(path.join(root, '.bobby', 'tickets'));
  });

  test('promoteV1ToStudio makes it a studio, preserving the board as the first project', () => {
    expect(isStudio(root)).toBe(false);
    const first = promoteV1ToStudio(root);
    expect(first).toBe('myapp');
    expect(isStudio(root)).toBe(true);
    expect(listStudioProjects(root)).toEqual(['myapp']);
    expect(getActiveProject(root)).toBe('myapp');
    // existing ticket moved into the first project — not lost
    expect(fs.existsSync(path.join(root, '.bobby', 'myapp', 'tickets', 'TKT-001--seed', 'ticket.md'))).toBe(true);
    // old top-level board is gone
    expect(fs.existsSync(path.join(root, '.bobby', 'tickets'))).toBe(false);
    // and resolution now points at the project board
    expect(resolveTicketsDir(root, readConfig(root))).toBe(path.join(root, '.bobby', 'myapp', 'tickets'));
  });

  test('promote is idempotent', () => {
    promoteV1ToStudio(root);
    expect(promoteV1ToStudio(root)).toBe('myapp');   // no-op, returns existing
    expect(listStudioProjects(root)).toEqual(['myapp']);
  });

  test('adding a second project promotes then coexists (sole-project auto-select preserved for one)', () => {
    // simulate `bobby project new`: grow then create
    if (!isStudio(root)) promoteV1ToStudio(root);
    createProject(root, 'billing', { prefix: 'BL', repos: [] });
    expect(listStudioProjects(root).sort()).toEqual(['billing', 'myapp']);
    // the promoted board's ticket still resolvable via its project
    process.env.BOBBY_PROJECT = 'myapp';
    expect(resolveTicketsDir(root, readConfig(root))).toBe(path.join(root, '.bobby', 'myapp', 'tickets'));
  });
});
