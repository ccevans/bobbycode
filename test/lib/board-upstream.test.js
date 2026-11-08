// test/lib/board-upstream.test.js
// TKT-083: local bare repo as origin, two clones. No network.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  boardUpstream, upstreamHighestId, assertBoardCurrent, boardFreshness,
} from '../../lib/board-upstream.js';
import { nextId } from '../../lib/counter.js';

const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function makeBoardRepos(root) {
  const origin = path.join(root, 'origin.git');
  const A = path.join(root, 'A');
  g(root, 'init', '-q', '--bare', origin);
  fs.mkdirSync(path.join(A, '.bobby', 'tickets'), { recursive: true });
  g(A, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(A, '.bobbyrc.yml'), 'ticket_prefix: TKT\n');
  fs.writeFileSync(path.join(A, '.bobby', 'tickets', '.counter'), '0');
  g(A, 'add', '-A');
  g(A, 'commit', '-qm', 'init');
  g(A, 'remote', 'add', 'origin', origin);
  g(A, 'push', '-q', '-u', 'origin', 'main');
  const B = path.join(root, 'B');
  g(root, 'clone', '-q', origin, B);
  return { origin, A, B };
}

function pushTicket(B, name) {
  const dir = path.join(B, '.bobby', 'tickets', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ticket.md'), '---\nid: x\n---\n');
  g(B, 'add', '-A');
  g(B, 'commit', '-qm', `add ${name}`);
  g(B, 'push', '-q');
}

describe('board-upstream', () => {
  let root, origin, A, B, ticketsA;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-bu-'));
    ({ origin, A, B } = makeBoardRepos(root));
    ticketsA = path.join(A, '.bobby', 'tickets');
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('nextId floors on the highest ID in the fetched upstream tree, with no network', () => {
    pushTicket(B, 'TKT-005--x');
    g(A, 'fetch', '-q', 'origin');
    // Break the remote: nextId must not fetch.
    g(A, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
    expect(nextId(ticketsA, 'TKT', 'y').id).toBe('TKT-006');
  });

  test('boardUpstream is null for a repo with no upstream and for a non-git dir', () => {
    const solo = path.join(root, 'solo');
    fs.mkdirSync(path.join(solo, '.bobby', 'tickets'), { recursive: true });
    expect(boardUpstream(path.join(solo, '.bobby', 'tickets'))).toBeNull();
    g(solo, 'init', '-q', '-b', 'main');
    expect(boardUpstream(path.join(solo, '.bobby', 'tickets'))).toBeNull();
    expect(upstreamHighestId(path.join(solo, '.bobby', 'tickets'), 'TKT')).toBe(0);
    expect(() => assertBoardCurrent(path.join(solo, '.bobby', 'tickets'))).not.toThrow();
    expect(boardFreshness(path.join(solo, '.bobby', 'tickets'))).toEqual({ state: 'none' });
  });

  test('assertBoardCurrent refuses with count, branch and pull command when behind', () => {
    pushTicket(B, 'TKT-001--x');
    expect(() => assertBoardCurrent(ticketsA)).toThrow(/1 commit behind origin\/main.*git -C .*pull --rebase origin main/s);
    expect(boardFreshness(ticketsA)).toEqual({ state: 'behind', count: 1, label: 'origin/main' });
  });

  test('assertBoardCurrent passes once pulled, and boardFreshness reports current', () => {
    pushTicket(B, 'TKT-001--x');
    g(A, 'pull', '-q');
    expect(() => assertBoardCurrent(ticketsA)).not.toThrow();
    expect(boardFreshness(ticketsA)).toEqual({ state: 'current' });
  });

  test('a fetch failure names the remote and URL; boardFreshness reports unknown', () => {
    g(A, 'remote', 'set-url', 'origin', '/does/not/exist.git');
    expect(() => assertBoardCurrent(ticketsA)).toThrow(/Could not fetch origin \(\/does\/not\/exist\.git\)/);
    const f = boardFreshness(ticketsA);
    expect(f.state).toBe('unknown');
    expect(f.reason).toMatch(/Could not fetch origin/);
  });

  test('upstream commits that touch only code do not count as behind', () => {
    fs.mkdirSync(path.join(B, 'src'));
    fs.writeFileSync(path.join(B, 'src', 'index.js'), '1');
    g(B, 'add', '-A'); g(B, 'commit', '-qm', 'code'); g(B, 'push', '-q');
    expect(() => assertBoardCurrent(ticketsA)).not.toThrow();
  });

  test('an upstream branch that is not on the remote yet means nothing to be behind', () => {
    g(A, 'checkout', '-q', '-b', 'feat');
    g(A, 'config', 'branch.feat.remote', 'origin');
    g(A, 'config', 'branch.feat.merge', 'refs/heads/feat');
    expect(() => assertBoardCurrent(ticketsA)).not.toThrow();
    expect(upstreamHighestId(ticketsA, 'TKT')).toBe(0);
    expect(boardFreshness(ticketsA)).toEqual({ state: 'current' });
  });

  test('an upstream branch deleted on the remote is an explicit error and keeps the tracking ref', () => {
    g(A, 'checkout', '-q', '-b', 'feat');
    fs.mkdirSync(path.join(ticketsA, 'TKT-005--x'));
    fs.writeFileSync(path.join(ticketsA, 'TKT-005--x', 'ticket.md'), '---\nid: x\n---\n');
    g(A, 'add', '-A'); g(A, 'commit', '-qm', 'ticket');
    g(A, 'push', '-q', '-u', 'origin', 'feat');
    // delete on the remote itself: A's own `push --delete` would also drop A's tracking ref
    g(origin, 'branch', '-D', 'feat');
    expect(g(A, 'rev-parse', '--verify', 'refs/remotes/origin/feat').trim()).toBeTruthy();
    expect(() => assertBoardCurrent(ticketsA)).toThrow(/origin\/feat no longer exists on origin.*merged into.*git branch -u origin\/<branch> && git pull --rebase/s);
    const f = boardFreshness(ticketsA);
    expect(f.state).toBe('unknown');
    expect(f.reason).toMatch(/no longer exists on origin/);
    expect(g(A, 'rev-parse', '--verify', 'refs/remotes/origin/feat').trim()).toBeTruthy();
  });

  test('a local upstream branch (remote ".") is compared without a fetch', () => {
    g(A, 'checkout', '-q', '-b', 'topic');
    g(A, 'config', 'branch.topic.remote', '.');
    g(A, 'config', 'branch.topic.merge', 'refs/heads/main');
    g(A, 'checkout', '-q', 'main');
    pushTicket(A, 'TKT-001--x'); // main moves ahead; topic is behind it
    g(A, 'checkout', '-q', 'topic');
    expect(() => assertBoardCurrent(ticketsA)).toThrow(/1 commit behind main.*rebase main/s);
  });

  test('a studio board only counts commits under its own project directory', () => {
    const studio = path.join(root, 'studio');
    const so = path.join(root, 'studio-origin.git');
    g(root, 'init', '-q', '--bare', so);
    fs.mkdirSync(path.join(studio, '.bobby', 'app', 'tickets'), { recursive: true });
    fs.mkdirSync(path.join(studio, '.bobby', 'other', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(studio, '.bobby', 'app', 'tickets', '.counter'), '0');
    fs.writeFileSync(path.join(studio, '.bobby', 'other', 'tickets', '.counter'), '0');
    g(studio, 'init', '-q', '-b', 'main');
    g(studio, 'add', '-A'); g(studio, 'commit', '-qm', 'init');
    g(studio, 'remote', 'add', 'origin', so); g(studio, 'push', '-q', '-u', 'origin', 'main');
    const peer = path.join(root, 'peer');
    g(root, 'clone', '-q', so, peer);
    fs.mkdirSync(path.join(peer, '.bobby', 'other', 'tickets', 'OT-009--z'));
    fs.writeFileSync(path.join(peer, '.bobby', 'other', 'tickets', 'OT-009--z', 'ticket.md'), 'x');
    g(peer, 'add', '-A'); g(peer, 'commit', '-qm', 'other'); g(peer, 'push', '-q');
    const appTickets = path.join(studio, '.bobby', 'app', 'tickets');
    expect(() => assertBoardCurrent(appTickets)).not.toThrow();
    expect(() => assertBoardCurrent(path.join(studio, '.bobby', 'other', 'tickets'))).toThrow(/1 commit behind origin\/main/);
    // The floor is per-prefix and per-board: app sees nothing from other/
    expect(upstreamHighestId(appTickets, 'OT')).toBe(0);
  });
});
