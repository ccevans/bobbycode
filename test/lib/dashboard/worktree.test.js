// test/lib/dashboard/worktree.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import {
  createWorktree,
  removeWorktree,
  computeWorktreePlacement,
  commitCheckpoint,
  diffAgainstMain,
  changedFiles,
  detectMainBranch,
  currentBranch,
  isGitRepo,
  resolveWorktreeRoot,
} from '../../../lib/dashboard/worktree.js';

const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  git(dir, 'add .');
  git(dir, 'commit -q -m "initial"');
  return dir;
}

describe('worktree manager', () => {
  let tmpDir;
  let repoDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wt-'));
    repoDir = path.join(tmpDir, 'repo');
    initRepo(repoDir);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('isGitRepo true for git repo, false otherwise', () => {
    expect(isGitRepo(repoDir)).toBe(true);
    expect(isGitRepo(tmpDir)).toBe(false);
  });

  test('detectMainBranch returns main for a main-branch repo', () => {
    expect(detectMainBranch(repoDir)).toBe('main');
  });

  test('computeWorktreePlacement is deterministic', () => {
    const config = { dashboard: { worktree_root: '../wt' } };
    const a = computeWorktreePlacement(repoDir, config, 'TKT-1', 'plan');
    const b = computeWorktreePlacement(repoDir, config, 'TKT-1', 'plan');
    expect(a.worktreePath).toBe(b.worktreePath);
    expect(a.branch).toBe(b.branch);
    expect(a.branch).toBe('bobby/tkt-1-plan');
  });

  test('resolveWorktreeRoot respects config override', () => {
    const a = resolveWorktreeRoot(repoDir, {});
    expect(a).toBe(path.resolve(repoDir, '../bobby-wt'));
    const b = resolveWorktreeRoot(repoDir, { dashboard: { worktree_root: '../custom' } });
    expect(b).toBe(path.resolve(repoDir, '../custom'));
  });

  test('createWorktree creates a worktree on a new branch', () => {
    const wtPath = path.join(tmpDir, 'wt-1');
    const { created, branch } = createWorktree(repoDir, {
      worktreePath: wtPath,
      branch: 'bobby/tkt-1-plan',
    });
    expect(created).toBe(true);
    expect(fs.existsSync(wtPath)).toBe(true);
    expect(currentBranch(wtPath)).toBe(branch);
    const branches = git(repoDir, 'branch --list').split('\n').map(s => s.replace(/^[*+]?\s*/, ''));
    expect(branches).toContain('bobby/tkt-1-plan');
  });

  test('createWorktree is idempotent when worktree already exists', () => {
    const wtPath = path.join(tmpDir, 'wt-idem');
    createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/idem' });
    const second = createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/idem' });
    expect(second.created).toBe(false);
  });

  test('removeWorktree removes and optionally deletes branch', () => {
    const wtPath = path.join(tmpDir, 'wt-rm');
    createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/rm' });
    const { removed } = removeWorktree(repoDir, wtPath, { deleteBranch: true, branch: 'bobby/rm' });
    expect(removed).toBe(true);
    expect(fs.existsSync(wtPath)).toBe(false);
    const branches = git(repoDir, 'branch --list');
    expect(branches).not.toContain('bobby/rm');
  });

  test('commitCheckpoint returns null when nothing to commit', () => {
    const wtPath = path.join(tmpDir, 'wt-empty');
    createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/empty' });
    const sha = commitCheckpoint(wtPath, 'nothing');
    expect(sha).toBeNull();
  });

  test('commitCheckpoint commits changes and returns a sha', () => {
    const wtPath = path.join(tmpDir, 'wt-work');
    createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/work' });
    fs.writeFileSync(path.join(wtPath, 'hello.txt'), 'world');
    const sha = commitCheckpoint(wtPath, 'add hello');
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  test('diffAgainstMain returns the diff text and changedFiles lists files', () => {
    const wtPath = path.join(tmpDir, 'wt-diff');
    createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/diff' });
    fs.writeFileSync(path.join(wtPath, 'new.txt'), 'hi\n');
    commitCheckpoint(wtPath, 'add new');
    const { diff } = diffAgainstMain(repoDir, 'bobby/diff');
    expect(diff).toContain('new.txt');
    expect(diff).toContain('+hi');

    const files = changedFiles(repoDir, 'bobby/diff');
    expect(files.find(f => f.file === 'new.txt')).toBeDefined();
  });

  test('diffAgainstMain truncates over maxBytes', () => {
    const wtPath = path.join(tmpDir, 'wt-big');
    createWorktree(repoDir, { worktreePath: wtPath, branch: 'bobby/big' });
    const big = 'a'.repeat(2000);
    fs.writeFileSync(path.join(wtPath, 'big.txt'), big);
    commitCheckpoint(wtPath, 'big');
    const { diff, truncated } = diffAgainstMain(repoDir, 'bobby/big', { maxBytes: 500 });
    expect(truncated).toBe(true);
    expect(diff.length).toBeLessThanOrEqual(500);
  });
});
