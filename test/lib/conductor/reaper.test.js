import fs from 'fs';
import path from 'path';
import os from 'os';
import { reap, evaluateSessions, renderReap } from '../../../lib/conductor/reaper.js';
import { assertM4Host } from '../../../lib/conductor/host.js';
import { classifySessions } from '../../../lib/conductor/sessions.js';

const sid = (id) => `${id}-0000-4000-8000-000000000000`;
const bg = (id, state, extra = {}) => ({ id, sessionId: sid(id), name: `lane ${id}`, cwd: '/studio', kind: 'background', startedAt: 1, state, pid: 4242, ...extra });

/**
 * Mock exec. `agents` is the list `claude agents` returns; a function value is
 * called with the number of reads so far, so a test can change state between reads.
 */
function mockRun(agents, { failStop = [] } = {}) {
  const calls = [];
  let reads = 0;
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'claude' && args.join(' ') === 'agents --json --all') {
      reads += 1;
      return JSON.stringify(typeof agents === 'function' ? agents(reads) : agents);
    }
    if (cmd === 'claude' && args[0] === 'stop') {
      if (failStop.includes(args[1])) throw new Error(`\`claude stop ${args[1]}\` failed: boom`);
      return '';
    }
    throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
  };
  return { run, calls, stops: () => calls.filter(c => c[1] === 'stop') };
}

