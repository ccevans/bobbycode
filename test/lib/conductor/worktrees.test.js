import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseWorktreeList, ticketsInName, classifyWorktrees, studioRepos, nonWorktreeFolders,
  readSizeCache, measureSizes, worktreeSummary, formatKb, sizeCachePath,
} from '../../../lib/conductor/worktrees.js';

const tickets = new Map([
  ['RF-1123', { id: 'RF-1123', stage: 'done' }],
  ['BOB-189', { id: 'BOB-189', stage: 'building' }],
  ['LR-141', { id: 'LR-141', stage: 'done' }],
]);

describe('conductor worktrees', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wt-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  describe('parseWorktreeList', () => {
    const text = [
      'worktree /s', 'HEAD aaa', 'branch refs/heads/main', '',
      'worktree /s/worktrees/RF-1', 'HEAD bbb', 'branch refs/heads/tkt-rf-1', '',
      'worktree /s/worktrees/x', 'HEAD ccc', 'detached', 'locked on a usb stick', '',
      'worktree /gone', 'HEAD ddd', 'branch refs/heads/old', 'prunable gitdir file points to non-existent location', '',
    ].join('\n');

    test('first block is the main worktree; flags are read', () => {
      const e = parseWorktreeList(text);
      expect(e.map(x => x.path)).toEqual(['/s', '/s/worktrees/RF-1', '/s/worktrees/x', '/gone']);
      expect(e[1].branch).toBe('tkt-rf-1');
      expect(e[2]).toMatchObject({ detached: true, locked: 'on a usb stick', branch: null });
      expect(e[3].prunable).toMatch(/non-existent/);
    });

    test('an empty list or a quoted path is an error', () => {
      expect(() => parseWorktreeList('')).toThrow(/returned nothing/);
      expect(() => parseWorktreeList('worktree "/s/we\\303\\251ird"\nHEAD a\n')).toThrow(/quoted path/);
    });
  });

  describe('ticket mapping', () => {
    test('finds the ticket ID in the folder name, case-insensitively and ignoring zero padding', () => {
      expect(ticketsInName('RF-1123-ui', tickets).map(t => t.id)).toEqual(['RF-1123']);
      expect(ticketsInName('rf-1123-api', tickets).map(t => t.id)).toEqual(['RF-1123']);
      expect(ticketsInName('listrobin-ui-lr-0141', tickets).map(t => t.id)).toEqual(['LR-141']);
      expect(ticketsInName('RF-11234-ui', tickets)).toEqual([]);
      expect(ticketsInName('BUNDLE-AL-api', tickets)).toEqual([]);
      expect(ticketsInName('RF-9999-ui', tickets)).toEqual([]);
    });

    test('stage: done only when every named ticket is done; otherwise the open ticket; none = no ticket', () => {
      const wt = (p) => ({ path: p });
      const out = classifyWorktrees([wt('/w/RF-1123-ui'), wt('/w/RF-1123-BOB-189'), wt('/w/scratch'), wt('/w/RF-1123-LR-141')], tickets);
      expect(out.map(w => w.stage)).toEqual(['done', 'building', 'no ticket', 'done']);
      expect(out[1].ticket_ids).toEqual(['RF-1123', 'BOB-189']);
    });
  });

  describe('studioRepos', () => {
    const write = (yml) => fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), yml);
    test('the studio first, then every repos: path, resolved against the studio', () => {
      fs.mkdirSync(path.join(dir, 'repos', 'app'), { recursive: true });
      write('studio: s\nrepos:\n  app:\n    path: repos/app\n');
      expect(studioRepos(dir)).toEqual([{ name: '(studio)', path: dir }, { name: 'app', path: path.join(dir, 'repos', 'app') }]);
    });
    test('a studio with no repos: lists only itself', () => {
      write('studio: s\n');
      expect(studioRepos(dir)).toEqual([{ name: '(studio)', path: dir }]);
    });
    test('a listed repo whose folder is missing, or has no path, is an error', () => {
      write('studio: s\nrepos:\n  app:\n    path: repos/app\n');
      expect(() => studioRepos(dir)).toThrow(/repos\.app path .* does not exist/);
      write('studio: s\nrepos:\n  app:\n    url: x\n');
      expect(() => studioRepos(dir)).toThrow(/repos\.app has no "path"/);
    });
  });

  test('nonWorktreeFolders lists directories git does not know, not files, containers or registered worktrees', () => {
    const top = path.join(dir, 'worktrees');
    const robin = path.join(top, 'robinflow');
    for (const d of ['registered', 'plain', 'robinflow/inner']) fs.mkdirSync(path.join(top, d), { recursive: true });
    fs.writeFileSync(path.join(top, 'run.log'), 'x');
    const registered = new Set([fs.realpathSync(path.join(top, 'registered'))]);
    expect(nonWorktreeFolders([top, robin, path.join(dir, 'missing')], registered))
      .toEqual([path.join(top, 'plain'), path.join(robin, 'inner')]);
  });

  test('a container reached by two spellings of one path (symlink) lists a folder once', () => {
    const top = path.join(dir, 'worktrees');
    fs.mkdirSync(path.join(top, 'plain'), { recursive: true });
    fs.symlinkSync(top, path.join(dir, 'alias'));
    expect(nonWorktreeFolders([top, path.join(dir, 'alias')], new Set())).toEqual([path.join(top, 'plain')]);
  });

  describe('sizes cache', () => {
    test('a missing cache is empty; a corrupt one is an error', () => {
      expect(readSizeCache(dir)).toEqual({});
      fs.writeFileSync(sizeCachePath(dir), '{nope');
      expect(() => readSizeCache(dir)).toThrow(/unreadable size cache/);
      fs.writeFileSync(sizeCachePath(dir), JSON.stringify({ '/a': { kb: 'big' } }));
      expect(() => readSizeCache(dir)).toThrow(/unexpected shape/);
    });

    test('measureSizes runs du -sk per path and caches; a du failure names the path', () => {
      const calls = [];
      const run = (cmd, args) => { calls.push([cmd, ...args]); return `2048\t${args[1]}\n`; };
      const cache = measureSizes(['/a', '/b'], { hookStateDir: dir, run, now: Date.parse('2026-11-08T00:00:00Z') });
      expect(calls).toEqual([['du', '-sk', '/a'], ['du', '-sk', '/b']]);
      expect(cache['/a']).toEqual({ kb: 2048, measured_at: '2026-11-08T00:00:00.000Z' });
      expect(readSizeCache(dir)).toEqual(cache);
      expect(() => measureSizes(['/c'], { hookStateDir: dir, run: () => { throw new Error('`du -sk /c` failed: denied'); } })).toThrow(/du -sk \/c/);
    });

    test('summary counts by stage and sums only what is cached', () => {
      const scan = {
        repos: [1, 2],
        non_worktree_folders: ['/x'],
        worktrees: [
          { path: '/a', stage: 'done' }, { path: '/b', stage: 'done' }, { path: '/c', stage: 'building' }, { path: '/d', stage: 'no ticket' },
        ],
      };
      const cache = { '/a': { kb: 1024, measured_at: '2026-11-08T01:00:00.000Z' }, '/c': { kb: 2048, measured_at: '2026-11-08T02:00:00.000Z' } };
      const s = worktreeSummary(scan, cache);
      expect(s).toMatchObject({ repos: 2, total: 4, non_worktree_folders: ['/x'], sizes_measured_at: '2026-11-08T02:00:00.000Z' });
      expect(s.by_stage[0]).toEqual({ stage: 'done', count: 2, sized: 1, size_kb: 1024 });
      expect(s.by_stage.find(g => g.stage === 'no ticket')).toMatchObject({ sized: 0, size_kb: null });
      expect(worktreeSummary(scan, {}).sizes_measured_at).toBeNull();
    });

    test('formatKb', () => {
      expect(formatKb(512 * 1024)).toBe('512 MB');
      expect(formatKb(3 * 1024 * 1024)).toBe('3.0 GB');
    });
  });
});
