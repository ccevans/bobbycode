// test/lib/dashboard/server-chat.test.js
//
// Integration tests for the chat API routes (TKT-021). Exercises the
// POST /api/chats, POST /api/chats/:id/message, POST /api/chats/:id/commit,
// GET /api/chats, and GET /api/chats/:id routes over real HTTP.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildServer } from '../../../lib/dashboard/server.js';
import { WorkspaceStore, newWorkspace } from '../../../lib/dashboard/state.js';
import { ChatManager } from '../../../lib/dashboard/chat.js';

let tmp;
let server;
let base;
let store;
let chatManager;
let orchestratorCalls;

function stubOrchestrator(store) {
  orchestratorCalls = [];
  return {
    readLatestSessionFile: () => null,
    createWorkspace({ ticketId, agent, pipelineName }) {
      orchestratorCalls.push(['createWorkspace', ticketId, agent]);
      const id = `ws-${ticketId}-chat-${Math.random().toString(36).slice(2, 5)}`;
      const ws = newWorkspace({
        id, ticketId, worktreePath: '/tmp/wt', branch: `bobby/${id}`, agent,
        pipeline: pipelineName || 'default',
      });
      store.create(ws);
      return ws;
    },
    async runAgent(workspaceId, opts = {}) {
      orchestratorCalls.push(['runAgent', workspaceId, opts]);
      store.update(workspaceId, { status: 'idle' });
      return store.get(workspaceId);
    },
    async runChat(workspaceId, opts = {}) {
      orchestratorCalls.push(['runChat', workspaceId, opts]);
      store.update(workspaceId, { status: 'idle' });
      return store.get(workspaceId);
    },
    async commitChat(workspaceId, opts = {}) {
      orchestratorCalls.push(['commitChat', workspaceId, opts]);
      store.update(workspaceId, { status: 'idle' });
      return store.get(workspaceId);
    },
  };
}

async function start() {
  const orchestrator = stubOrchestrator(store);
  const chatsFile = path.join(tmp, '.bobby', 'chats.json');
  chatManager = new ChatManager({ store, orchestrator, chatsFile });

  server = buildServer({
    orchestrator,
    store,
    sseHub: { connect: () => () => {}, broadcast: () => {} },
    config: { ticket_prefix: 'TKT' },
    repoRoot: tmp,
    ticketsDir: path.join(tmp, '.bobby', 'tickets'),
    chatManager,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

const api = async (method, p, body) => {
  const res = await fetch(base + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-chat-api-'));
  fs.mkdirSync(path.join(tmp, '.bobby', 'tickets'), { recursive: true });
  const storeFile = path.join(tmp, '.bobby', 'workspaces.json');
  store = new WorkspaceStore(storeFile).load();
  await start();
});

afterEach((done) => {
  server.closeAllConnections?.();
  server.close(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    done();
  });
});

describe('chat API routes (TKT-021)', () => {
  // TC-8: POST /api/chats starts a chat
  test('POST /api/chats starts a chat', async () => {
    const { status, body } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
    expect(status).toBe(200);
    expect(body.chatId).toBeTruthy();
    expect(body.ticketId).toBe('TKT-TEST');
    expect(body.status).toBe('active');
  });

  test('POST /api/chats requires ticketId', async () => {
    const { status, body } = await api('POST', '/api/chats', {});
    expect(status).toBe(400);
    expect(body.error).toMatch(/ticketId/i);
  });

  // TC-9: POST /api/chats/:id/message sends a turn
  test('POST /api/chats/:id/message sends a message', async () => {
    const { body: created } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
    const { status, body } = await api('POST', `/api/chats/${created.chatId}/message`, {
      message: 'Use a simpler approach',
    });
    expect(status).toBe(200);
    expect(body.chat).toBeTruthy();
  });

  test('POST /api/chats/:id/message requires message', async () => {
    const { body: created } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
    const { status, body } = await api('POST', `/api/chats/${created.chatId}/message`, {});
    expect(status).toBe(400);
    expect(body.error).toMatch(/message/i);
  });

  test('POST /api/chats/:id/message on unknown chat returns 404', async () => {
    const { status } = await api('POST', '/api/chats/nonexistent/message', {
      message: 'hello',
    });
    expect(status).toBe(404);
  });

  // TC-10: POST /api/chats/:id/commit finalizes the plan
  test('POST /api/chats/:id/commit finalizes the plan', async () => {
    const { body: created } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
    // Must have at least one message first
    await api('POST', `/api/chats/${created.chatId}/message`, { message: 'Plan discussion' });
    const { status, body } = await api('POST', `/api/chats/${created.chatId}/commit`);
    expect(status).toBe(200);
    expect(body.chat).toBeTruthy();
  });

  test('POST /api/chats/:id/commit with no turns returns error', async () => {
    const { body: created } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
    const { status, body } = await api('POST', `/api/chats/${created.chatId}/commit`);
    expect(status).toBe(400);
    expect(body.error).toMatch(/nothing to commit/i);
  });

  test('GET /api/chats lists all chats', async () => {
    await api('POST', '/api/chats', { ticketId: 'TKT-1' });
    await api('POST', '/api/chats', { ticketId: 'TKT-2' });
    const { status, body } = await api('GET', '/api/chats');
    expect(status).toBe(200);
    expect(body.chats).toHaveLength(2);
  });

  test('GET /api/chats/:id returns a single chat', async () => {
    const { body: created } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
    const { status, body } = await api('GET', `/api/chats/${created.chatId}`);
    expect(status).toBe(200);
    expect(body.chat.chatId).toBe(created.chatId);
  });

  test('GET /api/chats/:id returns 404 for unknown', async () => {
    const { status } = await api('GET', '/api/chats/nonexistent');
    expect(status).toBe(404);
  });
});
