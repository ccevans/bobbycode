// test/hooks/conductor-inbox.test.js: the UserPromptSubmit inbox hook (BOB-183).
// Runs the real templates/hooks/conductor-inbox.sh against a temp studio.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const SCRIPT = fileURLToPath(new URL('../../templates/hooks/conductor-inbox.sh', import.meta.url));
const SID = '11111111-2222-3333-4444-555555555555';

let studio;
let inbox;
beforeEach(() => {
  studio = fs.mkdtempSync(path.join(os.tmpdir(), 'conductor-inbox-hook-'));
  fs.writeFileSync(path.join(studio, '.bobbyrc.yml'), 'studio:\n  name: test\n');
  inbox = path.join(studio, '.bobby', 'conductor', 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
});
afterEach(() => { fs.rmSync(studio, { recursive: true, force: true }); });

const line = (text, extra = {}) => JSON.stringify({ id: `id-${text}`, ts: '2026-11-08T10:00:00.000Z', from: 'orchestrator', to: SID, text, ...extra });
const writeInbox = (lines, sid = SID) => fs.writeFileSync(path.join(inbox, `${sid}.jsonl`), lines.map(l => `${l}\n`).join(''));
const cursorOf = (sid = SID) => {
  const f = path.join(inbox, `${sid}.cursor`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

function runHook({ input = { session_id: SID }, cwd = studio, env = {}, shell = null } = {}) {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: studio, ...env };
  if (shell) {
    return spawnSync('bash', ['-c', shell], { cwd, input: JSON.stringify(input), encoding: 'utf8', env: { ...e, HOOK: SCRIPT } });
  }
  return spawnSync('bash', [SCRIPT], { cwd, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: e });
}
const context = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;

describe('conductor-inbox hook', () => {
  test('two unread lines are both emitted as additionalContext and the cursor moves to 2; a second run emits nothing', () => {
    writeInbox([line('first thing'), line('second thing')]);
    const r = runHook();
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    const ctx = out.hookSpecificOutput.additionalContext;
    expect(ctx).toMatch(/2 messages/);
    expect(ctx).toContain('first thing');
    expect(ctx).toContain('second thing');
    expect(ctx).toContain('from orchestrator');
    expect(ctx.indexOf('first thing')).toBeLessThan(ctx.indexOf('second thing'));
    expect(cursorOf()).toBe('2\n');

    const again = runHook();
    expect(again.status).toBe(0);
    expect(again.stdout).toBe('');
    expect(cursorOf()).toBe('2\n');
  });

  test('only lines past the cursor are delivered, and a later message arrives alone', () => {
    writeInbox([line('old'), line('new')]);
    fs.writeFileSync(path.join(inbox, `${SID}.cursor`), '1\n');
    const r = runHook();
    expect(context(r)).toContain('new');
    expect(context(r)).not.toContain('old');
    expect(cursorOf()).toBe('2\n');
    fs.appendFileSync(path.join(inbox, `${SID}.jsonl`), `${line('later')}\n`);
    const r2 = runHook();
    expect(context(r2)).toMatch(/1 message /);
    expect(context(r2)).toContain('later');
    expect(cursorOf()).toBe('3\n');
  });

  test('multi-line and quoted text survives intact; the message file is untouched', () => {
    const text = 'line one\nline "two" \'q\' \\ end';
    writeInbox([line(text)]);
    const before = fs.readFileSync(path.join(inbox, `${SID}.jsonl`), 'utf8');
    expect(context(runHook())).toContain(text);
    expect(fs.readFileSync(path.join(inbox, `${SID}.jsonl`), 'utf8')).toBe(before);
  });

  test('another session\'s messages are not delivered', () => {
    writeInbox([line('not yours', { to: 'other' })], 'other');
    const r = runHook();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(cursorOf('other')).toBeNull();
  });

  test('no inbox file: exit 0, no output, nothing written', () => {
    const r = runHook();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(fs.readdirSync(inbox)).toEqual([]);
  });

  test('an empty inbox file (a send between open and write) exits 0 with no output and no cursor', () => {
    fs.writeFileSync(path.join(inbox, `${SID}.jsonl`), '');
    const r = runHook();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(cursorOf()).toBeNull();
  });

  test('no inbox directory or no studio at all: exit 0, no output', () => {
    fs.rmSync(path.join(studio, '.bobby'), { recursive: true });
    expect(runHook().status).toBe(0);
    fs.rmSync(path.join(studio, '.bobbyrc.yml'));
    const r = runHook({ env: { CLAUDE_PROJECT_DIR: studio } });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('a session whose cwd is a worktree below the studio finds the studio inbox', () => {
    const wt = path.join(studio, 'worktrees', 'X');
    fs.mkdirSync(wt, { recursive: true });
    writeInbox([line('hello')]);
    const r = runHook({ cwd: wt, env: { CLAUDE_PROJECT_DIR: wt }, input: { session_id: SID, cwd: wt } });
    expect(context(r)).toContain('hello');
  });

  test('a corrupt line exits 1 with its line number, delivers nothing and leaves the cursor', () => {
    writeInbox([line('ok'), '{broken']);
    fs.writeFileSync(path.join(inbox, `${SID}.cursor`), '0\n');
    const r = runHook();
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/conductor-inbox: .*line 2 is not valid JSON/);
    expect(cursorOf()).toBe('0\n');
  });

  test('a line missing a field exits 1 naming the line and field', () => {
    writeInbox([line('ok', { from: '' })]);
    const r = runHook();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/line 1 has no 'from'/);
  });

  test('a corrupt line that was already delivered does not stop later messages', () => {
    writeInbox(['{broken', line('fresh')]);
    fs.writeFileSync(path.join(inbox, `${SID}.cursor`), '1\n');
    expect(context(runHook())).toContain('fresh');
  });

  test('a cursor past the end of the file, or not a number, exits 1', () => {
    writeInbox([line('one')]);
    fs.writeFileSync(path.join(inbox, `${SID}.cursor`), '4\n');
    const past = runHook();
    expect(past.status).toBe(1);
    expect(past.stderr).toMatch(/cursor 4 is past the 1 message/);
    fs.writeFileSync(path.join(inbox, `${SID}.cursor`), 'x\n');
    const bad = runHook();
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/cursor must be a line count/);
  });

  test('a last line with no newline is an error, not a silent skip', () => {
    fs.writeFileSync(path.join(inbox, `${SID}.jsonl`), line('cut off'));
    const r = runHook();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/incomplete/);
  });

  test('bad hook input exits 1 and says so; it never exits 2 (which would block the prompt)', () => {
    for (const input of ['not json', '{}', JSON.stringify({ session_id: '../../etc/passwd' })]) {
      const r = runHook({ input });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/conductor-inbox:/);
    }
  });

  test('the cursor is not advanced when the output cannot be written', () => {
    writeInbox([line('one'), line('two')]);
    const r = runHook({ shell: 'bash "$HOOK" >&-' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not write hook output, cursor not moved/);
    expect(cursorOf()).toBeNull();
    // The messages are still there for the next turn.
    const next = runHook();
    expect(context(next)).toContain('two');
    expect(cursorOf()).toBe('2\n');
  });

  test('an empty inbox answers well inside the 200 ms budget', () => {
    runHook(); // warm the interpreter
    const runs = 5;
    const start = process.hrtime.bigint();
    for (let i = 0; i < runs; i += 1) runHook();
    const avgMs = Number(process.hrtime.bigint() - start) / 1e6 / runs;
    expect(avgMs).toBeLessThan(200);
  });
});
