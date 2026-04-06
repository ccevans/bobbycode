// test/commands/sync.test.js
import { jest } from '@jest/globals';
import { registerSync } from '../../commands/sync.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

describe('bobby sync', () => {
  let tmpDir;
  let origCwd;
  let logSpy;
  let errorSpy;
  let exitSpy;

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_COMMITTER_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-sync-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);

    // Set up git repo with initial Bobby project
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'project: test-sync\nstack: generic\n');
    execSync('git add . && git commit -m "init bobby"', { cwd: tmpDir, stdio: 'pipe', env: gitEnv });

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function mockProgram() {
    let actionFn;
    let opts = {};
    const cmd = {
      description: () => cmd,
      option: () => cmd,
      action: (fn) => { actionFn = fn; return cmd; },
    };
    const program = {
      command: () => cmd,
      getAction: () => actionFn,
    };
    return program;
  }

  test('commits .bobby/ changes', async () => {
    // Create a ticket file
    const ticketDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, 'ticket.md'), '---\nid: TKT-001\n---\nTest ticket');

    const program = mockProgram();
    registerSync(program);
    await program.getAction()({});

    const log = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf8' });
    expect(log).toContain('bobby: sync tickets and sessions');
  });

  test('reports nothing to sync when clean', async () => {
    const program = mockProgram();
    registerSync(program);
    await program.getAction()({});

    // No new commit should be created (still just "init bobby")
    const log = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf8' });
    const commits = log.trim().split('\n');
    expect(commits.length).toBe(1);
  });

  test('uses custom commit message', async () => {
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', 'test.md'), 'test');

    const program = mockProgram();
    registerSync(program);
    await program.getAction()({ message: 'custom sync message' });

    const log = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf8' });
    expect(log).toContain('custom sync message');
  });

  test('warns when --push but no remote', async () => {
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', 'test.md'), 'test');

    const program = mockProgram();
    registerSync(program);
    await program.getAction()({ push: true });

    // Should have committed but warned about no remote
    const log = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf8' });
    expect(log).toContain('bobby: sync');
  });

  test('--setup with URL adds remote', async () => {
    const program = mockProgram();
    registerSync(program);
    await program.getAction()({ setup: 'https://github.com/test/repo.git' });

    const remotes = execSync('git remote -v', { cwd: tmpDir, encoding: 'utf8' });
    expect(remotes).toContain('https://github.com/test/repo.git');
  });

  test('--setup warns if remote already exists', async () => {
    execSync('git remote add origin https://github.com/test/existing.git', { cwd: tmpDir, stdio: 'pipe' });

    const program = mockProgram();
    registerSync(program);
    await program.getAction()({ setup: 'https://github.com/test/new.git' });

    // Remote should still be the original
    const remotes = execSync('git remote get-url origin', { cwd: tmpDir, encoding: 'utf8' });
    expect(remotes.trim()).toBe('https://github.com/test/existing.git');
  });

  test('--setup with no URL shows usage', async () => {
    const program = mockProgram();
    registerSync(program);
    await program.getAction()({ setup: true });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });
});
