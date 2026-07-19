// test/commands/studio.test.js
// End-to-end: registry auto-touch, bobby projects, brief --all, global idea inbox.
import { execSync } from 'child_process';
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
