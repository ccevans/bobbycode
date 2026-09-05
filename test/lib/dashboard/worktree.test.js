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
import { findProjectRoot } from '../../../lib/config.js';

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
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
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

  // PRO-027: in a studio, board writes from a worktree reach the studio board
  // only because findProjectRoot walks UP from the worktree to the studio root —
  // which holds only while the worktree lives under the studio root. Refuse a
  // studio worktree_root that resolves outside the studio, rather than silently
  // producing worktrees whose agents can't reach the board.
  describe('studio worktree_root validation (PRO-027)', () => {
    let studioRoot;
    let codeRepo;

    beforeEach(() => {
      studioRoot = path.join(tmpDir, 'studio');
      codeRepo = path.join(studioRoot, 'repos', 'app');
      fs.mkdirSync(codeRepo, { recursive: true });
      // A studio HAS a .bobbyrc.yml — that file is what makes findProjectRoot
      // stop there, which is the whole mechanism board resolution depends on.
      // Without it these fixtures described a studio that does not exist on
      // disk, which is how a guard checking mere containment looked sufficient.
      fs.writeFileSync(path.join(studioRoot, '.bobbyrc.yml'), 'studio: acme\n');
    });

    test('refuses a studio worktree_root OUTSIDE the studio root', () => {
      const outside = path.join(tmpDir, 'elsewhere-wt');
      const config = { studio: 'acme', dashboard: { worktree_root: outside } };
      let err;
      try {
        resolveWorktreeRoot(codeRepo, config, studioRoot);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Error);
      // Actionable message names worktree_root, the studio root, and the fix.
      expect(err.message).toMatch(/worktree_root/);
      expect(err.message).toContain(outside);
      expect(err.message).toContain(studioRoot);
    });

    test('accepts a studio worktree_root UNDER the studio root', () => {
      const inside = path.join(studioRoot, 'bobby-wt');
      const config = { studio: 'acme', dashboard: { worktree_root: inside } };
      expect(resolveWorktreeRoot(codeRepo, config, studioRoot)).toBe(path.resolve(inside));
    });

    test('accepts the default studio worktree_root (a studio descendant)', () => {
      // Default `../bobby-wt` from studioRoot/repos/app resolves to
      // studioRoot/repos/bobby-wt — still under the studio root.
      const config = { studio: 'acme' };
      const resolved = resolveWorktreeRoot(codeRepo, config, studioRoot);
      expect(resolved).toBe(path.resolve(codeRepo, '../bobby-wt'));
    });

    test('refuses a root that is INSIDE the studio but shadowed by another .bobbyrc.yml', () => {
      // Containment was necessary, not sufficient. A code repo carrying a
      // leftover single-project config — which this studio's own repos did until
      // the BOB migration retired them — shadows the studio, so findProjectRoot
      // stops at the repo and every board write lands on the repo's own board.
      // The old guard accepted this; it is the exact failure BOB-117 was filed for.
      fs.writeFileSync(path.join(codeRepo, '.bobbyrc.yml'), 'project: app\n');
      const config = { studio: 'acme', dashboard: { worktree_root: './wt' } };

      let err;
      try { resolveWorktreeRoot(codeRepo, config, studioRoot); } catch (e) { err = e; }

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain(codeRepo);       // names where it WOULD resolve
      expect(err.message).toMatch(/shadows the studio/);
    });

    test('board resolution from inside an accepted worktree reaches the studio — AC2', () => {
      // The assertion AC2 literally asks for, and the one nobody had written:
      // drive findProjectRoot from a worktree PATH, not just the resolver.
      const config = { studio: 'acme', dashboard: { worktree_root: '../../wt' } };
      const root = resolveWorktreeRoot(codeRepo, config, studioRoot);
      fs.mkdirSync(path.join(root, 'BOB-1-build'), { recursive: true });

      expect(findProjectRoot(path.join(root, 'BOB-1-build'))).toBe(studioRoot);
    });

    test('non-studio project is unaffected — worktree_root outside repo is allowed', () => {
      const outside = path.join(tmpDir, 'elsewhere-wt');
      // No `studio` key: v1 project, no validation regardless of studioRoot arg.
      const config = { dashboard: { worktree_root: outside } };
      expect(resolveWorktreeRoot(codeRepo, config, studioRoot)).toBe(path.resolve(outside));
      expect(resolveWorktreeRoot(codeRepo, config)).toBe(path.resolve(outside));
    });
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
