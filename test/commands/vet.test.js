// test/commands/vet.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby vet', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) =>
    execSync(`node ${bobby} ${args}`, {
      cwd: tmpDir, encoding: 'utf8',
      env: { ...process.env, HOME: path.join(tmpDir, '.home') },
    });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-vet-'));
    fs.mkdirSync(path.join(tmpDir, '.home'), { recursive: true });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('emits a self-contained vetting prompt for a raw idea (no project needed)', () => {
    const out = run('vet "a habit tracker for runners"');
    expect(out).toContain('a habit tracker for runners');
    // The interrogation methodology is present
    expect(out).toContain('one question');
    expect(out).toMatch(/\[Users\]/);
    expect(out).toMatch(/\[Riskiest assumption\]/);
    expect(out).toContain('No leading questions');
    // The read/verdict shape
    expect(out).toContain('Verdict:');
    expect(out).toContain('Sharpened idea');
    // Hands off to bobby new
    expect(out).toContain('bobby new');
  });

  test('works with multi-word unquoted ideas', () => {
    const out = run('vet build a budgeting app for freelancers');
    expect(out).toContain('build a budgeting app for freelancers');
  });

  test('vet <n> resolves a captured idea from the global inbox', () => {
    run('idea "a newsletter tool for indie devs"'); // captured to inbox (no project)
    const out = run('vet 1');
    expect(out).toContain('a newsletter tool for indie devs');
  });

  test('vet <n> resolves a captured idea from the current project', () => {
    // Make a project and capture a project-local idea
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions', sprints_dir: '.bobby/sprints',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    run('idea "in-project idea about caching"');
    const out = run('vet 1');
    expect(out).toContain('in-project idea about caching');
  });

  test('a numeric arg with no matching idea is treated as literal text', () => {
    const out = run('vet 42');
    expect(out).toContain('"42"');
  });
});
