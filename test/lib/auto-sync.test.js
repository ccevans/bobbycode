// test/lib/auto-sync.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { autoSync } from '../../lib/auto-sync.js';

describe('autoSync (scoped paths)', () => {
  let tmpDir;
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_COMMITTER_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-autosync-'));
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Set up initial Bobby structure
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'design'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'project: test\nstack: generic\n');
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test', 'ticket.md'),
      '---\nid: TKT-001\n---\nTest ticket'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'design', 'spec.md'),
      'original design spec'
    );
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe', env: gitEnv });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  function commitCount() {
    return execSync('git rev-list --count HEAD', { cwd: tmpDir, encoding: 'utf8' }).trim();
  }

  function lastCommitFiles() {
    return execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
      cwd: tmpDir, encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);
  }

  function gitStatus() {
    return execSync('git status --porcelain', { cwd: tmpDir, encoding: 'utf8' }).trim();
  }

  test('commits only specified paths', () => {
    // Dirty two files
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test', 'ticket.md'),
      '---\nid: TKT-001\n---\nModified ticket'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'design', 'spec.md'),
      'modified by another agent'
    );

    // Only sync the ticket file
    autoSync(tmpDir, ['.bobby/tickets/TKT-001--test/ticket.md']);

    const files = lastCommitFiles();
    expect(files).toEqual(['.bobby/tickets/TKT-001--test/ticket.md']);

    // The design file should remain dirty
    const status = gitStatus();
    expect(status).toContain('.bobby/design/spec.md');
  });

  test('unrelated dirty Bobby path survives the commit', () => {
    // Dirty an unrelated file
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'design', 'spec.md'),
      'modified by another agent'
    );
    // Dirty the target file
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test', 'ticket.md'),
      '---\nid: TKT-001\n---\nUpdated'
    );

    autoSync(tmpDir, ['.bobby/tickets/TKT-001--test/ticket.md']);

    // Verify the unrelated file is still dirty
    const status = gitStatus();
    expect(status).toContain('.bobby/design/spec.md');

    // Verify its content is preserved
    const content = fs.readFileSync(path.join(tmpDir, '.bobby', 'design', 'spec.md'), 'utf8');
    expect(content).toBe('modified by another agent');
  });

  test('empty changedPaths does nothing', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test', 'ticket.md'),
      '---\nid: TKT-001\n---\nModified'
    );

    const before = commitCount();
    autoSync(tmpDir, []);
    const after = commitCount();

    expect(after).toBe(before);
  });

  test('non-existent paths does nothing', () => {
    const before = commitCount();
    autoSync(tmpDir, ['does/not/exist.md']);
    const after = commitCount();

    expect(after).toBe(before);
  });

  test('undefined changedPaths does nothing', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'design', 'spec.md'),
      'should not be committed'
    );

    const before = commitCount();
    autoSync(tmpDir);
    const after = commitCount();

    expect(after).toBe(before);
  });
});
