import fs from 'fs';
import path from 'path';
import { loadConductorConfig } from '../../../lib/conductor/config.js';
import { loadQueue, readClaims, claimsFilePath, queueFilePath, pickNext, queueView, renderQueue, renderNext, runHint } from '../../../lib/conductor/queue.js';
import { makeStudio, writeConductorYml, validYml, seedTickets, vmStatText } from './helpers.js';
import { listTickets } from '../../../lib/tickets.js';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const MIN = 60_000;
const sid = (id) => `${id}-0000-4000-8000-000000000000`;
const bg = (id, name, state, extra = {}) => ({ id, sessionId: sid(id), name, cwd: '/studio', kind: 'background', startedAt: 1, state, pid: 99, ...extra });

function mockRun({ agents = [], freeMb = 9000, agentsFail = false } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'claude' && args.join(' ') === 'agents --json --all') {
      if (agentsFail) throw new Error('`claude agents --json --all` failed: down');
      return JSON.stringify(agents);
    }
    if (cmd === 'vm_stat') return vmStatText({ freeMb, specMb: 0, purgeMb: 0, inactiveMb: 0, fileMb: 0 });
    if (cmd === 'sysctl') return '51539607552';
    throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
  };
  return { run, calls };
}

describe('conductor queue and next', () => {
  let root;
  let hookDir;
  let config;
  let ids;
  const idOf = (title) => ids[title];
  const writeQueue = (list) => fs.writeFileSync(queueFilePath(root), list.length ? `queue:\n${list.map(i => `  - ${i}`).join('\n')}\n` : 'queue: []\n');
  const next = (opts = {}) => {
    const { agents, freeMb, agentsFail, ...rest } = opts;
    const m = mockRun({ agents, freeMb, agentsFail });
    return { ...m, result: () => pickNext({ studioRoot: root, config, run: m.run, now: NOW, ...rest }) };
  };

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    writeConductorYml(root, validYml(hookDir));
    config = loadConductorConfig(root);
    seedTickets(root, 'alpha', [
      { title: 'planning one', stage: 'planning' },
      { title: 'building one', stage: 'building' },
      { title: 'shipping one', stage: 'shipping' },
      { title: 'done one', stage: 'done' },
    ]);
    seedTickets(root, 'beta', [{ title: 'testing one', stage: 'testing' }, { title: 'building two', stage: 'building' }]);
    ids = {};
    for (const p of ['alpha', 'beta']) {
      for (const t of listTickets(path.join(root, '.bobby', p, 'tickets'))) ids[t.title] = t.id;
    }
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  describe('the queue file', () => {
    test('a missing file is an error naming the file, no built-in list', () => {
      expect(() => loadQueue(root)).toThrow(/conductor-queue\.yml does not exist/);
    });

    test('an empty list is a valid queue', () => {
      fs.writeFileSync(queueFilePath(root), '# ranked, top first\nqueue: []\n');
      expect(loadQueue(root)).toEqual([]);
    });

    test.each([
      ['no queue key', 'other: []\n'],
      ['queue not a list', 'queue: AL-1\n'],
      ['not an id', 'queue:\n  - nonsense\n'],
      ['a duplicate', 'queue:\n  - AL-1\n  - al-1\n'],
      ['bad yaml', 'queue: [\n'],
    ])('%s is an error', (_n, text) => {
      fs.writeFileSync(queueFilePath(root), text);
      expect(() => loadQueue(root)).toThrow(/conductor-queue\.yml/);
    });
  });

  describe('next', () => {
    test('an empty queue prints "queue empty" and does not touch sessions or claims', () => {
      writeQueue([]);
      const n = next();
      const r = n.result();
      expect(r).toEqual({ kind: 'empty' });
      expect(renderNext(r)).toBe('queue empty');
      expect(fs.existsSync(claimsFilePath(root))).toBe(false);
    });

    test('a missing queue file is an error', () => {
      expect(() => next().result()).toThrow(/does not exist/);
    });

    test('an ID on no board is an error, no fallback', () => {
      writeQueue(['ZZ-9']);
      expect(() => next().result()).toThrow(/ZZ-9, which is not on any conductor board/);
    });

    test('refuses with the count and the cap when live lanes reach wip.max_lanes', () => {
      writeQueue([idOf('shipping one')]);
      const agents = Array.from({ length: 6 }, (_, i) => bg(`a${i}`, `lane ${i}`, i % 2 ? 'blocked' : 'working'));
      const r = next({ agents }).result();
      expect(r.kind).toBe('refused');
      expect(r.reason).toBe('6 live lane session(s) (working or waiting on CC) >= wip.max_lanes 6');
      expect(fs.existsSync(claimsFilePath(root))).toBe(false);
    });

    test('five live lanes are under the cap; done, stopped, interactive and unknown sessions do not count', () => {
      writeQueue([idOf('shipping one')]);
      const agents = [
        ...Array.from({ length: 5 }, (_, i) => bg(`a${i}`, `lane ${i}`, 'working')),
        bg('d1', 'finished', 'done'),
        bg('d2', 'gone', 'done', { pid: undefined }),
        bg('b2', 'dead blocked', 'blocked', { pid: undefined }),
        bg('u1', 'odd', 'failed'),
        { sessionId: sid('i1'), name: 'bobby-code-studio-61', cwd: '/studio', kind: 'interactive', pid: 7 },
      ];
      expect(next({ agents }).result().kind).toBe('picked');
    });

    test('refuses with the governor reason when free RAM is under the floor', () => {
      writeQueue([idOf('shipping one')]);
      const r = next({ freeMb: 100 }).result();
      expect(r.kind).toBe('refused');
      expect(r.reason).toMatch(/free RAM 100 MB < min 4096 MB/);
    });

    test('a failing session read is an error, not an empty answer', () => {
      writeQueue([idOf('shipping one')]);
      expect(() => next({ agentsFail: true }).result()).toThrow(/claude agents --json --all/);
    });

    test('finish-first: the shipping ticket wins even when it ranks last, across projects', () => {
      writeQueue([idOf('planning one'), idOf('building one'), idOf('testing one'), idOf('shipping one')]);
      const r = next().result();
      expect(r.kind).toBe('picked');
      expect(r.ticket).toEqual({ id: idOf('shipping one'), project: 'alpha', stage: 'shipping', position: 4 });
      expect(r.hint).toBe(`BOBBY_PROJECT=alpha bobby run ship ${idOf('shipping one')}`);
    });

    test('order is shipping > testing > reviewing > building > planning', () => {
      writeQueue([idOf('planning one'), idOf('building one'), idOf('testing one')]);
      const seen = [];
      for (let i = 0; i < 3; i += 1) seen.push(next().result().ticket.stage);
      expect(seen).toEqual(['testing', 'building', 'planning']);
    });

    test('ties break by queue order', () => {
      writeQueue([idOf('building two'), idOf('building one')]);
      expect(next().result().ticket.id).toBe(idOf('building two'));
    });

    test('two calls in a row return different tickets; a claim past the TTL is ignored', () => {
      writeQueue([idOf('shipping one'), idOf('testing one')]);
      const first = next({ lane: 'lane 1' }).result();
      const second = next({ lane: 'lane 2' }).result();
      expect(first.ticket.id).toBe(idOf('shipping one'));
      expect(second.ticket.id).toBe(idOf('testing one'));
      const third = next().result();
      expect(third.kind).toBe('none');
      expect(third.skipped.map(s => s.why)).toEqual([
        'claimed by lane 1 within 30 min',
        'claimed by lane 2 within 30 min',
      ]);
      const later = pickNext({ studioRoot: root, config, run: mockRun().run, now: NOW + 31 * MIN });
      expect(later.ticket.id).toBe(idOf('shipping one'));
    });

    test('claims keep every entry when the file is rewritten', () => {
      writeQueue([idOf('shipping one'), idOf('testing one')]);
      next({ lane: 'a' }).result();
      next({ lane: 'b' }).result();
      expect(Object.keys(readClaims(root)).sort()).toEqual([idOf('shipping one'), idOf('testing one')].sort());
      expect(readClaims(root)[idOf('testing one')]).toEqual({ claimed_at: new Date(NOW).toISOString(), lane: 'b' });
    });

    test('a ticket a live lane already holds is skipped; a done lane does not hold it', () => {
      writeQueue([idOf('shipping one'), idOf('testing one')]);
      const agents = [bg('a1', `lane for ${idOf('shipping one')}`, 'working'), bg('a2', `${idOf('testing one')} old`, 'done')];
      const r = next({ agents }).result();
      expect(r.ticket.id).toBe(idOf('testing one'));
      expect(r.skipped).toEqual([{ id: idOf('shipping one'), why: 'a lane already holds it (working)' }]);
    });

    test('done and blocked tickets are never picked', () => {
      seedTickets(root, 'alpha', [{ title: 'flagged', stage: 'shipping', blocked: true }]);
      const flagged = listTickets(path.join(root, '.bobby', 'alpha', 'tickets')).find(t => t.title === 'flagged').id;
      writeQueue([idOf('done one'), flagged, idOf('planning one')]);
      const r = next().result();
      expect(r.ticket.id).toBe(idOf('planning one'));
      expect(r.skipped).toEqual([{ id: idOf('done one'), why: 'done' }, { id: flagged, why: 'blocked' }]);
    });

    test('nothing pullable is reported with reasons, not an error', () => {
      writeQueue([idOf('done one')]);
      const r = next().result();
      expect(r.kind).toBe('none');
      expect(renderNext(r)).toMatch(/nothing to pull[\s\S]*done$/);
    });

    test('a queue is matched to the board case-insensitively and ignores zero padding', () => {
      writeQueue([idOf('shipping one').toLowerCase()]);
      expect(next().result().ticket.id).toBe(idOf('shipping one'));
    });
  });

  describe('queue', () => {
    test('prints each ranked ticket with its stage and whether a lane holds it', () => {
      writeQueue([idOf('shipping one'), idOf('planning one')]);
      next({ lane: 'x' }).result(); // claims shipping one
      const agents = [bg('a1', `${idOf('planning one')} planning lane`, 'blocked')];
      const rows = queueView({ studioRoot: root, config, run: mockRun({ agents }).run, now: NOW });
      expect(rows).toEqual([
        { position: 1, id: idOf('shipping one'), project: 'alpha', stage: 'shipping', blocked: false, lane: 'none', claimed: true },
        { position: 2, id: idOf('planning one'), project: 'alpha', stage: 'planning', blocked: false, lane: 'waiting_on_cc', claimed: false },
      ]);
      expect(renderQueue(rows)).toBe([
        `   1. ${idOf('shipping one')}  shipping  (no lane, claimed)`,
        `   2. ${idOf('planning one')}  planning  (lane waiting_on_cc)`,
      ].join('\n'));
    });

    test('an empty queue prints "queue empty"', () => {
      expect(renderQueue([])).toBe('queue empty');
    });
  });

  test('stages without an agent of their own are run by `bobby run next`', () => {
    expect(runHint('alpha', 'AL-1', 'design-research')).toBe('BOBBY_PROJECT=alpha bobby run next AL-1');
    expect(runHint('alpha', 'AL-1', 'backlog')).toBe('BOBBY_PROJECT=alpha bobby run plan AL-1');
  });
});
