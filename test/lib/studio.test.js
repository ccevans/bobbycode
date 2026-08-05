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
import { createTicket, readTicket } from '../../lib/tickets.js';

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
