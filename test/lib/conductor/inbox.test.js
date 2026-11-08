import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  inboxDir, assertInboxDir, resolveRecipient, buildMessage, appendMessage, readMessages,
  readCursor, writeCursor, unreadMessages, listInboxSessions,
} from '../../../lib/conductor/inbox.js';

const SID = 'aaaa1111-0000-4000-8000-000000000000';

function makeInbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-inbox-'));
  const dir = inboxDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}

const msg = (text, to = SID) => buildMessage({ from: 'orchestrator', to, text, now: 1_800_000_000_000 });

describe('resolveRecipient', () => {
  const sessions = [
    { id: 'aaaa1111', sessionId: SID, name: 'lane one', state: 'working' },
    { sessionId: 'bbbb2222-0000-4000-8000-000000000000', name: 'twin', kind: 'interactive' },
    { sessionId: 'cccc3333-0000-4000-8000-000000000000', name: 'twin', kind: 'interactive' },
  ];

  test('an exact name, a sessionId and a bg id each resolve to one session', () => {
    expect(resolveRecipient(sessions, 'lane one').sessionId).toBe(SID);
    expect(resolveRecipient(sessions, SID).name).toBe('lane one');
    expect(resolveRecipient(sessions, 'aaaa1111').name).toBe('lane one');
  });

  test('two sessions with the name is an error that lists both', () => {
    expect(() => resolveRecipient(sessions, 'twin')).toThrow(/matches 2 sessions[\s\S]*bbbb2222[\s\S]*cccc3333/);
  });

  test('no match is an error that lists the sessions; a partial name does not match', () => {
    expect(() => resolveRecipient(sessions, 'nobody')).toThrow(/No session matches "nobody"[\s\S]*lane one/);
    expect(() => resolveRecipient(sessions, 'lane')).toThrow(/No session matches/);
  });
});

describe('buildMessage', () => {
  test('carries id, ts, from, to and text', () => {
    const m = msg('hello');
    expect(Object.keys(m).sort()).toEqual(['from', 'id', 'text', 'to', 'ts']);
    expect(m.ts).toBe('2027-01-15T08:00:00.000Z');
  });

  test('empty or blank text is an error', () => {
    expect(() => msg('')).toThrow(/empty/);
    expect(() => msg('   \n')).toThrow(/empty/);
  });

  test('a missing sender or recipient is an error', () => {
    expect(() => buildMessage({ from: '', to: SID, text: 'x' })).toThrow(/sender/);
    expect(() => buildMessage({ from: 'a', to: '', text: 'x' })).toThrow(/recipient/);
  });
});

describe('the store', () => {
  let root;
  let dir;
  beforeEach(() => { ({ root, dir } = makeInbox()); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('append writes one JSON line per message and keeps earlier lines', () => {
    appendMessage(dir, msg('one'));
    appendMessage(dir, msg('two\nlines'));
    const lines = fs.readFileSync(path.join(dir, `${SID}.jsonl`), 'utf8').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[1]).text).toBe('two\nlines');
    expect(readMessages(dir, SID).map(m => m.text)).toEqual(['one', 'two\nlines']);
  });

  test('a missing inbox directory is an error and nothing is created', () => {
    const missing = path.join(root, 'nope');
    expect(() => appendMessage(missing, msg('x'))).toThrow(/Inbox directory .*nope does not exist/);
    expect(() => assertInboxDir(missing)).toThrow(/does not exist/);
    expect(fs.existsSync(missing)).toBe(false);
  });

  test('a session with no file has no messages and a zero cursor', () => {
    expect(readMessages(dir, SID)).toEqual([]);
    expect(readCursor(dir, SID)).toBe(0);
    expect(unreadMessages(dir, SID)).toEqual([]);
  });

  test('the cursor decides what is unread, and moving it never changes the message file', () => {
    appendMessage(dir, msg('one'));
    appendMessage(dir, msg('two'));
    appendMessage(dir, msg('three'));
    const file = path.join(dir, `${SID}.jsonl`);
    const before = fs.readFileSync(file, 'utf8');
    expect(unreadMessages(dir, SID).map(m => m.text)).toEqual(['one', 'two', 'three']);
    writeCursor(dir, SID, 2);
    expect(unreadMessages(dir, SID).map(m => m.text)).toEqual(['three']);
    writeCursor(dir, SID, 3);
    expect(unreadMessages(dir, SID)).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(fs.readFileSync(path.join(dir, `${SID}.cursor`), 'utf8')).toBe('3\n');
    expect(fs.readdirSync(dir).sort()).toEqual([`${SID}.cursor`, `${SID}.jsonl`]);
  });

  test('a cursor past the end of the file is an error, not an empty list', () => {
    appendMessage(dir, msg('one'));
    writeCursor(dir, SID, 5);
    expect(() => unreadMessages(dir, SID)).toThrow(/cursor 5 is past the 1 message/);
  });

  test('a cursor file that is not a number is an error', () => {
    fs.writeFileSync(path.join(dir, `${SID}.cursor`), 'abc');
    expect(() => readCursor(dir, SID)).toThrow(/cursor must be a line count/);
  });

  test('a corrupt line is an error naming the line; a line missing a field too', () => {
    const file = path.join(dir, `${SID}.jsonl`);
    fs.writeFileSync(file, `${JSON.stringify(msg('ok'))}\n{not json}\n`);
    expect(() => readMessages(dir, SID)).toThrow(/line 2 is not valid JSON/);
    fs.writeFileSync(file, `${JSON.stringify({ ...msg('ok'), from: '' })}\n`);
    expect(() => readMessages(dir, SID)).toThrow(/line 1 has no "from"/);
  });

  test('a file whose last line has no newline is an error', () => {
    fs.writeFileSync(path.join(dir, `${SID}.jsonl`), JSON.stringify(msg('ok')));
    expect(() => readMessages(dir, SID)).toThrow(/incomplete/);
  });

  test('listInboxSessions lists every session with a message file, finished ones included', () => {
    appendMessage(dir, msg('a', 'zzz'));
    appendMessage(dir, msg('b', 'aaa'));
    writeCursor(dir, 'only-cursor', 1);
    expect(listInboxSessions(dir)).toEqual(['aaa', 'zzz']);
  });

  test('parallel senders in separate processes each land complete lines', async () => {
    const lib = path.resolve('lib/conductor/inbox.js');
    const script = `
      import { buildMessage, appendMessage } from ${JSON.stringify(lib)};
      const [dir, worker] = process.argv.slice(1);
      const text = 'x'.repeat(20000);
      for (let i = 0; i < 20; i++) {
        appendMessage(dir, buildMessage({ from: 'w' + worker, to: ${JSON.stringify(SID)}, text: worker + ':' + i + ':' + text }));
      }
    `;
    const workers = 6;
    await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((resolve, reject) => {
      const child = spawn('node', ['--input-type=module', '-e', script, dir, String(w)], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', d => { err += d; });
      child.on('exit', code => (code === 0 ? resolve() : reject(new Error(err))));
    })));
    const messages = readMessages(dir, SID);
    expect(messages).toHaveLength(workers * 20);
    expect(new Set(messages.map(m => m.id)).size).toBe(workers * 20);
  });
});
