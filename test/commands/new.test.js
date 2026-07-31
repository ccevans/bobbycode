// test/commands/new.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby new', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  // Explicit git identity so the initial commit works on bare CI runners.
  const gitEnv = {
    ...process.env,
    HOME: undefined, // set per-call
    GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  const run = (args) =>
    execSync(`node ${bobby} ${args}`, {
      cwd: tmpDir, encoding: 'utf8',
      env: { ...gitEnv, HOME: path.join(tmpDir, '.home') },
    });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-new-'));
    fs.mkdirSync(path.join(tmpDir, '.home'), { recursive: true });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  const epicTicket = (dir) => {
    const tdir = path.join(tmpDir, dir, '.bobby', 'tickets');
    const entry = fs.readdirSync(tdir).find(e => e.startsWith('TKT-001'));
    return fs.readFileSync(path.join(tdir, entry, 'ticket.md'), 'utf8');
  };

  test('scaffolds a project directory slugged from the idea', () => {
    const out = run('new "a habit tracker for runners"');
    expect(out).toContain('New project ready');
    const dir = 'a-habit-tracker-for-runners';
    expect(fs.existsSync(path.join(tmpDir, dir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, dir, '.claude', 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, dir, '.claude', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, dir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, dir, 'README.md'))).toBe(true);
  });

  test('creates the idea as an epic with the idea in its description', () => {
    run('new "a habit tracker for runners"');
    const ticket = epicTicket('a-habit-tracker-for-runners');
    expect(ticket).toContain('type: epic');
    expect(ticket).toContain('priority: high');
    expect(ticket).toContain('**The idea:** a habit tracker for runners');
  });

  test('README is seeded with the idea', () => {
    run('new "a habit tracker for runners"');
    const readme = fs.readFileSync(path.join(tmpDir, 'a-habit-tracker-for-runners', 'README.md'), 'utf8');
    expect(readme).toContain('a habit tracker for runners');
  });

  test('makes an initial git commit', () => {
    run('new "a habit tracker for runners"');
    const log = execSync('git log --oneline', {
      cwd: path.join(tmpDir, 'a-habit-tracker-for-runners'), encoding: 'utf8',
    });
    expect(log).toMatch(/Scaffold TKT-001/);
  });

  test('--dir overrides the directory name', () => {
    run('new "some idea" --dir my-app');
    expect(fs.existsSync(path.join(tmpDir, 'my-app', '.bobbyrc.yml'))).toBe(true);
  });

  test('--stack sets the stack in config', () => {
    run('new "a web thing" --dir webapp --stack nextjs');
    const cfg = YAML.parse(fs.readFileSync(path.join(tmpDir, 'webapp', '.bobbyrc.yml'), 'utf8'));
    expect(cfg.stack).toBe('nextjs');
  });

  test('default node starter scaffolds a runnable app that passes its own tests', () => {
    const out = run('new "a url shortener" --dir short');
    const dir = path.join(tmpDir, 'short');
    // Skeleton files present
    expect(fs.existsSync(path.join(dir, 'server.js'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'test', 'health.test.js'))).toBe(true);
    // package.json rendered with the project name
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('short');
    // The starter's OWN tests pass with zero install
    const testOut = execSync('node --test', { cwd: dir, encoding: 'utf8' });
    expect(testOut).toMatch(/# pass 3/);
    expect(testOut).toMatch(/# fail 0/);
    // Handoff mentions running it
    expect(out).toContain('run it now');
  });

  test('web starter scaffolds a static site rendered with the idea', () => {
    run('new "my portfolio" --dir folio --stack web');
    const dir = path.join(tmpDir, 'folio');
    expect(fs.existsSync(path.join(dir, 'public', 'index.html'))).toBe(true);
    const html = fs.readFileSync(path.join(dir, 'public', 'index.html'), 'utf8');
    expect(html).toContain('folio');
    expect(html).toContain('my portfolio');
    const testOut = execSync('node --test', { cwd: dir, encoding: 'utf8' });
    expect(testOut).toMatch(/# fail 0/);
  });

  test('framework stack without a built-in starter scaffolds Bobby only (no server.js)', () => {
    run('new "a thing" --dir plain --stack generic');
    const dir = path.join(tmpDir, 'plain');
    expect(fs.existsSync(path.join(dir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'server.js'))).toBe(false);
  });

  test('handoff points at define first, plan as the skip-ahead', () => {
    const out = run('new "a habit tracker for runners"');
    expect(out).toContain('bobby run define TKT-001');
    expect(out).toContain('bobby run plan TKT-001');
  });

  test('rejects an unknown stack', () => {
    expect(() => run('new "x" --dir y --stack banana')).toThrow();
  });

  test('refuses a non-empty existing directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'taken'));
    fs.writeFileSync(path.join(tmpDir, 'taken', 'file.txt'), 'x');
    expect(() => run('new "y" --dir taken')).toThrow();
  });
});
