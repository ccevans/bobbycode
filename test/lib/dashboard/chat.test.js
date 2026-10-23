// test/lib/dashboard/chat.test.js
//
// TKT-021: conversational planning. Drives the REAL orchestrator (real git
// worktrees, the `initRepo` pattern) with a fake executor, through the
// ChatManager. The fake executor announces a Claude session id on its stream —
// exactly what `--resume` needs — and records the options each turn was
// launched with, so the assertions are on real orchestrator behaviour.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { ChatManager } from '../../../lib/dashboard/chat.js';
import { runAgent } from '../../../lib/dashboard/executor.js';
import { createTicket, moveTicket } from '../../../lib/tickets.js';

const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  git(dir, 'add .');
  git(dir, 'commit -q -m initial');
  return dir;
}

let tmp;

/**
 * An orchestrator on a real git repo, with a fake executor that records the
 * options of every turn and emits a Claude session id on the stream.
 */
function makeSetup({ sessionId = 'claude-sess-1' } = {}) {
  const repoRoot = initRepo(path.join(tmp, 'repo'));
  const ticketsDir = path.join(repoRoot, '.bobby', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  const sessionsDir = path.join(repoRoot, '.bobby', 'sessions');

  const store = new WorkspaceStore(path.join(repoRoot, '.bobby', 'workspaces.json'));
  const o = new Orchestrator({
    repoRoot, config: { git_conventions: {} }, ticketsDir, sessionsDir,
    agentsPath: null, store, sseHub: null,
  });

  o.turns = []; // [{ permissionMode, resume, prompt }]
  o._runExecutor = ({ prompt, permissionMode, resume, onEvent }) => {
    o.turns.push({ prompt, permissionMode, resume });
    const done = Promise.resolve().then(() => {
      // A claude stream announces its session id on essentially every event.
      if (onEvent) onEvent({ type: 'stdout', kind: 'json', data: { type: 'system', session_id: sessionId }, at: 'now' });
      return { exitCode: 0, signal: null };
    });
    return { pid: 4242, stop: () => {}, done };
  };

  const chatManager = new ChatManager({ orchestrator: o, filePath: path.join(repoRoot, '.bobby', 'chats.json') });
  return { o, chatManager, ticketsDir, repoRoot };
}

function seedTicket(ticketsDir) {
  const { id } = createTicket(ticketsDir, { prefix: 'TKT', title: 'Chat work' });
  moveTicket(ticketsDir, id, 'planning', 'test');
  return id;
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-chat-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

describe('ChatManager (TKT-021)', () => {
  test('TC-3: startChat creates a workspace in plan mode, idle and ready', () => {
    const { o, chatManager, ticketsDir } = makeSetup();
    const id = seedTicket(ticketsDir);

    const chat = chatManager.startChat(id);

    const ws = o.store.get(chat.workspaceId);
    expect(ws.chatMode).toBe(true);
    expect(ws.chatHistory).toEqual([]);
    expect(ws.status).toBe('idle');
    expect(chat.ticketId).toBe(id);
    expect(chat.status).toBe('idle');
  });

  test('TC-4: sendMessage runs a plan-mode turn, records history, captures the Claude session id', async () => {
    const { o, chatManager, ticketsDir } = makeSetup({ sessionId: 'claude-xyz' });
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);

    await chatManager.sendMessage(chat.id, 'What about using a queue?');

    expect(o.turns).toHaveLength(1);
    expect(o.turns[0].permissionMode).toBe('plan');

    const ws = o.store.get(chat.workspaceId);
    expect(ws.chatHistory).toHaveLength(1);
    expect(ws.chatHistory[0].summary).toContain('queue');
    expect(ws.chatId).toBe('claude-xyz');
  });

  test('TC-5: subsequent sendMessage resumes with the captured Claude session id', async () => {
    const { o, chatManager, ticketsDir } = makeSetup({ sessionId: 'claude-xyz' });
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);

    await chatManager.sendMessage(chat.id, 'first');
    expect(o.turns[0].resume).toBeUndefined(); // first turn has nothing to resume

    await chatManager.sendMessage(chat.id, 'now add error handling');
    expect(o.turns[1].resume).toBe('claude-xyz');
  });

  test('TC-6: commitPlan runs a write-capable turn (no plan restriction) that writes the plan', async () => {
    const { o, chatManager, ticketsDir } = makeSetup();
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);
    await chatManager.sendMessage(chat.id, 'settle the approach');

    await chatManager.commitPlan(chat.id);

    const commitTurn = o.turns[o.turns.length - 1];
    expect(commitTurn.permissionMode).not.toBe('plan');
    expect(commitTurn.resume).toBe('claude-sess-1');
    expect(commitTurn.prompt).toContain('plan.md');
    expect(commitTurn.prompt).toContain('test-cases.md');
  });

  test('TC-7: chats persist across a restart', async () => {
    const { chatManager, ticketsDir, o } = makeSetup();
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);
    await chatManager.sendMessage(chat.id, 'keep this');

    // A fresh manager on the same file — the app restarted.
    const reborn = new ChatManager({ orchestrator: o, filePath: chatManager.filePath });
    const chats = reborn.listChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].id).toBe(chat.id);
    expect(chats[0].history).toHaveLength(1);
    expect(chats[0].history[0].summary).toContain('keep this');
  });

  test('TC-11: sendMessage on a non-existent chat throws, naming the id', async () => {
    const { chatManager } = makeSetup();
    await expect(chatManager.sendMessage('nonexistent', 'hello')).rejects.toThrow(/nonexistent/);
  });

  test('TC-12: commitPlan on a chat with no turns throws', async () => {
    const { chatManager, ticketsDir } = makeSetup();
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);
    await expect(chatManager.commitPlan(chat.id)).rejects.toThrow(/no turns/);
  });

  test('a discussion turn that writes nothing is idle, never a no-op failure', async () => {
    const { o, chatManager, ticketsDir } = makeSetup();
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);

    await chatManager.sendMessage(chat.id, 'just discussing');

    // Plan-mode turns write nothing by design; that must not be read as no_op.
    expect(o.store.get(chat.workspaceId).status).toBe('idle');
  });
});

