// test/commands/workflow.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby workflow', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wf-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions', sprints_dir: '.bobby/sprints',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('list shows the built-in workflows', () => {
    const out = run('workflow list');
    expect(out).toContain('default');
    expect(out).toContain('secure');
    expect(out).toContain('quick');
    expect(out).toMatch(/plan → build → security → review → test/);
  });

  test('add creates a custom workflow under workflows:', () => {
    run('workflow add fast build test');
    const cfg = YAML.parse(fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8'));
    expect(cfg.workflows.fast).toEqual(['build', 'test']);
  });

  test('add rejects an invalid step', () => {
    expect(() => run('workflow add bad frobnicate')).toThrow();
  });

  test('rm removes a custom workflow', () => {
    run('workflow add fast build test');
    run('workflow rm fast');
    const cfg = YAML.parse(fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8'));
    expect(cfg.workflows?.fast).toBeUndefined();
  });

  test('workflows alias works', () => {
    expect(run('workflows list')).toContain('default');
  });
});
