// test/lib/config.test.js
import { readConfig, writeConfig, findProjectRoot, configExists, findMainWorktreeRoot, resolveTicketsDir } from '../../lib/config.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('config', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('readConfig reads .bobbyrc.yml', () => {
    const yml = `project: test-app\nstack: nextjs\ntickets_dir: .bobby/tickets\nareas:\n  - auth\n  - dashboard\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.project).toBe('test-app');
    expect(config.stack).toBe('nextjs');
    expect(config.areas).toEqual(['auth', 'dashboard']);
  });

  test('readConfig throws if no .bobbyrc.yml', () => {
    expect(() => readConfig(tmpDir)).toThrow('Not a Bobby project');
  });

  test('writeConfig creates .bobbyrc.yml', () => {
    const config = { project: 'my-app', stack: 'nextjs', tickets_dir: '.bobby/tickets', areas: ['auth'] };
    writeConfig(tmpDir, config);
    const content = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(content).toContain('project: my-app');
  });

  test('readConfig applies defaults for missing fields', () => {
    const yml = `project: test-app\nstack: nextjs\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.ticket_prefix).toBe('TKT');
    expect(config.health_checks).toEqual([]);
    expect(config.areas).toEqual([]);
  });

  test('defaults include testing_tools', () => {
    const yml = `project: test-app\nstack: nextjs\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.testing_tools).toEqual(['curl']);
  });

  test('user can override testing_tools', () => {
    const yml = `project: test-app\nstack: nextjs\ntesting_tools:\n  - playwright\n  - curl\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.testing_tools).toEqual(['playwright', 'curl']);
  });

  test('configExists returns true when .bobbyrc.yml exists', () => {
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'project: test\n');
    expect(configExists(tmpDir)).toBe(true);
  });

  test('configExists returns false when .bobbyrc.yml is missing', () => {
    expect(configExists(tmpDir)).toBe(false);
  });

  test('findProjectRoot walks up directories to find config', () => {
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'project: test\n');
    const subDir = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(subDir, { recursive: true });
    expect(findProjectRoot(subDir)).toBe(tmpDir);
  });

  test('findProjectRoot throws when no config found', () => {
    expect(() => findProjectRoot(tmpDir)).toThrow('Not a Bobby project');
  });

  test('findProjectRoot finds config in current directory', () => {
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'project: test\n');
    expect(findProjectRoot(tmpDir)).toBe(tmpDir);
  });

  test('findProjectRoot uses cwd as default when no argument given', () => {
    const origCwd = process.cwd();
    const realTmpDir = fs.realpathSync(tmpDir);
    process.chdir(realTmpDir);
    fs.writeFileSync(path.join(realTmpDir, '.bobbyrc.yml'), 'project: test\n');
    try {
      expect(findProjectRoot()).toBe(realTmpDir);
    } finally {
      process.chdir(origCwd);
    }
  });

  test('readConfig derives tickets_dir and runs_dir from bobby_dir', () => {
    const yml = `project: test-app\nbobby_dir: .custom\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.tickets_dir).toBe('.custom/tickets');
    expect(config.runs_dir).toBe('.custom/runs');
  });

  test('readConfig handles empty YAML file', () => {
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), '');
    const config = readConfig(tmpDir);
    // Should get all defaults
    expect(config.ticket_prefix).toBe('TKT');
    expect(config.bobby_dir).toBe('.bobby');
  });

  test('readConfig preserves explicit tickets_dir and runs_dir', () => {
    const yml = `project: test-app\nbobby_dir: .custom\ntickets_dir: my/tickets\nruns_dir: my/runs\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.tickets_dir).toBe('my/tickets');
    expect(config.runs_dir).toBe('my/runs');
  });
});

describe('worktree resolution', () => {
  let mainDir;
  let worktreeDir;

  beforeEach(() => {
    mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-main-'));
    worktreeDir = path.join(os.tmpdir(), `bobby-wt-${Date.now()}`);
    // Set up a real git repo and worktree
    execSync('git init', { cwd: mainDir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', { cwd: mainDir, stdio: 'pipe' });
    execSync(`git worktree add "${worktreeDir}" -b test-wt`, { cwd: mainDir, stdio: 'pipe' });
  });

  afterEach(() => {
    execSync(`git worktree remove "${worktreeDir}" --force`, { cwd: mainDir, stdio: 'pipe' });
    fs.rmSync(mainDir, { recursive: true });
  });

  test('findMainWorktreeRoot returns null when not in a worktree', () => {
    const origCwd = process.cwd();
    process.chdir(mainDir);
    try {
      expect(findMainWorktreeRoot()).toBeNull();
    } finally {
      process.chdir(origCwd);
    }
  });

  test('findMainWorktreeRoot returns main root when in a worktree', () => {
    const origCwd = process.cwd();
    process.chdir(worktreeDir);
    try {
      const result = findMainWorktreeRoot();
      expect(fs.realpathSync(result)).toBe(fs.realpathSync(mainDir));
    } finally {
      process.chdir(origCwd);
    }
  });

  test('resolveTicketsDir returns local path when not in a worktree', () => {
    const origCwd = process.cwd();
    process.chdir(mainDir);
    try {
      const config = { tickets_dir: '.bobby/tickets' };
      const result = resolveTicketsDir(mainDir, config);
      expect(result).toBe(path.join(mainDir, '.bobby/tickets'));
    } finally {
      process.chdir(origCwd);
    }
  });

  test('resolveTicketsDir returns main worktree path when in a worktree', () => {
    const origCwd = process.cwd();
    process.chdir(worktreeDir);
    try {
      const config = { tickets_dir: '.bobby/tickets' };
      const result = resolveTicketsDir(worktreeDir, config);
      expect(fs.realpathSync(path.dirname(path.dirname(result)))).toBe(fs.realpathSync(mainDir));
      expect(result).toContain('.bobby/tickets');
    } finally {
      process.chdir(origCwd);
    }
  });
});