describe('conductor reaper', () => {
  let hookDir;
  beforeEach(() => { hookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-reap-')); });
  afterEach(() => { fs.rmSync(hookDir, { recursive: true, force: true }); });
  const marker = (id, successor) => fs.writeFileSync(path.join(hookDir, `${sid(id)}.handoff`), `"lane" (bg ${successor}, claude-opus-5-5) from /x/handoff.md\n`);
  const doReap = (agents, opts = {}, mockOpts) => {
    const m = mockRun(agents, mockOpts);
    const report = reap({ hookStateDir: hookDir, run: m.run, now: 10, ...opts });
    return { m, report };
  };

  test('dry run lists candidates and calls claude stop zero times', () => {
    const { m, report } = doReap([bg('aaaa1111', 'done'), bg('bbbb2222', 'working')]);
    expect(report.candidates.map(c => c.id)).toEqual(['aaaa1111']);
    expect(m.stops()).toEqual([]);
    expect(report.results).toEqual([]);
    const text = renderReap(report, { apply: false });
    expect(text).toMatch(/Dry run: 1 session/);
    expect(text).toContain('aaaa1111');
    expect(text).toContain('lane aaaa1111');
  });

  test('a done session with no live pid is already stopped: not a candidate, not stopped, kept with the reason', () => {
    const noPid = bg('aaaa1111', 'done'); delete noPid.pid;
    const nullPid = bg('bbbb2222', 'done', { pid: null });
    const zeroPid = bg('cccc3333', 'done', { pid: 0 });
    const live = bg('dddd4444', 'done');
    const { m, report } = doReap([noPid, nullPid, zeroPid, live], { apply: true });
    expect(report.candidates.map(c => c.id)).toEqual(['dddd4444']);
    expect(m.stops().map(c => c[2])).toEqual(['dddd4444']);
    expect(report.kept.map(k => [k.id, k.why])).toEqual([
      ['aaaa1111', 'already stopped (no live pid)'], ['bbbb2222', 'already stopped (no live pid)'], ['cccc3333', 'already stopped (no live pid)'],
    ]);
  });

  test('a stopped session with a handoff marker is not an orphan either: nothing to end, nothing to tell CC', () => {
    marker('aaaa1111', 'ffff9999');
    const noPid = bg('aaaa1111', 'done'); delete noPid.pid;
    const { report } = doReap([noPid]);
    expect(report.orphaned).toEqual([]);
    expect(report.candidates).toEqual([]);
  });

  test('a session that stops between the snapshot and the stop (pid gone) is skipped', () => {
    const { m, report } = doReap(reads => [reads === 1 ? bg('aaaa1111', 'done') : bg('aaaa1111', 'done', { pid: null })], { apply: true });
    expect(m.stops()).toEqual([]);
    expect(report.results).toEqual([expect.objectContaining({ id: 'aaaa1111', outcome: 'skipped' })]);
  });

  test('a blocked session is never a candidate, even with a handoff marker and a live successor', () => {
    marker('bbbb2222', 'cccc3333');
    const { m, report } = doReap([bg('bbbb2222', 'blocked'), bg('cccc3333', 'working')], { apply: true });
    expect(report.candidates).toEqual([]);
    expect(m.stops()).toEqual([]);
  });

  test('working, unknown and stopped states are never candidates', () => {
    const { m, report } = doReap([bg('aaaa1111', 'working'), bg('bbbb2222', 'stopped'), bg('cccc3333', undefined)], { apply: true });
    expect(report.candidates).toEqual([]);
    expect(m.stops()).toEqual([]);
  });

  test('a done session with a live successor is a candidate and the reason names the successor', () => {
    marker('aaaa1111', 'bbbb2222');
    const { report } = doReap([bg('aaaa1111', 'done'), bg('bbbb2222', 'working')]);
    expect(report.candidates).toEqual([expect.objectContaining({ id: 'aaaa1111', reason: 'done, handed off to bbbb2222 (live)' })]);
  });

  test('a marker whose successor is not live is kept and listed as an orphaned handoff', () => {
    marker('aaaa1111', 'ffff9999'); // no such session
    marker('bbbb2222', 'cccc3333'); // successor is done, not live
    const { m, report } = doReap([bg('aaaa1111', 'done'), bg('bbbb2222', 'done'), bg('cccc3333', 'done')], { apply: true });
    expect(report.orphaned.map(o => o.id)).toEqual(['aaaa1111', 'bbbb2222']);
    expect(report.candidates.map(c => c.id)).toEqual(['cccc3333']);
    expect(m.stops()).toEqual([['claude', 'stop', 'cccc3333']]);
    expect(renderReap(report, { apply: true })).toMatch(/Orphaned handoff \(2\)/);
  });

  test('a marker with no successor id is an orphaned handoff', () => {
    fs.writeFileSync(path.join(hookDir, `${sid('aaaa1111')}.handoff`), 'handing off, no spawn\n');
    const { report } = doReap([bg('aaaa1111', 'done')]);
    expect(report.candidates).toEqual([]);
    expect(report.orphaned[0].why).toBe('marker names no successor');
  });

  test('a session that turns blocked between the snapshot and the stop is skipped', () => {
    const { m, report } = doReap(
      (reads) => [bg('aaaa1111', 'done'), bg('bbbb2222', reads >= 3 ? 'blocked' : 'done')],
      { apply: true },
    );
    expect(m.stops()).toEqual([['claude', 'stop', 'aaaa1111']]);
    expect(report.results.map(r => [r.id, r.outcome, r.detail])).toEqual([
      ['aaaa1111', 'stopped', undefined],
      ['bbbb2222', 'skipped', 'state is now blocked'],
    ]);
    expect(report.failed).toBe(0);
  });

  test('a session that turns working or disappears before the stop is skipped', () => {
    const working = doReap((reads) => [bg('aaaa1111', reads >= 2 ? 'working' : 'done')], { apply: true });
    expect(working.m.stops()).toEqual([]);
    expect(working.report.results[0]).toEqual(expect.objectContaining({ outcome: 'skipped', detail: 'state is now working' }));
    const gone = doReap((reads) => (reads >= 2 ? [] : [bg('aaaa1111', 'done')]), { apply: true });
    expect(gone.m.stops()).toEqual([]);
    expect(gone.report.results[0].detail).toBe('no longer listed');
  });

  test('a successor that dies before the stop makes the handed-off session an orphan, so it is skipped', () => {
    marker('aaaa1111', 'bbbb2222');
    const { m, report } = doReap((reads) => [bg('aaaa1111', 'done'), bg('bbbb2222', reads >= 2 ? 'done' : 'working')], { apply: true });
    expect(m.stops()).toEqual([]);
    expect(report.results[0].outcome).toBe('skipped');
  });

  test('the session running the command is never stopped, by sessionId or short id', () => {
    const list = [bg('aaaa1111', 'done'), bg('bbbb2222', 'done')];
    const bySession = doReap(list, { apply: true, selfSessionId: sid('aaaa1111') });
    expect(bySession.m.stops()).toEqual([['claude', 'stop', 'bbbb2222']]);
    const byId = doReap(list, { apply: true, selfSessionId: 'bbbb2222' });
    expect(byId.m.stops()).toEqual([['claude', 'stop', 'aaaa1111']]);
  });

  test('interactive sessions are never stopped', () => {
    const interactive = { sessionId: sid('eeee5555'), name: 'me', kind: 'interactive', state: 'done' };
    const { m, report } = doReap([interactive, { ...bg('ffff6666', 'done'), kind: 'interactive' }], { apply: true });
    expect(report.candidates).toEqual([]);
    expect(m.stops()).toEqual([]);
  });

  test('--apply stops each candidate exactly once with an args array', () => {
    const { m, report } = doReap([bg('aaaa1111', 'done'), bg('bbbb2222', 'done'), bg('cccc3333', 'working')], { apply: true });
    expect(m.stops()).toEqual([['claude', 'stop', 'aaaa1111'], ['claude', 'stop', 'bbbb2222']]);
    expect(report.results.every(r => r.outcome === 'stopped')).toBe(true);
    expect(renderReap(report, { apply: true })).toMatch(/ended {2}aaaa1111/);
  });

  test('a failing stop is reported, the rest are still tried, and failed counts it', () => {
    const { m, report } = doReap([bg('aaaa1111', 'done'), bg('bbbb2222', 'done')], { apply: true }, { failStop: ['aaaa1111'] });
    expect(m.stops().map(c => c[2])).toEqual(['aaaa1111', 'bbbb2222']);
    expect(report.failed).toBe(1);
    expect(report.results[0]).toEqual(expect.objectContaining({ outcome: 'failed', detail: expect.stringContaining('boom') }));
    expect(report.results[1].outcome).toBe('stopped');
  });

  test('a failed re-read does not stop blind', () => {
    let reads = 0;
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args]);
      if (args[0] === 'agents') {
        reads += 1;
        if (reads >= 2) throw new Error('claude is down');
        return JSON.stringify([bg('aaaa1111', 'done')]);
      }
      return '';
    };
    const report = reap({ hookStateDir: hookDir, run, apply: true });
    expect(calls.filter(c => c[1] === 'stop')).toEqual([]);
    expect(report.failed).toBe(1);
  });

  test('an id that could be read as a flag is refused', () => {
    const { m, report } = doReap([bg('--all', 'done')], { apply: true });
    expect(m.stops()).toEqual([]);
    expect(report.failed).toBe(1);
  });

  test('if `claude agents --json` fails, reap throws and stops nothing', () => {
    const calls = [];
    const run = (cmd, args) => { calls.push([cmd, ...args]); throw new Error('`claude agents --json --all` failed: nope'); };
    expect(() => reap({ hookStateDir: hookDir, run, apply: true })).toThrow(/nope/);
    expect(calls.filter(c => c[1] === 'stop')).toEqual([]);
  });

  test('the marker file is still there after a reap', () => {
    marker('aaaa1111', 'bbbb2222');
    doReap([bg('aaaa1111', 'done'), bg('bbbb2222', 'working')], { apply: true });
    expect(fs.existsSync(path.join(hookDir, `${sid('aaaa1111')}.handoff`))).toBe(true);
  });

  test('evaluateSessions is pure and groups the rest as kept', () => {
    const sessions = classifySessions([bg('aaaa1111', 'working'), bg('bbbb2222', 'done')], { hookStateDir: hookDir, now: 10 });
    const out = evaluateSessions(sessions);
    expect(out.candidates.map(c => c.id)).toEqual(['bbbb2222']);
    expect(out.kept).toEqual([expect.objectContaining({ id: 'aaaa1111', why: 'state working' })]);
  });
});

describe('conductor host check', () => {
  test('accepts an Apple M4 and refuses every other host', () => {
    expect(assertM4Host({ run: () => 'Apple M4 Max\n' })).toBe('Apple M4 Max');
    expect(() => assertM4Host({ run: () => 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz\n' })).toThrow(/M4 only.*Intel/);
    expect(() => assertM4Host({ run: () => 'Apple M3 Pro\n' })).toThrow(/M4 only/);
    expect(() => assertM4Host({ run: () => '' })).toThrow(/no CPU brand/);
  });

  test('a failing probe throws instead of passing', () => {
    expect(() => assertM4Host({ run: () => { throw new Error('sysctl failed'); } })).toThrow(/sysctl failed/);
  });
});
