// End-to-end: `bobby conductor send|inbox` in a temp studio, with a fake `claude` on PATH.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { makeStudio, writeConductorYml, validYml, agentsFixture } from '../lib/conductor/helpers.js';

const bobby = path.resolve('bin/bobby.js');
const LANE_ONE = 'aaaa1111-0000-4000-8000-000000000000';
const LANE_TWO = 'bbbb2222-0000-4000-8000-000000000000';
const LANE_THREE = 'cccc3333-0000-4000-8000-000000000000';

describe('bobby conductor send / inbox', () => {
  let root;
  let hookDir;
  let fakeBin;
  let agentsFile;
  let inbox;

  const envFor = (extra = {}) => {
    const env = {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      FAKE_AGENTS_FILE: agentsFile,
      HOME: root,
      ...extra,
    };
    delete env.BOBBY_PROJECT;
    delete env.CLAUDE_CODE_SESSION_ID;
    return { ...env, ...extra };
  };
  const bobbyIn = (args, extra) => spawnSync('node', [bobby, 'conductor', ...args], { cwd: root, encoding: 'utf8', env: envFor(extra) });
  const lines = (sessionId) => fs.readFileSync(path.join(inbox, `${sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    fakeBin = path.join(root, 'fakebin');
    fs.mkdirSync(fakeBin);
    agentsFile = path.join(root, 'agents.json');
    fs.writeFileSync(agentsFile, JSON.stringify(agentsFixture()));
    fs.writeFileSync(path.join(fakeBin, 'claude'), [
      '#!/bin/sh',
      '[ "$1 $2 $3" = "agents --json --all" ] || { echo "unexpected args: $*" >&2; exit 2; }',
      'cat "$FAKE_AGENTS_FILE"',
    ].join('\n'), { mode: 0o755 });
    writeConductorYml(root, validYml(hookDir));
    inbox = path.join(root, '.bobby', 'conductor', 'inbox');
    fs.mkdirSync(inbox, { recursive: true });
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('send to a unique name appends one valid line for that session', () => {
    const r = bobbyIn(['send', 'lane one', 'rebase on main please', '--from', 'orchestrator']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Sent .* to lane one/);
    const [m, ...rest] = lines(LANE_ONE);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({ from: 'orchestrator', to: LANE_ONE, text: 'rebase on main please' });
    expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(m.ts).toISOString()).toBe(m.ts);
  });

  test('send reaches a finished session too, by sessionId', () => {
    const r = bobbyIn(['send', LANE_THREE, 'late note', '--from', 'orchestrator']);
    expect(r.status).toBe(0);
    expect(lines(LANE_THREE)).toHaveLength(1);
  });

  test('send without --from uses the sending session\'s name', () => {
    const r = bobbyIn(['send', 'lane one', 'hi'], { CLAUDE_CODE_SESSION_ID: LANE_TWO });
    expect(r.status).toBe(0);
    expect(lines(LANE_ONE)[0].from).toBe('lane two');
  });

  test('send without --from and without a known sender is an error and writes nothing', () => {
    const r = bobbyIn(['send', 'lane one', 'hi']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pass --from/);
    expect(fs.readdirSync(inbox)).toEqual([]);
  });

  test('a name that matches two sessions exits 1, lists both and writes nothing', () => {
    const agents = agentsFixture();
    agents[1].name = 'lane one';
    fs.writeFileSync(agentsFile, JSON.stringify(agents));
    const r = bobbyIn(['send', 'lane one', 'hi', '--from', 'o']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/matches 2 sessions/);
    expect(r.stderr).toContain(LANE_ONE);
    expect(r.stderr).toContain(LANE_TWO);
    expect(fs.readdirSync(inbox)).toEqual([]);
  });

  test('a name that matches nothing exits 1, lists the sessions and writes nothing', () => {
    const r = bobbyIn(['send', 'ghost', 'hi', '--from', 'o']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/No session matches "ghost"[\s\S]*lane one/);
    expect(fs.readdirSync(inbox)).toEqual([]);
  });

  test('an empty message exits 1 and writes nothing', () => {
    const r = bobbyIn(['send', 'lane one', '  ', '--from', 'o']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Message text is empty/);
    expect(fs.readdirSync(inbox)).toEqual([]);
  });

  test('a missing inbox directory is an error and is not created', () => {
    fs.rmSync(inbox, { recursive: true });
    const r = bobbyIn(['send', 'lane one', 'hi', '--from', 'o']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Inbox directory .* does not exist/);
    expect(fs.existsSync(inbox)).toBe(false);
  });

  test('a bad conductor.yml is an error naming the key', () => {
    writeConductorYml(root, 'projects:\n  - alpha\n');
    const r = bobbyIn(['send', 'lane one', 'hi', '--from', 'o']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/key "hook_state_dir" is missing/);
  });

  test('a failing `claude agents` is an error and writes nothing', () => {
    fs.writeFileSync(path.join(fakeBin, 'claude'), '#!/bin/sh\necho "claude is down" >&2\nexit 1\n', { mode: 0o755 });
    const r = bobbyIn(['send', 'lane one', 'hi', '--from', 'o']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/claude is down/);
    expect(fs.readdirSync(inbox)).toEqual([]);
  });

  test('concurrent sends both land as complete lines', async () => {
    const runOne = (text) => new Promise((resolve, reject) => {
      const child = spawn('node', [bobby, 'conductor', 'send', 'lane one', text, '--from', 'o'], { cwd: root, env: envFor(), stdio: 'ignore' });
      child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    const texts = Array.from({ length: 8 }, (_, i) => `msg ${i}`);
    await Promise.all(texts.map(runOne));
    expect(lines(LANE_ONE).map(m => m.text).sort()).toEqual([...texts].sort());
  });

  test('inbox lists all messages; --unread honors the cursor; --session picks one; nothing changes', () => {
    bobbyIn(['send', 'lane one', 'first', '--from', 'o']);
    bobbyIn(['send', 'lane one', 'second', '--from', 'o']);
    bobbyIn(['send', 'lane two', 'other', '--from', 'o']);
    fs.writeFileSync(path.join(inbox, `${LANE_ONE}.cursor`), '1\n');
    const before = fs.readdirSync(inbox).map(f => fs.readFileSync(path.join(inbox, f), 'utf8'));

    const all = bobbyIn(['inbox']);
    expect(all.status).toBe(0);
    expect(all.stdout).toMatch(/first/);
    expect(all.stdout).toMatch(/second/);
    expect(all.stdout).toMatch(/other/);

    const unread = bobbyIn(['inbox', '--unread']);
    expect(unread.stdout).not.toMatch(/first/);
    expect(unread.stdout).toMatch(/second/);
    expect(unread.stdout).toMatch(/other/);

    const one = bobbyIn(['inbox', '--session', LANE_ONE, '--unread']);
    expect(one.stdout).toMatch(/second/);
    expect(one.stdout).not.toMatch(/other/);
    expect(one.stdout).not.toMatch(/first/);

    expect(fs.readdirSync(inbox).map(f => fs.readFileSync(path.join(inbox, f), 'utf8'))).toEqual(before);
  });

  test('inbox works for a finished session\'s file and says so when there is nothing', () => {
    expect(bobbyIn(['inbox']).stdout).toMatch(/No messages/);
    bobbyIn(['send', LANE_THREE, 'late note', '--from', 'o']);
    expect(bobbyIn(['inbox', '--session', LANE_THREE]).stdout).toMatch(/late note/);
  });

  test('inbox with a cursor past the end of the file exits 1 instead of showing nothing', () => {
    bobbyIn(['send', 'lane one', 'first', '--from', 'o']);
    fs.writeFileSync(path.join(inbox, `${LANE_ONE}.cursor`), '5\n');
    const r = bobbyIn(['inbox', '--unread']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cursor 5 is past the 1 message/);
  });

  test('inbox on a corrupt file exits 1 naming the line', () => {
    fs.writeFileSync(path.join(inbox, `${LANE_ONE}.jsonl`), '{oops}\n');
    const r = bobbyIn(['inbox']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/line 1 is not valid JSON/);
  });
});
