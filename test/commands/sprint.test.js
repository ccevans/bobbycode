// test/commands/sprint.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby sprint', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-sprint-cmd-'));
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
    run('create -t "First ticket"');
    run('create -t "Second ticket"');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  const sprintDir = () =>
    fs.readdirSync(path.join(tmpDir, '.bobby', 'sprints')).find(e => e.startsWith('SPR-001'));

  test('new creates a sprint with the given tickets', () => {
    const out = run('sprint new "Auth overhaul" TKT-001 TKT-002');
    expect(out).toContain('SPR-001');
    const data = YAML.parse(
      fs.readFileSync(path.join(tmpDir, '.bobby', 'sprints', sprintDir(), 'sprint.yml'), 'utf8')
    );
    expect(data.tickets).toEqual(['TKT-001', 'TKT-002']);
    expect(data.branch).toBe('feature/spr-001-auth-overhaul');
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'sprints', sprintDir(), 'sprint-plan.md'))).toBe(true);
  });

  test('new fails on an unknown ticket', () => {
    expect(() => run('sprint new "Bad" TKT-099')).toThrow();
  });

  test('list shows sprints', () => {
    run('sprint new "Sprint A" TKT-001');
    const out = run('sprint list');
    expect(out).toContain('SPR-001');
    expect(out).toContain('Sprint A');
  });

  test('add and remove tickets', () => {
    run('sprint new "S" TKT-001');
    run('sprint add SPR-001 TKT-002');
    expect(run('sprint view SPR-001')).toContain('TKT-002');
    run('sprint remove SPR-001 TKT-002');
    expect(run('sprint view SPR-001')).not.toContain('TKT-002');
  });

  test('status updates the sprint status', () => {
    run('sprint new "S" TKT-001');
    run('sprint status SPR-001 active');
    expect(run('sprint view SPR-001')).toContain('active');
  });

  test('run emits a sprint orchestration prompt', () => {
    run('sprint new "S" TKT-001 TKT-002');
    const out = run('sprint run SPR-001');
    expect(out).toContain('Bobby sprint');
    expect(out).toContain('feature/spr-001-s');
    expect(out).toContain('TKT-001');
    expect(out).toContain('TKT-002');
    expect(out).toContain('bobby sprint status SPR-001 done');
  });

  test('run fails on an empty sprint', () => {
    run('sprint new "Empty"');
    expect(() => run('sprint run SPR-001')).toThrow();
  });

  test('run fails when a sprint references a missing ticket', () => {
    run('sprint new "S" TKT-001');
    // Manually inject a dangling reference.
    const file = path.join(tmpDir, '.bobby', 'sprints', sprintDir(), 'sprint.yml');
    const data = YAML.parse(fs.readFileSync(file, 'utf8'));
    data.tickets.push('TKT-404');
    fs.writeFileSync(file, YAML.stringify(data));
    expect(() => run('sprint run SPR-001')).toThrow();
  });
});
