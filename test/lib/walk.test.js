// test/lib/walk.test.js — an epic is done only after its acceptance walk passes.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { walkVerdict, assertWalkedBeforeDone, WALK_FILE } from '../../lib/walk.js';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-walk-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const epic = (extra = {}) => ({ path: dir, data: { id: 'RF-1', type: 'epic', ...extra } });
const write = (text) => fs.writeFileSync(path.join(dir, WALK_FILE), text);

describe('walkVerdict', () => {
  test('no walk.md means no verdict', () => {
    expect(walkVerdict(dir)).toBeNull();
  });
  test.each([
    ['Verdict: PASS\n...', 'pass'],
    ['# Walk\n**Verdict:** FAIL — pill overlaps header', 'fail'],
    ['- verdict: blocked (deploy not up)', 'blocked'],
  ])('%s', (text, want) => {
    write(text);
    expect(walkVerdict(dir)).toBe(want);
  });
});

describe('assertWalkedBeforeDone', () => {
  test('an epic with no walk cannot close, and the error says how to walk or skip', () => {
    expect(() => assertWalkedBeforeDone(epic())).toThrow(/bobby run walk RF-1.*--skip-walk/s);
  });
  test('a failed walk blocks too', () => {
    write('Verdict: FAIL');
    expect(() => assertWalkedBeforeDone(epic())).toThrow(/walk says FAIL/);
  });
  test('a passing walk lets it close', () => {
    write('Verdict: PASS');
    expect(() => assertWalkedBeforeDone(epic())).not.toThrow();
  });
  test('a stated skip reason is the deliberate way past', () => {
    expect(() => assertWalkedBeforeDone(epic(), 'internal tooling, no user flow')).not.toThrow();
  });
  test('ordinary tickets are not gated', () => {
    expect(() => assertWalkedBeforeDone({ path: dir, data: { id: 'RF-2', type: 'feature' } })).not.toThrow();
  });
});
