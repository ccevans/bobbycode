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
import { execSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { ChatManager } from '../../../lib/dashboard/chat.js';
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