// BOB-133: codex announces its conversation id as top-level `thread_id` on the
// `thread.started` event — never `session_id` — so the capture seam must read
// both, or every codex chat turn spawns a fresh thread (the BOB-080 F-A live
// finding).
describe('codex chat resume (BOB-133)', () => {
  // Real codex-cli 0.146.0 first event, captured 2026-08-23 (BOB-133 plan V1);
  // same shape in BOB-080 test-evidence/real-run-readonly.jsonl.
  const THREAD_ID = '01a0316a-5d66-7a80-900b-f0af9fe878d8';
  const THREAD_STARTED_LINE = `{"type":"thread.started","thread_id":"${THREAD_ID}"}\n`;

  /**
   * Like makeSetup, but the boot config resolves the codex executor (non-studio
   * `_configFor` returns it), and the shim drives the REAL `runAgent` — so the
   * argv asserted below is what the real codex `buildArgs` produced, not a
   * fake's echo. Only `spawn` is faked: it records [bin, args] and replays the
   * V1 stream line.
   */
  function makeCodexSetup() {
    const repoRoot = initRepo(path.join(tmp, 'repo'));
    const ticketsDir = path.join(repoRoot, '.bobby', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });
    const sessionsDir = path.join(repoRoot, '.bobby', 'sessions');

    const store = new WorkspaceStore(path.join(repoRoot, '.bobby', 'workspaces.json'));
    const o = new Orchestrator({
      repoRoot, config: { git_conventions: {}, target: 'codex' }, ticketsDir, sessionsDir,
      agentsPath: null, store, sseHub: null,
    });

    o.spawned = []; // [[bin, args]]
    const fakeCodexSpawn = (bin, args) => {
      o.spawned.push([bin, args]);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      child.killed = false;
      child.exitCode = null;
      child.pid = 4242;
      // Emit after runAgent wires its stdout listeners (it wires synchronously,
      // so any macrotask suffices). V2: a resumed run re-announces the SAME id.
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from(THREAD_STARTED_LINE));
        child.exitCode = 0;
        child.emit('exit', 0, null);
      }, 0);
      return child;
    };
    o._runExecutor = (opts) => runAgent({ ...opts, spawn: fakeCodexSpawn });

    const chatManager = new ChatManager({ orchestrator: o, filePath: path.join(repoRoot, '.bobby', 'chats.json') });
    return { o, chatManager, ticketsDir };
  }

  test('turn 1 captures thread_id; turn 2 spawns exec resume with it, sans sandbox (AC1-AC3)', async () => {
    const { o, chatManager, ticketsDir } = makeCodexSetup();
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);

    await chatManager.sendMessage(chat.id, 'first message');

    // Turn 1: a fresh exec, nothing to resume yet.
    expect(o.spawned).toHaveLength(1);
    const [bin1, args1] = o.spawned[0];
    expect(bin1).toBe('codex');
    expect(args1[0]).toBe('exec');
    expect(args1).not.toContain('resume');

    // AC1: the thread.started thread_id landed in the same capture seam
    // claude's session_id uses — on the workspace and mirrored on the chat.
    expect(o.store.get(chat.workspaceId).chatId).toBe(THREAD_ID);
    expect(chatManager.getChat(chat.id).chatSessionId).toBe(THREAD_ID);

    const synced = await chatManager.sendMessage(chat.id, 'expand on the option you proposed');

    // AC2: the second turn resumes the captured thread — real orchestrator,
    // real buildArgs, at the actually-spawned-argv level. AC3 (review F7): a
    // plan-mode discussion turn on resume carries NO sandbox flag — the real
    // codex-cli 0.146.0 parser refuses `exec resume --sandbox` (plan V3).
    expect(o.spawned).toHaveLength(2);
    const [bin2, args2] = o.spawned[1];
    expect(bin2).toBe('codex');
    expect(args2.slice(0, 4)).toEqual(['exec', 'resume', THREAD_ID, '--json']);
    expect(args2).toHaveLength(5); // the prompt is the only thing after --json
    expect(args2[4]).toContain('expand on the option');
    expect(args2).not.toContain('--sandbox');
    expect(args2).not.toContain('-s');

    // V2: the resumed stream re-announced the same thread_id — no overwrite.
    expect(o.store.get(chat.workspaceId).chatId).toBe(THREAD_ID);
    expect(synced.chatSessionId).toBe(THREAD_ID);
  });
});

