// test/lib/usage.test.js — `bobby usage` reads Claude Code transcripts honestly.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { firstCommand, isShellRead, mergeTurns, summarizeRun, collectRuns, rollup, transcriptsDirFor } from '../../lib/usage.js';

const asst = (id, content, usage, ts) => ({ type: 'assistant', timestamp: ts, message: { id, content, usage } });
const user = (results, ts) => ({ type: 'user', timestamp: ts, message: { content: results } });
const bash = (id, command) => ({ type: 'tool_use', id, name: 'Bash', input: { command } });
const result = (id, text) => ({ type: 'tool_result', tool_use_id: id, content: text });
const u = (ctx, out) => ({ input_tokens: 0, cache_read_input_tokens: ctx, cache_creation_input_tokens: 0, output_tokens: out });

describe('shell reads', () => {
  test('the first real command is found past cd and export prefixes', () => {
    expect(firstCommand('cd /x && export A=1; cat foo.js')).toBe('cat foo.js');
  });
  test.each([['cat a.js', true], ['cd x && sed -n 1,9p a', true], ['npm test', false], ['git diff', false]])('%s', (cmd, want) => {
    expect(isShellRead(cmd)).toBe(want);
  });
});

describe('one API turn written as several transcript lines', () => {
  // Claude Code writes one line per content block, each repeating the usage.
  const lines = [
    asst('m1', [{ type: 'text', text: 'reading' }], u(50000, 10), '2026-10-22T10:00:00Z'),
    asst('m1', [bash('a', 'cat big.js')], u(50000, 20), '2026-10-22T10:00:01Z'),
    asst('m1', [bash('b', 'npm test')], u(50000, 30), '2026-10-22T10:00:02Z'),
    user([result('a', 'x'.repeat(300)), result('b', 'y'.repeat(100))], '2026-10-22T10:00:05Z'),
    asst('m2', [{ type: 'text', text: 'done' }], u(60000, 5), '2026-10-22T10:10:00Z'),
  ];

  test('merges into one turn per message id', () => {
    const turns = mergeTurns(lines).filter(e => e.type === 'assistant');
    expect(turns).toHaveLength(2);
    expect(turns[0].message.content).toHaveLength(3);
  });

  test('counts turns, tokens, batching and shell-read share from the merged turns', () => {
    const r = summarizeRun(lines);
    expect(r.turns).toBe(2);
    expect(r.context).toBe(110000);
    expect(r.output).toBe(35);           // last usage line of m1, not the sum of its lines
    expect(r.start).toBe(50000);
    expect(r.peak).toBe(60000);
    expect(r.toolTurns).toBe(1);
    expect(r.batched).toBe(1);
    expect(r.shellReadOut / r.toolOut).toBeCloseTo(0.75, 2);
    expect(r.minutes).toBeCloseTo(10, 5);
  });
});

describe('collectRuns', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-usage-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function run(session, id, agentType, lines) {
    const sub = path.join(dir, session, 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, `agent-${id}.meta.json`), JSON.stringify({ agentType }));
    fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n{"torn');
  }

  test('keeps Bobby agents by default, others with all, and filters by date', () => {
    run('s1', 'a', 'bobby-build', [asst('m', [], u(1000, 1), '2026-10-20T00:00:00Z')]);
    run('s1', 'b', 'Explore', [asst('m', [], u(1000, 1), '2026-10-21T00:00:00Z')]);
    run('s2', 'c', 'bobby-build', [asst('m', [], u(3000, 1), '2026-10-22T00:00:00Z')]);
    expect(collectRuns(dir).map(r => r.agent).sort()).toEqual(['bobby-build', 'bobby-build']);
    expect(collectRuns(dir, { all: true })).toHaveLength(3);
    expect(collectRuns(dir, { since: '2026-10-21' })).toHaveLength(1);
    const [build] = rollup(collectRuns(dir));
    expect(build).toMatchObject({ agent: 'bobby-build', runs: 2, startK: 2 });
  });

  test('a missing transcripts folder is an error, not an empty report', () => {
    expect(() => collectRuns(path.join(dir, 'nope'))).toThrow(/No Claude Code transcripts/);
  });

  test('transcript folder name matches Claude Code\'s encoding', () => {
    expect(transcriptsDirFor('/Users/x/Repos/bobby-code-studio')).toMatch(/projects\/-Users-x-Repos-bobby-code-studio$/);
  });
});
