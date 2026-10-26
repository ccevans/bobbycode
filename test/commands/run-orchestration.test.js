// test/commands/run-orchestration.test.js
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby run / sprint run with orchestration (TKT-073)', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });
  const tryRun = (args) => spawnSync('node', [bobby, ...args.split(' ').filter(Boolean)], { cwd: tmpDir, encoding: 'utf8' });
  const setConfig = (extra) => {
    const cfgPath = path.join(tmpDir, '.bobbyrc.yml');
    const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
    for (const k of Object.keys(cfg)) if (k === 'orchestration' || k === 'workflows') delete cfg[k];
    fs.writeFileSync(cfgPath, YAML.stringify({ ...cfg, ...extra }));
  };
  const refresh = () => run('init --refresh');
  const argsOf = (out) => JSON.parse(out.match(/```json\n([\s\S]*?)\n```/)[1]);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-run-orch-'));
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic', target: 'claude-code',
      tickets_dir: '.bobby/tickets', sprints_dir: '.bobby/sprints', sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT', commands: { test: 'npm test' },
    }));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
    execSync('git init -q', { cwd: tmpDir });
    run('ticket create -t "First"');
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('flag on prints the saved-workflow call with args for workflow, named workflow, feature and sprint', () => {
    setConfig({ orchestration: 'workflow' });
    refresh();

    const wf = run('run workflow TKT-001');
    expect(wf).toContain('bobby-default');
    expect(wf).toContain('export BOBBY_SESSION_ID');
    expect(wf).toContain('resumeFromRunId');
    expect(wf).not.toContain('You are orchestrating');
    expect(argsOf(wf)).toMatchObject({
      mode: 'tickets', maxIterations: 20, finalize: null,
      tickets: [{ id: 'TKT-001', stage: 'backlog', blocked: false }],
      commands: { test: 'npm test', lint: null },
    });

    expect(run('run quick TKT-001')).toContain('bobby-quick');

    run('ticket create -t "Epic" --epic');
    run('ticket create -t "Child A" --parent TKT-002');
    run('ticket create -t "Child B" --parent TKT-002');
    const feature = argsOf(run('run feature TKT-002'));
    expect(feature.mode).toBe('feature');
    expect(feature.finalize).toEqual({ kind: 'epic', id: 'TKT-002' });
    expect(feature.readFirst[0]).toMatch(/feature-plan\.md$/);
    expect(feature.tickets.map(t => t.id).sort()).toEqual(['TKT-003', 'TKT-004']);
    expect(feature.planReadFirst).toHaveLength(2);

    run('sprint new "S" TKT-001');
    const sprintOut = run('sprint run SPR-001');
    expect(sprintOut).not.toContain('You are running a Bobby sprint');
    const sprint = argsOf(sprintOut);
    expect(sprint.mode).toBe('sprint');
    expect(sprint.readFirst[0]).toMatch(/sprint-plan\.md$/);
    expect(sprint.finalize).toEqual({ kind: 'sprint', id: 'SPR-001' });
  });

  test('flag off prints today\'s prompts', () => {
    run('ticket create -t "Epic" --epic');
    run('ticket create -t "Child" --parent TKT-002');
    run('sprint new "S" TKT-001');
    expect(run('run workflow TKT-001')).toContain('You are orchestrating a Bobby workflow');
    expect(run('run feature TKT-002')).toContain('You are running a Bobby feature workflow');
    expect(run('sprint run SPR-001')).toContain('You are running a Bobby sprint');
    for (const out of [run('run workflow TKT-001'), run('sprint run SPR-001')]) {
      expect(out).not.toContain('Workflow tool');
    }
  });

  test('a missing script, a stale script, a bad value and a wrong target all fail with no prompt', () => {
    setConfig({ orchestration: 'workflow' });
    let r = tryRun('run workflow TKT-001');
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/not found\. Run `bobby init --refresh`/);

    refresh();
    setConfig({ orchestration: 'workflow', workflows: { default: ['build', 'review'] } });
    r = tryRun('run workflow TKT-001');
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('out of date');

    setConfig({ orchestration: 'bogus' });
    r = tryRun('run workflow TKT-001');
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("Unknown orchestration 'bogus'");

    setConfig({ orchestration: 'workflow' });
    const cfgPath = path.join(tmpDir, '.bobbyrc.yml');
    fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace('target: claude-code', 'target: cursor'));
    r = tryRun('run workflow TKT-001');
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('needs target claude-code');
    expect(r.stdout).not.toContain('orchestrating');
  });
});