// BOB-085: opencode announces its conversation id as top-level camelCase
// `sessionID` on EVERY `run --format json` event (run.ts ~L408-417 @03bba464)
// — never `session_id` or `thread_id` — so the capture seam reads it as its
// third field. Resume is `run --session <id>`, a flag on the same parser.
describe('opencode chat resume (BOB-085)', () => {
  // Real opencode 1.18.21 event, captured 2026-08-23 (BOB-085 plan V2), error
  // body shape from the 2026-08-24 re-capture against the same binary.
  const SESSION_ID = 'ses_fce7411fbffeS3C7aYXhpXidaZ';
  const EVENT_LINE = `{"type":"error","timestamp":1787537649689,"sessionID":"${SESSION_ID}","error":{"name":"UnknownError","data":{"message":"Unexpected server error. Check server logs for details.","ref":"err_4c0b7f36"}}}\n`;

  /**
   * Like makeCodexSetup: boot config resolves the opencode executor via
   * `target: 'opencode'`, and the shim drives the REAL `runAgent` — the argv
   * asserted below is what the real opencode buildArgs produced. Only `spawn`
   * is faked: it records [bin, args] and replays the V2 stream line.
   */
  function makeOpencodeSetup() {
    const repoRoot = initRepo(path.join(tmp, 'repo'));
    const ticketsDir = path.join(repoRoot, '.bobby', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });
    const sessionsDir = path.join(repoRoot, '.bobby', 'sessions');

    const store = new WorkspaceStore(path.join(repoRoot, '.bobby', 'workspaces.json'));
    const o = new Orchestrator({
      repoRoot, config: { git_conventions: {}, target: 'opencode' }, ticketsDir, sessionsDir,
      agentsPath: null, store, sseHub: null,
    });

    o.spawned = []; // [[bin, args]]
    const fakeOpencodeSpawn = (bin, args) => {
      o.spawned.push([bin, args]);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      child.killed = false;
      child.exitCode = null;
      child.pid = 4242;
      // V3: every event re-announces the SAME sessionID — it is the session
      // being run, so a resumed turn's re-announcement never overwrites.
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from(EVENT_LINE));
        child.exitCode = 0;
        child.emit('exit', 0, null);
      }, 0);
      return child;
    };
    o._runExecutor = (opts) => runAgent({ ...opts, spawn: fakeOpencodeSpawn });

    const chatManager = new ChatManager({ orchestrator: o, filePath: path.join(repoRoot, '.bobby', 'chats.json') });
    return { o, chatManager, ticketsDir };
  }

  test('turn 1 captures sessionID; turn 2 resumes via --session with the plan agent (V1/V2/V6)', async () => {
    const { o, chatManager, ticketsDir } = makeOpencodeSetup();
    const id = seedTicket(ticketsDir);
    const chat = chatManager.startChat(id);

    await chatManager.sendMessage(chat.id, 'first message');

    // Turn 1: a fresh run, nothing to resume yet — and the prompt positional.
    expect(o.spawned).toHaveLength(1);
    const [bin1, args1] = o.spawned[0];
    expect(bin1).toBe('opencode');
    expect(args1[0]).toBe('run');
    expect(args1).not.toContain('--session');

    // The camelCase sessionID landed in the same capture seam claude's
    // session_id and codex's thread_id use.
    expect(o.store.get(chat.workspaceId).chatId).toBe(SESSION_ID);
    expect(chatManager.getChat(chat.id).chatSessionId).toBe(SESSION_ID);

    const synced = await chatManager.sendMessage(chat.id, 'expand on the option you proposed');

    // Turn 2 resumes the captured session — real orchestrator, real
    // buildArgs, at the actually-spawned-argv level. Exact argv per the V6
    // cross-product: resume + plan mode keeps BOTH --session and --agent plan.
    expect(o.spawned).toHaveLength(2);
    const [bin2, args2] = o.spawned[1];
    expect(bin2).toBe('opencode');
    expect(args2.slice(0, 7)).toEqual(['run', '--session', SESSION_ID, '--format', 'json', '--agent', 'plan']);
    expect(args2).toHaveLength(8); // the prompt is the only thing after --agent plan
    expect(args2[7]).toContain('expand on the option');

    // The resumed stream re-announced the same sessionID — no overwrite.
    expect(o.store.get(chat.workspaceId).chatId).toBe(SESSION_ID);
    expect(synced.chatSessionId).toBe(SESSION_ID);
  });
});
