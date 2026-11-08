import fs from 'fs';
import path from 'path';
import { createTicket, moveTicket, updateTicket } from '../../../lib/tickets.js';
import {
  claimShipLane, releaseShipLane, readShipLane, shipLaneFile, readyBatch, shipBoardTickets,
  shipLanesView, renderClaim, renderRelease,
} from '../../../lib/conductor/ship-lane.js';
import { classifySessions } from '../../../lib/conductor/sessions.js';
import { makeStudio } from './helpers.js';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const sid = (id) => `${id}-0000-4000-8000-000000000000`;
const bg = (id, name, state, extra = {}) => ({ id, sessionId: sid(id), name, cwd: '/studio', kind: 'background', startedAt: 1, state, pid: 7, ...extra });

describe('conductor ship lane', () => {
  let root;
  let hookDir;
  let config;
  let agents;
  const run = (cmd, args) => {
    if (cmd === 'claude' && args.join(' ') === 'agents --json --all') return JSON.stringify(agents);
    throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
  };
  const ticketsDir = (project) => path.join(root, '.bobby', project, 'tickets');
  const make = (project, prefix, title, { stage = 'shipping', repos = ['api'], blocked = false } = {}) => {
    const { id } = createTicket(ticketsDir(project), { prefix, title, repos });
    if (stage !== 'backlog') moveTicket(ticketsDir(project), id, stage, 'test');
    if (blocked) updateTicket(ticketsDir(project), id, { blocked: true, blocked_reason: 'x' });
    return id;
  };
  const setQueue = (ids) => fs.writeFileSync(path.join(root, '.bobby', 'conductor-queue.yml'), ids.length ? `queue:\n${ids.map(i => `  - ${i}`).join('\n')}\n` : 'queue: []\n');
  const claim = (repo, who, opts = {}) => claimShipLane({ studioRoot: root, config, repo, session: who, run, now: NOW, env: {}, ...opts });
  const release = (repo, who, opts = {}) => releaseShipLane({ studioRoot: root, config, repo, session: who, run, now: NOW, env: {}, ...opts });

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    config = { projects: ['alpha', 'beta'], hook_state_dir: hookDir };
    agents = [bg('aaaa1111', 'lane a', 'working'), bg('bbbb2222', 'lane b', 'working'), bg('cccc3333', 'lane c', 'done')];
    setQueue([]);
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  describe('batch', () => {
    test('is exactly the shipping, unblocked tickets listing the repo: queued first in queue order, then board order', () => {
      const a1 = make('alpha', 'AL', 'one');
      const a2 = make('alpha', 'AL', 'two');
      const a3 = make('alpha', 'AL', 'three');
      const b1 = make('beta', 'BE', 'four');
      make('alpha', 'AL', 'other repo', { repos: ['ui'] });
      make('alpha', 'AL', 'not shipping yet', { stage: 'testing' });
      make('alpha', 'AL', 'blocked', { blocked: true });
      make('beta', 'BE', 'two repos', { repos: ['ui', 'api'] });
      setQueue([b1, a3]);
      const out = claim('api', 'lane a');
      expect(out.batch.map(t => t.id)).toEqual([b1, a3, a1, a2, 'BE-002']);
      expect(out.batch[0]).toMatchObject({ position: 1, project: 'beta', hint: `BOBBY_PROJECT=beta bobby run ship ${b1}` });
      expect(out.batch[2].position).toBeNull();
      expect(readyBatch('ui', shipBoardTickets(root, config.projects), []).map(t => t.title)).toEqual(['other repo', 'two repos']);
    });

    test('an empty batch still claims and says so', () => {
      make('alpha', 'AL', 'x', { repos: ['ui'] });
      make('alpha', 'AL', 'y', { repos: ['api'], stage: 'building' });
      const out = claim('api', 'lane a');
      expect(out.batch).toEqual([]);
      expect(renderClaim(out)).toMatch(/Batch: none ready/);
    });

    test('a missing queue file is an error', () => {
      make('alpha', 'AL', 'x');
      fs.rmSync(path.join(root, '.bobby', 'conductor-queue.yml'));
      expect(() => claim('api', 'lane a')).toThrow(/conductor-queue\.yml does not exist/);
      // the failed claim must not have taken the lane
      expect(fs.existsSync(path.join(root, '.bobby', 'conductor', 'ship-api.yml'))).toBe(false);
    });

    test('unqueued tickets ship in board order by ticket number, not directory order', () => {
      const t = (id, project) => ({ id, project, title: id, stage: 'shipping', blocked: false, repos: ['api'] });
      // directory order puts RF-1005 before RF-999; boards stay in their listed order
      const tickets = [t('RF-1005', 'alpha'), t('RF-999', 'alpha'), t('BE-002', 'beta'), t('BE-1000', 'beta')];
      expect(readyBatch('api', tickets, []).map(x => x.id)).toEqual(['RF-999', 'RF-1005', 'BE-002', 'BE-1000']);
    });
  });

  describe('claim', () => {
    beforeEach(() => { make('alpha', 'AL', 'x'); make('alpha', 'AL', 'y', { repos: ['ui'] }); });

    test('writes the lane file with holder and since; the batch is listed', () => {
      const out = claim('api', 'lane a');
      expect(out).toMatchObject({ repo: 'api', reclaimed: false, since: new Date(NOW).toISOString(), holder: { session_id: sid('aaaa1111'), name: 'lane a' } });
      expect(readShipLane(root, 'api')).toMatchObject({ holder_session_id: sid('aaaa1111'), holder_name: 'lane a', since: new Date(NOW).toISOString() });
      expect(renderClaim(out)).toMatch(/claimed by lane a[\s\S]*1\. AL-001/);
    });

    test('a second claim while the holder is working fails naming the holder and age, and changes nothing', () => {
      claim('api', 'lane a', { now: NOW - 90 * 60_000 });
      const before = fs.readFileSync(shipLaneFile(root, 'api'), 'utf8');
      expect(() => claim('api', 'lane b')).toThrow(/held by lane a \(aaaa1111-.*\) since .*\(1h ago\), working/);
      expect(fs.readFileSync(shipLaneFile(root, 'api'), 'utf8')).toBe(before);
    });

    test('a holder waiting on CC or a live terminal session still holds the lane', () => {
      claim('api', 'lane a');
      agents = [bg('aaaa1111', 'lane a', 'blocked'), bg('bbbb2222', 'lane b', 'working')];
      expect(() => claim('api', 'lane b')).toThrow(/waiting on CC/);
      agents = [{ sessionId: sid('aaaa1111'), kind: 'interactive', status: 'idle', pid: 3, name: 'lane a' }, bg('bbbb2222', 'lane b', 'working')];
      expect(() => claim('api', 'lane b')).toThrow(/terminal session, process alive/);
    });

    test.each([
      ['done', (list) => list.map(a => (a.id === 'aaaa1111' ? { ...a, state: 'done', pid: undefined } : a)), /stale lock held by lane a.*state done/],
      ['absent', (list) => list.filter(a => a.id !== 'aaaa1111'), /stale lock held by lane a.*not in `claude agents`/],
    ])('a stale lock (holder %s) is an explicit error naming the holder; the lane is not taken over', (_n, change, re) => {
      claim('api', 'lane a');
      const before = fs.readFileSync(shipLaneFile(root, 'api'), 'utf8');
      agents = change(agents);
      expect(() => claim('api', 'lane b')).toThrow(re);
      expect(() => claim('api', 'lane b')).toThrow(/ship release api --force/);
      expect(fs.readFileSync(shipLaneFile(root, 'api'), 'utf8')).toBe(before);
    });

    test('after a forced release the next claim works, and the lane file is overwritten, never deleted', () => {
      claim('api', 'lane a');
      agents = agents.filter(a => a.id !== 'aaaa1111');
      release('api', 'lane b', { force: true });
      expect(fs.existsSync(shipLaneFile(root, 'api'))).toBe(true);
      claim('api', 'lane b');
      expect(readShipLane(root, 'api').holder_session_id).toBe(sid('bbbb2222'));
    });

    test('the holder claiming again keeps its original since and gets the batch again', () => {
      claim('api', 'lane a', { now: NOW - 60_000 });
      const again = claim('api', 'lane a');
      expect(again).toMatchObject({ reclaimed: true, since: new Date(NOW - 60_000).toISOString() });
      expect(again.batch).toHaveLength(1);
    });

    test('different repos can be claimed at the same time', () => {
      claim('api', 'lane a');
      expect(claim('ui', 'lane b').holder.name).toBe('lane b');
      expect(readShipLane(root, 'api').holder_name).toBe('lane a');
    });

    test('an unknown repo is an error and writes nothing', () => {
      expect(() => claim('nope', 'lane a')).toThrow(/Unknown repo "nope".*Known repos: api, ui/);
      expect(() => claim('../x', 'lane a')).toThrow(/Unknown repo|not a repo name/);
      expect(fs.existsSync(path.join(root, '.bobby', 'conductor'))).toBe(false);
    });

    test('the claiming session comes from --session or CLAUDE_CODE_SESSION_ID; neither is an error', () => {
      expect(claim('api', null, { env: { CLAUDE_CODE_SESSION_ID: sid('bbbb2222') } }).holder.name).toBe('lane b');
      expect(() => claim('ui', null)).toThrow(/pass --session/);
      expect(() => claim('ui', 'no such session')).toThrow(/No session matches/);
    });

    test('a malformed lane file is an error, never "free"', () => {
      fs.mkdirSync(path.join(root, '.bobby', 'conductor'), { recursive: true });
      fs.writeFileSync(shipLaneFile(root, 'api'), 'repo: api\nholder_session_id: 7\n');
      expect(() => claim('api', 'lane a')).toThrow(/holder_session_id/);
    });

    test('claims never run anything but the read probe', () => {
      const calls = [];
      claim('api', 'lane a', { run: (cmd, args) => { calls.push([cmd, ...args]); return run(cmd, args); } });
      expect(calls).toEqual([['claude', 'agents', '--json', '--all']]);
    });
  });

  describe('release', () => {
    beforeEach(() => { make('alpha', 'AL', 'x'); claim('api', 'lane a'); });

    test('the holder releases; the file stays, with a free holder', () => {
      expect(release('api', 'lane a').kind).toBe('released');
      expect(readShipLane(root, 'api')).toMatchObject({ holder_session_id: null, released_by: 'lane a' });
      expect(release('api', 'lane a').kind).toBe('free');
      expect(renderRelease({ repo: 'api', kind: 'free' })).toMatch(/already free/);
    });

    test('a non-holder is refused and the lock is unchanged', () => {
      expect(() => release('api', 'lane b')).toThrow(/held by lane a.*not by lane b.*--force/);
      expect(readShipLane(root, 'api').holder_session_id).toBe(sid('aaaa1111'));
    });

    test('--force succeeds and reports what it overrode, live or stale', () => {
      const live = release('api', 'lane b', { force: true });
      expect(live).toMatchObject({ kind: 'forced', overrode: { holder_session_id: sid('aaaa1111'), holder_live: true } });
      expect(renderRelease(live)).toMatch(/overrode: held by lane a.*LIVE/);
      expect(readShipLane(root, 'api')).toMatchObject({ holder_session_id: null, released_by: 'lane b' });
      claim('api', 'lane a');
      agents = agents.filter(a => a.id !== 'aaaa1111');
      expect(renderRelease(release('api', null, { force: true }))).toMatch(/stale.*not in `claude agents`/);
    });

    test('an unknown repo is an error', () => {
      expect(() => release('nope', 'lane a')).toThrow(/Unknown repo/);
    });
  });

  describe('status rows', () => {
    test('lists held lanes (live and stale) and repos with a batch waiting; omits idle repos', () => {
      make('alpha', 'AL', 'x');
      make('alpha', 'AL', 'y', { repos: ['ui'] });
      make('alpha', 'AL', 'z', { repos: ['docs'], stage: 'building' });
      claim('api', 'lane a');
      const view = () => shipLanesView({
        studioRoot: root,
        sessions: classifySessions(agents, { hookStateDir: hookDir, now: NOW }),
        tickets: shipBoardTickets(root, config.projects),
        now: NOW + 5 * 60_000,
      });
      let rows = view();
      expect(rows.map(r => r.repo)).toEqual(['api', 'ui']);
      expect(rows[0]).toMatchObject({ batch: 1, holder: { name: 'lane a', live: true, age_ms: 5 * 60_000 } });
      expect(rows[1]).toEqual({ repo: 'ui', holder: null, batch: 1 });
      agents = agents.filter(a => a.id !== 'aaaa1111');
      rows = view();
      expect(rows[0].holder).toMatchObject({ live: false, why: 'not in `claude agents`' });
      fs.writeFileSync(shipLaneFile(root, 'ui'), 'repo: ui\nholder_session_id: 5\n');
      expect(view().find(r => r.repo === 'ui').error).toMatch(/holder_session_id/);
    });
  });
});
