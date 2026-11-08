// Real git in a temp studio (and a second temp repo), with only `claude agents` mocked.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import YAML from 'yaml';
import { jest } from '@jest/globals';
import { run as realRun } from '../../../lib/conductor/exec.js';
import { moveTicket, listTickets } from '../../../lib/tickets.js';
import { reapWorktrees, renderWorktreeReap, evaluateWorktrees } from '../../../lib/conductor/worktree-reaper.js';
import { readSizeCache } from '../../../lib/conductor/worktrees.js';
import { makeStudio, seedTickets } from './helpers.js';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' });
const sid = (id) => `${id}-0000-4000-8000-000000000000`;
const bg = (id, name, state, cwd, extra = {}) => ({ id, sessionId: sid(id), name, cwd, kind: 'background', startedAt: 1, state, pid: 99, ...extra });

describe('conductor worktree reaper', () => {
  let root;
  let hookDir;
  let config;
  let app;
  let home;
  const ticketsDir = () => path.join(root, '.bobby', 'alpha', 'tickets');
  const finish = (n) => moveTicket(ticketsDir(), listTickets(ticketsDir()).find(t => Number(t.id.split('-')[1]) === n).id, 'done', 'test');
  const wt = (repo, name) => {
    const p = path.join(repo, 'worktrees', name);
    git(repo, 'worktree', 'add', '-q', '-b', `br-${name}`, p);
    return fs.realpathSync(p);
  };

  /** run: real exec for everything but `claude agents`; every call recorded. */
  function mockRun({ agents = [], failList = false, failStatus = null } = {}) {
    const calls = [];
    let reads = 0;
    const run = (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd === 'claude') { reads += 1; return JSON.stringify(typeof agents === 'function' ? agents(reads) : agents); }
      if (failList && args.includes('list')) throw new Error('`git worktree list` failed: fatal: not a git repository');
      if (failStatus && args.includes('status') && args[1] === failStatus) throw new Error('`git status` failed: index.lock exists');
      return realRun(cmd, args);
    };
    return { run, calls, removals: () => calls.filter(c => c.includes('remove')) };
  }

  const go = (m, opts = {}) => reapWorktrees({ studioRoot: root, config, run: m.run, cwd: os.tmpdir(), home, ...opts });
  const exists = (p) => fs.existsSync(p);

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'a\n');
    fs.writeFileSync(path.join(root, '.gitignore'), '*.log\nbuild-cache/\n');
    git(root, 'add', 'tracked.txt', '.gitignore');
    git(root, 'commit', '-q', '-m', 'init');
    app = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wt-app-'));
    execFileSync('git', ['init', '-q', app]);
    git(app, 'commit', '--allow-empty', '-q', '-m', 'init');
    const rc = path.join(root, '.bobbyrc.yml');
    const parsed = YAML.parse(fs.readFileSync(rc, 'utf8'));
    fs.writeFileSync(rc, YAML.stringify({ ...parsed, repos: { ...(parsed.repos || {}), app: { path: app } } }));
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wt-home-'));
    seedTickets(root, 'alpha', [{ title: 'one' }, { title: 'two' }, { title: 'three' }, { title: 'four' }, { title: 'five' }]);
    config = { projects: ['alpha'], hook_state_dir: hookDir, governor: {}, reaper: {}, claims: {} };
  });
  afterEach(() => {
    for (const d of [root, app, home]) fs.rmSync(d, { recursive: true, force: true });
  });

  test('dry run lists only done, clean worktrees with no live session; every other case is kept with its reason; nothing changes', () => {
    finish(1); finish(3); finish(4);
    const clean = wt(root, 'AL-1-ui');
    const building = wt(root, 'AL-2-ui');
    const dirty = wt(root, 'AL-3-ui');
    const live = wt(root, 'AL-4-ui');
    const scratch = wt(root, 'scratchpad');
    fs.appendFileSync(path.join(dirty, 'tracked.txt'), 'edit\n');
    const m = mockRun({ agents: [bg('aaaa1111', 'lane for four', 'working', path.join(live, 'src'))] });
    const report = go(m);
    expect(report.candidates.map(c => c.path)).toEqual([clean]);
    const why = Object.fromEntries(report.kept.map(k => [path.basename(k.path), k.why]));
    expect(why['AL-2-ui']).toBe('ticket AL-002 is backlog');
    expect(why['AL-3-ui']).toMatch(/1 tracked file\(s\) modified or staged/);
    expect(why['AL-4-ui']).toMatch(/live session "lane for four" is inside it/);
    expect(why.scratchpad).toMatch(/no ticket on a board/);
    expect(m.removals()).toEqual([]);
    for (const p of [clean, building, dirty, live, scratch]) expect(exists(p)).toBe(true);
    const text = renderWorktreeReap(report, { apply: false });
    expect(text).toMatch(/Dry run: 1 worktree\(s\) would be removed/);
    expect(text).toMatch(/would remove .*AL-1-ui/);
  });

  test('--apply runs only `git -C <main repo> worktree remove --force <path>`, keeps the branch, and covers every repo', () => {
    finish(1); finish(5);
    const a = wt(root, 'al-1-studio');
    const b = wt(app, 'AL-5-app');
    const keep = wt(root, 'AL-2-ui');
    const m = mockRun();
    const report = go(m, { apply: true });
    expect(report.results.map(r => [path.basename(r.path), r.outcome])).toEqual([['al-1-studio', 'removed'], ['AL-5-app', 'removed']]);
    expect(m.removals()).toEqual([
      ['git', '-C', root, 'worktree', 'remove', '--force', a],
      ['git', '-C', app, 'worktree', 'remove', '--force', b],
    ]);
    expect(exists(a)).toBe(false);
    expect(exists(b)).toBe(false);
    expect(exists(keep)).toBe(true);
    expect(git(root, 'branch', '--list', 'br-al-1-studio')).toMatch(/br-al-1-studio/);
    expect(git(app, 'branch', '--list', 'br-AL-5-app')).toMatch(/br-AL-5-app/);
    expect(git(root, 'worktree', 'list')).not.toMatch(/al-1-studio/);
    expect(report.failed).toBe(0);
  });

  test('ignored files do not block removal (they are rebuildable)', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    fs.writeFileSync(path.join(p, 'scratch.log'), 'x');
    fs.mkdirSync(path.join(p, 'build-cache'));
    fs.writeFileSync(path.join(p, 'build-cache', 'a'), 'x');
    const report = go(mockRun(), { apply: true });
    expect(report.results[0].outcome).toBe('removed');
    expect(exists(p)).toBe(false);
  });

  test('untracked, non-ignored files and folders keep the worktree and the dry run says which (BOB-191)', () => {
    finish(1); finish(2); finish(3);
    const one = wt(root, 'AL-1-ui');
    const many = wt(root, 'AL-2-ui');
    const clean = wt(root, 'AL-3-ui');
    fs.writeFileSync(path.join(one, 'review.md'), 'x');
    fs.mkdirSync(path.join(one, 'test-evidence'));
    fs.writeFileSync(path.join(one, 'test-evidence', 'shot.png'), 'x');
    for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) fs.writeFileSync(path.join(many, f), 'x');
    const m = mockRun();
    const report = go(m, { apply: true });
    expect(report.candidates.map(c => c.path)).toEqual([clean]);
    const why = Object.fromEntries(report.kept.map(k => [path.basename(k.path), k.why]));
    expect(why['AL-1-ui']).toBe('untracked: review.md, test-evidence/');
    expect(why['AL-2-ui']).toBe('untracked: a.txt, b.txt (+2)');
    expect(m.removals()).toEqual([['git', '-C', root, 'worktree', 'remove', '--force', clean]]);
    expect(exists(path.join(one, 'review.md'))).toBe(true);
    expect(exists(path.join(many, 'd.txt'))).toBe(true);
    const text = renderWorktreeReap(report, { apply: false });
    expect(text).toMatch(/2 {2}untracked files that are not ignored/);
    expect(text).toMatch(/kept .*AL-1-ui.*untracked: review\.md, test-evidence\//);
  });

  test('a user setting status.showUntrackedFiles=no cannot hide untracked files from the check', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    fs.writeFileSync(path.join(p, 'review.md'), 'x');
    git(root, 'config', 'status.showUntrackedFiles', 'no');
    const report = go(mockRun(), { apply: true });
    expect(report.candidates).toEqual([]);
    expect(report.kept[0].why).toBe('untracked: review.md');
    expect(exists(path.join(p, 'review.md'))).toBe(true);
  });

  test('tracked changes are reported ahead of untracked ones', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    fs.appendFileSync(path.join(p, 'tracked.txt'), 'edit\n');
    fs.writeFileSync(path.join(p, 'review.md'), 'x');
    const report = go(mockRun());
    expect(report.kept[0].why).toBe('1 tracked file(s) modified or staged');
  });

  test('a session that has ended (done, no pid) does not keep a worktree; interactive and blocked ones do', () => {
    finish(1); finish(3); finish(4);
    const ended = wt(root, 'AL-1-ui');
    const blocked = wt(root, 'AL-3-ui');
    const terminal = wt(root, 'AL-4-ui');
    const m = mockRun({
      agents: [
        bg('aaaa1111', 'ended', 'done', ended, { pid: undefined }),
        bg('bbbb2222', 'waits', 'blocked', blocked),
        { sessionId: sid('cccc3333'), name: 'terminal', cwd: terminal, kind: 'interactive', startedAt: 1, status: 'idle', pid: 7 },
      ],
    });
    expect(go(m).candidates.map(c => path.basename(c.path))).toEqual(['AL-1-ui']);
  });

  test('a lane that starts between the plan and the removal keeps its worktree', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    const m = mockRun({ agents: (reads) => (reads === 1 ? [] : [bg('aaaa1111', 'late lane', 'working', p)]) });
    const report = go(m, { apply: true });
    expect(report.candidates).toHaveLength(1);
    expect(report.results[0]).toMatchObject({ outcome: 'skipped' });
    expect(report.results[0].detail).toMatch(/live session "late lane"/);
    expect(m.removals()).toEqual([]);
    expect(exists(p)).toBe(true);
  });

  test('a review.md written between the plan and the removal keeps the worktree', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    // claude agents is read once per snapshot; write the file at the second read, before the re-check's git status
    const m = mockRun({ agents: (reads) => { if (reads === 2) fs.writeFileSync(path.join(p, 'review.md'), 'x'); return []; } });
    const report = go(m, { apply: true });
    expect(report.candidates).toHaveLength(1);
    expect(report.results[0]).toMatchObject({ outcome: 'skipped', detail: 'untracked: review.md' });
    expect(m.removals()).toEqual([]);
    expect(exists(path.join(p, 'review.md'))).toBe(true);
  });

  test('the folder this command runs from is never removed', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    const report = go(mockRun(), { cwd: path.join(p, 'sub') });
    expect(report.candidates).toEqual([]);
    expect(report.kept[0].why).toMatch(/running inside it/);
  });

  test('a locked worktree and a prunable one (folder already gone) are kept', () => {
    finish(1); finish(3);
    const locked = wt(root, 'AL-1-ui');
    git(root, 'worktree', 'lock', locked);
    const gone = wt(root, 'AL-3-ui');
    fs.rmSync(gone, { recursive: true });
    const report = go(mockRun(), { apply: true });
    expect(report.candidates).toEqual([]);
    expect(report.kept.map(k => k.why).join('\n')).toMatch(/locked[\s\S]*prunable/);
    expect(exists(locked)).toBe(true);
  });

  test('a detached worktree is removed only when its HEAD is already on a branch', () => {
    finish(1); finish(3);
    const onBranch = wt(root, 'AL-1-ui');
    git(onBranch, 'checkout', '-q', '--detach');
    const orphan = wt(root, 'AL-3-ui');
    git(orphan, 'checkout', '-q', '--detach');
    fs.writeFileSync(path.join(orphan, 'work.txt'), 'w\n');
    git(orphan, 'add', 'work.txt');
    git(orphan, 'commit', '-q', '-m', 'detached work');
    const report = go(mockRun(), { apply: true });
    expect(report.results.map(r => [path.basename(r.path), r.outcome])).toEqual([['AL-1-ui', 'removed']]);
    expect(report.kept.find(k => k.path === orphan).why).toMatch(/detached HEAD is on no branch/);
    expect(exists(orphan)).toBe(true);
    expect(exists(onBranch)).toBe(false);
  });

  test('a session whose cwd differs only in letter case still keeps the worktree (case-insensitive volumes)', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    const swapped = path.join(path.dirname(p), 'al-1-UI');
    if (!fs.existsSync(swapped)) return; // case-sensitive filesystem: the two paths are different folders
    const m = mockRun({ agents: [bg('aaaa1111', 'lane', 'working', swapped)] });
    const report = go(m, { apply: true });
    expect(report.candidates).toEqual([]);
    expect(m.removals()).toEqual([]);
    expect(exists(p)).toBe(true);
  });

  test('folders that are not git worktrees are listed and never touched', () => {
    finish(1);
    const plain = path.join(root, 'worktrees', 'AL-1-leftover');
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, 'keep.txt'), 'x');
    fs.mkdirSync(path.join(home, 'worktrees', 'old-thing'), { recursive: true });
    const m = mockRun();
    const report = go(m, { apply: true });
    expect(report.candidates).toEqual([]);
    expect(report.non_worktree_folders).toEqual([plain, path.join(home, 'worktrees', 'old-thing')]);
    expect(exists(path.join(plain, 'keep.txt'))).toBe(true);
    expect(m.removals()).toEqual([]);
    expect(renderWorktreeReap(report, { apply: true })).toMatch(/not git worktrees .*: 2\n\s+.*AL-1-leftover/);
  });

  test('a failing git is an explicit error, never "no worktrees"', () => {
    expect(() => go(mockRun({ failList: true }))).toThrow(/git worktree list. failed/);
  });

  test('a failing git status keeps the worktree, is reported, and makes the run fail', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    const m = mockRun({ failStatus: p });
    const report = go(m, { apply: true });
    expect(report.candidates).toEqual([]);
    expect(report.failed).toBe(1);
    expect(report.kept[0]).toMatchObject({ why: 'git status failed', error: expect.stringMatching(/index\.lock/) });
    expect(exists(p)).toBe(true);
  });

  test('a failing claude is an explicit error and nothing is removed', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    const run = (cmd, args) => { if (cmd === 'claude') throw new Error('`claude agents --json --all` failed: down'); return realRun(cmd, args); };
    expect(() => reapWorktrees({ studioRoot: root, config, run, apply: true, cwd: os.tmpdir(), home })).toThrow(/claude agents/);
    expect(exists(p)).toBe(true);
  });

  test('a failing removal is reported as failed with the git message', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    const run = (cmd, args) => {
      if (args.includes('remove')) throw new Error('`git worktree remove` failed: contains modified or untracked files');
      return mockRun().run(cmd, args);
    };
    const report = reapWorktrees({ studioRoot: root, config, run, apply: true, cwd: os.tmpdir(), home });
    expect(report.results[0]).toMatchObject({ outcome: 'failed' });
    expect(report.failed).toBe(1);
    expect(exists(p)).toBe(true);
  });

  test('--sizes measures the candidates with du and caches them; without it no du runs', () => {
    finish(1);
    const p = wt(root, 'AL-1-ui');
    fs.writeFileSync(path.join(p, 'big.log'), Buffer.alloc(2 * 1024 * 1024));
    const plain = mockRun();
    expect(go(plain).sizes).toBeNull();
    expect(plain.calls.filter(c => c[0] === 'du')).toEqual([]);
    const m = mockRun();
    const report = go(m, { measure: true });
    expect(m.calls.filter(c => c[0] === 'du')).toEqual([['du', '-sk', p]]);
    expect(report.sizes.kb).toBeGreaterThanOrEqual(2048);
    expect(readSizeCache(hookDir)[p].kb).toBe(report.sizes.kb);
    expect(renderWorktreeReap(report, { apply: false })).toMatch(/Size of the 1 candidate/);
  });

  test('evaluateWorktrees never asks git for a worktree an earlier rule already kept', () => {
    const dirty = jest.fn(() => '');
    const w = (over) => ({ repo: 'r', path: '/w/x', branch: 'b', ticket_ids: ['AL-1'], stage: 'done', ...over });
    const { candidates, kept } = evaluateWorktrees(
      [w({ stage: 'building' }), w({ ticket_ids: [], stage: 'no ticket' }), w({ locked: 'x' })],
      { live: [], cwd: '/elsewhere', dirty },
    );
    expect(candidates).toEqual([]);
    expect(kept).toHaveLength(3);
    expect(dirty).not.toHaveBeenCalled();
  });
});
