// test/lib/scope-check.test.js
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  changedFilesOnBranch,
  planFileCheck,
  runScopeCheck,
  formatScopeCheck,
} from '../../lib/scope-check.js';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
const write = (root, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

describe('planFileCheck', () => {
  const plan = '## Files to modify\n- `lib/a.js`\n- `test/a.test.js`\n';

  test('all changed files named in a plan with a file list is clean', () => {
    const r = planFileCheck(plan, ['lib/a.js', 'test/a.test.js']);
    expect(r.listsFiles).toBe(true);
    expect(r.outOfPlan).toEqual([]);
  });

  test('flags a changed file the plan does not name', () => {
    const r = planFileCheck(plan, ['lib/a.js', 'README.md']);
    expect(r.outOfPlan).toEqual(['README.md']);
  });

  test('a backticked directory covers files under it; a longer studio path in the plan matches', () => {
    const studioPlan = '## Files\n- `test/lib/`\n\nStep 1: edit `repos/app/src/x.js`.\n';
    const r = planFileCheck(studioPlan, ['test/lib/new.test.js', 'src/x.js', 'src/y.js']);
    expect(r.outOfPlan).toEqual(['src/y.js']);
  });

  test('numbered and deeper headings count as a Files heading', () => {
    expect(planFileCheck('## 3. Files to modify\n`a.js`', ['a.js']).listsFiles).toBe(true);
    expect(planFileCheck('### Files to change\n`a.js`', ['a.js']).listsFiles).toBe(true);
  });

  test('a plan with no Files heading lists no files', () => {
    expect(planFileCheck('## Approach\nDo it.', ['lib/a.js']).listsFiles).toBe(false);
    expect(planFileCheck(null, ['lib/a.js']).listsFiles).toBe(false);
  });
});

describe('changedFilesOnBranch / runScopeCheck', () => {
  let repo;

  const initRepo = () => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-scope-'));
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 't@example.com');
    git(repo, 'config', 'user.name', 'T');
    write(repo, 'base.txt');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'base');
  };

  afterEach(() => { if (repo) fs.rmSync(repo, { recursive: true, force: true }); repo = null; });

  test('includes committed, uncommitted and untracked files; excludes bookkeeping', () => {
    initRepo();
    git(repo, 'checkout', '-q', '-b', 'feat');
    write(repo, 'lib/a.js');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'a');
    write(repo, 'base.txt', 'changed\n');
    write(repo, 'lib/b.js');
    write(repo, '.bobby/tickets/x/plan.md');
    write(repo, '.claude/skills/bobby-build/learnings.local.md');

    const r = changedFilesOnBranch(repo);
    expect(r.ok).toBe(true);
    expect(r.base).toBe('main');
    expect(r.files).toEqual(['base.txt', 'lib/a.js', 'lib/b.js']);
  });

  test('not run: not a git repository', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-nogit-'));
    try {
      const r = changedFilesOnBranch(plain);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('not a git repository');
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  test('not run: a repo with no commits yet', () => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-scope-'));
    git(repo, 'init', '-q', '-b', 'main');
    const r = changedFilesOnBranch(repo);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no commits yet');
  });

  test('not run: on main with no upstream to compare against', () => {
    initRepo();
    const r = changedFilesOnBranch(repo);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no upstream');
  });

  test('not run: the studio root is not a code repo', () => {
    initRepo();
    const r = runScopeCheck({ cwd: repo, ticketPath: repo, studioRoot: repo });
    expect(r.status).toBe('not-run');
    expect(r.reason).toContain('code repo');
  });

  test('status per plan shape: unlisted, noplan, drift, clean, empty', () => {
    initRepo();
    git(repo, 'checkout', '-q', '-b', 'feat');
    const ticketPath = path.join(repo, '.bobby', 'tickets', 'TKT-001--x');
    fs.mkdirSync(ticketPath, { recursive: true });

    expect(runScopeCheck({ cwd: repo, ticketPath }).status).toBe('empty');

    write(repo, 'lib/a.js');
    expect(runScopeCheck({ cwd: repo, ticketPath }).status).toBe('noplan');

    fs.writeFileSync(path.join(ticketPath, 'plan.md'), '## Approach\nDo it.\n');
    const unlisted = runScopeCheck({ cwd: repo, ticketPath });
    expect(unlisted.status).toBe('unlisted');
    expect(unlisted.files).toEqual(['lib/a.js']);

    fs.writeFileSync(path.join(ticketPath, 'plan.md'), '## Files to modify\n- `lib/a.js`\n');
    expect(runScopeCheck({ cwd: repo, ticketPath }).status).toBe('clean');

    write(repo, 'README.md');
    const drift = runScopeCheck({ cwd: repo, ticketPath });
    expect(drift.status).toBe('drift');
    expect(drift.outOfPlan).toEqual(['README.md']);
  });
});

describe('formatScopeCheck', () => {
  test('drift names the files, points at --found-in, and yields a comment', () => {
    const f = formatScopeCheck({ status: 'drift', base: 'main', files: ['a', 'README.md'], outOfPlan: ['README.md'] }, 'TKT-001');
    expect(f.lines.join('\n')).toContain('1 changed file(s) not named in plan.md');
    expect(f.lines.join('\n')).toContain('README.md');
    expect(f.lines.join('\n')).toContain('--found-in TKT-001');
    expect(f.comment).toBe('Scope check: out of plan — README.md');
  });

  test('unlisted and noplan yield an unchecked comment', () => {
    const u = formatScopeCheck({ status: 'unlisted', files: ['lib/a.js'] }, 'TKT-001');
    expect(u.lines.join('\n')).toContain('plan.md has no "Files to modify" section');
    expect(u.comment).toBe('Scope check: unchecked (plan lists no files) — lib/a.js');
    const n = formatScopeCheck({ status: 'noplan', files: ['lib/a.js'] }, 'TKT-001');
    expect(n.lines.join('\n')).toContain('no plan.md');
    expect(n.comment).toContain('unchecked');
  });

  test('clean, empty and not-run write no comment', () => {
    expect(formatScopeCheck({ status: 'clean', files: ['a'] }, 'T').lines[0]).toContain('all 1 changed file(s) are named in plan.md');
    expect(formatScopeCheck({ status: 'clean', files: ['a'] }, 'T').comment).toBeNull();
    expect(formatScopeCheck({ status: 'empty', base: 'main' }, 'T').comment).toBeNull();
    const nr = formatScopeCheck({ status: 'not-run', reason: 'not a git repository' }, 'T');
    expect(nr.lines[0]).toBe('Scope check not run: not a git repository');
    expect(nr.comment).toBeNull();
  });
});
