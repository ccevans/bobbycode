import fs from 'fs';
import path from 'path';
import { readAgents, classifySessions, groupSessions } from '../../../lib/conductor/sessions.js';
import { makeStudio, agentsFixture, NOW } from './helpers.js';

describe('conductor sessions', () => {
  let root;
  let hookDir;
  beforeEach(() => { ({ root, hookDir } = makeStudio()); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const classify = (raw = agentsFixture()) => classifySessions(raw, { hookStateDir: hookDir, now: NOW });

  test('readAgents calls claude with an argv array and parses the JSON', () => {
    const calls = [];
    const run = (cmd, args) => { calls.push([cmd, args]); return JSON.stringify(agentsFixture()); };
    expect(readAgents({ run })).toHaveLength(5);
    expect(calls).toEqual([['claude', ['agents', '--json', '--all']]]);
  });

  test('a failing command propagates', () => {
    const run = () => { throw new Error('claude exploded'); };
    expect(() => readAgents({ run })).toThrow('claude exploded');
  });

  test.each([['not json'], ['{"a":1}'], ['[{"id":"x"}]'], ['[{"sessionId":"x","id":7}]'], ['']])('bad output %j throws', (out) => {
    expect(() => readAgents({ run: () => out })).toThrow(/claude agents --json --all/);
  });

  test('classifies working / blocked / done and keeps everything else as unknown', () => {
    const g = groupSessions(classify());
    expect(g.working.map(s => s.id)).toEqual(['aaaa1111']);
    expect(g.waiting_on_cc.map(s => s.id)).toEqual(['bbbb2222']);
    expect(g.done.map(s => s.id)).toEqual(['cccc3333']);
    // dddd4444 is `stopped` but still carries a pid, so it stays visible as unknown
    expect(g.unknown.map(s => [s.id, s.raw_state])).toEqual([['dddd4444', 'stopped']]);
    expect(g.interactive.map(s => [s.id, s.raw_state])).toEqual([[null, null]]);
  });

  test('an unrecognised state is never treated as done', () => {
    const g = groupSessions(classify([{ ...agentsFixture()[0], state: 'finished' }]));
    expect(g.done).toHaveLength(0);
    expect(g.unknown).toHaveLength(1);
  });

  test('live means a positive integer pid; a done session without one is grouped as stopped, not done', () => {
    const raw = [
      { id: 'aaaa0001', sessionId: 'aaaa0001-x', kind: 'background', state: 'done', pid: 10 },
      { id: 'aaaa0002', sessionId: 'aaaa0002-x', kind: 'background', state: 'done' },
      { id: 'aaaa0003', sessionId: 'aaaa0003-x', kind: 'background', state: 'done', pid: null },
      { id: 'aaaa0004', sessionId: 'aaaa0004-x', kind: 'background', state: 'working', pid: 11 },
    ];
    const sessions = classifySessions(raw, { hookStateDir: hookDir, now: NOW });
    expect(sessions.map(s => s.live)).toEqual([true, false, false, true]);
    const g = groupSessions(sessions);
    expect(g.done.map(s => s.id)).toEqual(['aaaa0001']);
    expect(g.stopped.map(s => s.id)).toEqual(['aaaa0002', 'aaaa0003']);
    expect(g.working.map(s => s.id)).toEqual(['aaaa0004']);
  });

  test('stopped and failed background sessions with no pid are grouped as stopped; interactive sessions get their own group; the rest stays unknown', () => {
    const raw = [
      { id: 'aaaa0001', sessionId: 'aaaa0001-x', kind: 'background', state: 'stopped' },
      { id: 'aaaa0002', sessionId: 'aaaa0002-x', kind: 'background', state: 'failed' },
      { id: 'aaaa0003', sessionId: 'aaaa0003-x', kind: 'background', state: 'done' },
      { id: 'aaaa0004', sessionId: 'aaaa0004-x', kind: 'background', state: 'stopped', pid: 12 },
      { id: 'aaaa0005', sessionId: 'aaaa0005-x', kind: 'background', state: 'finished' },
      { id: 'aaaa0006', sessionId: 'aaaa0006-x', kind: 'background' },
      { sessionId: 'bbbb0001-x', kind: 'interactive', status: 'idle', pid: 20 },
      { sessionId: 'bbbb0002-x', kind: 'interactive', status: 'busy', pid: 21 },
      { sessionId: 'bbbb0003-x', kind: 'interactive', status: 'idle', state: 'odd', pid: 22 },
    ];
    const sessions = classifySessions(raw, { hookStateDir: hookDir, now: NOW });
    const g = groupSessions(sessions);
    expect(g.stopped.map(s => [s.id, s.raw_state])).toEqual([['aaaa0001', 'stopped'], ['aaaa0002', 'failed'], ['aaaa0003', 'done']]);
    expect(g.interactive.map(s => [s.session_id, s.status])).toEqual([['bbbb0001-x', 'idle'], ['bbbb0002-x', 'busy']]);
    // a stopped state that still has a live pid is odd: it stays visible as unknown, not hidden as stopped
    expect(g.unknown.map(s => s.id)).toEqual(['aaaa0004', 'aaaa0005', 'aaaa0006', null]);
    expect(g.unknown.at(-1).session_id).toBe('bbbb0003-x');
    // the classification the reapers read is unchanged: every one of these is still state "unknown"
    expect(sessions.filter(s => s.raw_state !== 'done').every(s => s.state === 'unknown')).toBe(true);
  });

  test('the successor id is read from `(bg <id>`, not from a session name that contains "bg <hex>"', () => {
    const raw = agentsFixture();
    fs.writeFileSync(path.join(hookDir, `${raw[2].sessionId}.handoff`),
      '"fix bg dddd4444 lane" (bg aaaa1111, claude-opus-5-5) from /x/handoff.md');
    expect(classify(raw).find(s => s.id === 'cccc3333')).toMatchObject({ successor: 'aaaa1111' });
    fs.writeFileSync(path.join(hookDir, `${raw[2].sessionId}.handoff`), '"fix bg dddd4444 lane" from /x/handoff.md');
    expect(classify(raw).find(s => s.id === 'cccc3333')).toMatchObject({ handed_off: true, successor: null });
  });

  test('age comes from startedAt and the injected clock; waitingFor is carried', () => {
    const s = classify().find(x => x.id === 'bbbb2222');
    expect(s.age_ms).toBe(5 * 3_600_000);
    expect(s.waiting_for).toBe('approve edit');
  });

  test('a handoff marker flags handed_off and a live successor', () => {
    const raw = agentsFixture();
    fs.writeFileSync(path.join(hookDir, `${raw[2].sessionId}.handoff`),
      '"lane three 2" (bg aaaa1111, claude-opus-5-5) from /x/handoff.md');
    const done = classify(raw).find(s => s.id === 'cccc3333');
    expect(done).toMatchObject({ handed_off: true, successor: 'aaaa1111', successor_live: true });
  });

  test('a successor that is done or absent is not live; a session without a marker is not handed off', () => {
    const raw = agentsFixture();
    fs.writeFileSync(path.join(hookDir, `${raw[0].sessionId}.handoff`), 'x (bg cccc3333) y');
    fs.writeFileSync(path.join(hookDir, `${raw[1].sessionId}.handoff`), 'x (bg ffff9999) y');
    fs.writeFileSync(path.join(hookDir, `${raw[3].sessionId}.handoff`), 'no successor here');
    const byId = Object.fromEntries(classify(raw).map(s => [s.id, s]));
    expect(byId.aaaa1111).toMatchObject({ handed_off: true, successor: 'cccc3333', successor_live: false });
    expect(byId.bbbb2222).toMatchObject({ handed_off: true, successor: 'ffff9999', successor_live: false });
    expect(byId.dddd4444).toMatchObject({ handed_off: true, successor: null, successor_live: false });
    expect(byId.cccc3333.handed_off).toBe(false);
  });

  test('a missing hook_state_dir throws', () => {
    expect(() => classifySessions(agentsFixture(), { hookStateDir: path.join(root, 'nope'), now: NOW }))
      .toThrow(/hook_state_dir .* is not a directory/);
  });
});
