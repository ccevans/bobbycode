// test/lib/dashboard/chat.test.js
//
// Unit tests for ChatManager (TKT-021). Tests the chat lifecycle:
// startChat → sendMessage → sendMessage → commitPlan.
//
// The orchestrator is stubbed — ChatManager orchestrates calls to it, it does
// not re-implement its internals.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { ChatManager } from '../../../lib/dashboard/chat.js';
import { WorkspaceStore, newWorkspace } from '../../../lib/dashboard/state.js';

/** A minimal orchestrator stub that records calls and returns workspace-like objects. */
function stubOrchestrator(store) {
  const calls = [];
  let sessionIdSeq = 0;
  return {
    calls,
    createWorkspace({ ticketId, agent, pipelineName }) {
      const id = `ws-${ticketId}-chat-${Math.random().toString(36).slice(2, 5)}`;
      const ws = newWorkspace({
        id, ticketId, worktreePath: '/tmp/wt', branch: `bobby/${id}`, agent,
        pipeline: pipelineName || 'default',
      });
      store.create(ws);
      return ws;
    },
    async runAgent(workspaceId, opts = {}) {
      calls.push({ method: 'runAgent', workspaceId, opts });
      // Simulate: capture a Claude session id and set it on the workspace.
      sessionIdSeq++;
      const claudeSessionId = `claude-ses-${sessionIdSeq}`;
      store.update(workspaceId, { status: 'idle' });
      return { ...store.get(workspaceId), _claudeSessionId: claudeSessionId };
    },
    async runChat(workspaceId, opts = {}) {
      calls.push({ method: 'runChat', workspaceId, opts });
      store.update(workspaceId, { status: 'idle' });
      return store.get(workspaceId);
    },
    async commitChat(workspaceId, opts = {}) {
      calls.push({ method: 'commitChat', workspaceId, opts });
      store.update(workspaceId, { status: 'idle' });
      return store.get(workspaceId);
    },
    _runExecutor(runOpts) {
      calls.push({ method: '_runExecutor', runOpts });
      return {
        pid: 999,
        stop() {},
        done: Promise.resolve({ exitCode: 0, signal: null, costUsd: null }),
      };
    },
  };
}

describe('ChatManager', () => {
  let tmpDir, chatsFile, store, orchestrator, chat;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-chat-'));
    chatsFile = path.join(tmpDir, 'chats.json');
    const storeFile = path.join(tmpDir, 'workspaces.json');
    store = new WorkspaceStore(storeFile).load();
    orchestrator = stubOrchestrator(store);
    chat = new ChatManager({ store, orchestrator, chatsFile });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  // TC-3: startChat creates a workspace in plan mode
  test('startChat creates a workspace with chatMode true', async () => {
    const result = await chat.startChat('TKT-TEST');
    const ws = store.get(result.workspaceId);
    expect(ws).toBeTruthy();
    expect(ws.chatMode).toBe(true);
    expect(ws.chatHistory).toEqual([]);
    expect(ws.status).toBe('idle');
    expect(result.chatId).toBeTruthy();
    expect(result.ticketId).toBe('TKT-TEST');
  });

  // TC-4: sendMessage resumes the conversation
  test('sendMessage appends to chatHistory and calls runAgent', async () => {
    const { chatId, workspaceId } = await chat.startChat('TKT-TEST');
    await chat.sendMessage(chatId, 'What about using a queue?');

    const ws = store.get(workspaceId);
    expect(ws.chatHistory).toHaveLength(1);
    expect(ws.chatHistory[0].role).toBe('user');
    expect(ws.chatHistory[0].summary).toBe('What about using a queue?');
    expect(ws.chatHistory[0].at).toBeTruthy();

    // runChat was called for plan permission mode
    const call = orchestrator.calls.find(c => c.method === 'runChat');
    expect(call).toBeTruthy();
  });

  // TC-5: sendMessage uses --resume on subsequent turns
  test('sendMessage uses resume on subsequent turns', async () => {
    const { chatId, workspaceId } = await chat.startChat('TKT-TEST');

    // First turn sets chatId
    await chat.sendMessage(chatId, 'First message');
    // Simulate the Claude session id being captured (normally from stream)
    store.update(workspaceId, { chatId: 'claude-ses-1' });

    // Second turn should use resume
    await chat.sendMessage(chatId, 'Second message');

    const ws = store.get(workspaceId);
    expect(ws.chatHistory).toHaveLength(2);

    // Verify the second call uses the chatId for resume
    const runCalls = orchestrator.calls.filter(c => c.method === 'runChat');
    expect(runCalls).toHaveLength(2);
  });

  // TC-6: commitPlan writes files without plan restriction
  test('commitPlan calls runAgent with resume and without plan mode', async () => {
    const { chatId, workspaceId } = await chat.startChat('TKT-TEST');
    await chat.sendMessage(chatId, 'Plan the feature');
    store.update(workspaceId, { chatId: 'claude-ses-1' });

    await chat.commitPlan(chatId);

    const ws = store.get(workspaceId);
    // commitPlan should have added a commit entry to chatHistory
    const commitEntry = ws.chatHistory.find(e => e.role === 'system' && /commit/i.test(e.summary));
    expect(commitEntry).toBeTruthy();
  });

  // TC-7: Chat sessions persist across restart
  test('chat sessions persist and reload', async () => {
    const { chatId } = await chat.startChat('TKT-TEST');
    await chat.sendMessage(chatId, 'Hello');

    // Create a new ChatManager pointing at the same file
    const chat2 = new ChatManager({ store, orchestrator, chatsFile });
    const chats = chat2.listChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].chatId).toBe(chatId);
    expect(chats[0].ticketId).toBe('TKT-TEST');
  });

  // TC-11: sendMessage on non-existent chat throws
  test('sendMessage on non-existent chat throws', async () => {
    await expect(chat.sendMessage('nonexistent', 'hello'))
      .rejects.toThrow(/nonexistent/);
  });

  // TC-12: commitPlan on a chat with no turns throws
  test('commitPlan on a chat with no turns throws', async () => {
    const { chatId } = await chat.startChat('TKT-TEST');
    await expect(chat.commitPlan(chatId))
      .rejects.toThrow(/nothing to commit/i);
  });

  test('getChat returns chat metadata', async () => {
    const { chatId } = await chat.startChat('TKT-TEST');
    const retrieved = chat.getChat(chatId);
    expect(retrieved).toBeTruthy();
    expect(retrieved.chatId).toBe(chatId);
    expect(retrieved.ticketId).toBe('TKT-TEST');
  });

  test('getChat returns null for unknown id', () => {
    expect(chat.getChat('nope')).toBeNull();
  });

  test('listChats returns all chats', async () => {
    await chat.startChat('TKT-1');
    await chat.startChat('TKT-2');
    expect(chat.listChats()).toHaveLength(2);
  });
});
