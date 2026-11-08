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
    expect(g.unknown.map(s => [s.id, s.raw_state])).toEqual([['dddd4444', 'stopped'], [null, null]]);
  });

  test('an unrecognised state is never treated as done', () => {
    const g = groupSessions(classify([{ ...agentsFixture()[0], state: 'finished' }]));
    expect(g.done).toHaveLength(0);
    expect(g.unknown).toHaveLength(1);
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
