// test/lib/dashboard/chat-api.test.js
//
// TKT-021: the chat HTTP routes, exercised over real HTTP with a stub
// ChatManager (the manager's own behaviour is chat.test.js's job). Asserts the
// route shapes the app depends on, and that the routes 501 when no manager is
// wired rather than 404.
import { buildServer } from '../../../lib/dashboard/server.js';

const baseDeps = () => ({
  orchestrator: {},
  store: { list: () => [], get: () => null, subscribe: () => {} },
  sseHub: { connect: () => () => {}, broadcast: () => {} },
  config: { ticket_prefix: 'TKT' },
  repoRoot: '/tmp',
  ticketsDir: '/tmp/.bobby/tickets',
});

function stubChatManager() {
  const chats = new Map();
  return {
    calls: [],
    startChat(ticketId) {
      const chat = { id: 'chat-1', ticketId, workspaceId: 'chat-1', status: 'idle', history: [] };
      chats.set(chat.id, chat);
      this.calls.push(['start', ticketId]);
      return chat;
    },
    listChats() { return Array.from(chats.values()); },
    getChat(id) { return chats.get(id) || null; },
    async sendMessage(id, message) {
      this.calls.push(['message', id, message]);
      const chat = chats.get(id);
      if (!chat) throw new Error(`Chat ${id} not found`);
      chat.history.push({ role: 'user', summary: message, at: 'now' });
      return chat;
    },
    async commitPlan(id) {
      this.calls.push(['commit', id]);
      const chat = chats.get(id);
      if (!chat) throw new Error(`Chat ${id} not found`);
      chat.status = 'idle';
      return chat;
    },
  };
}

async function withServer(deps, fn) {
  const server = buildServer(deps);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(api); }
  // Drop undici's keep-alive socket before closing. On Node 18 `close()` waits
  // on the idle client connection `fetch` leaves open, so its callback never
  // fires and every test here times out — see server-api.test.js, same pattern.
  finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

describe('chat routes (TKT-021)', () => {
  test('TC-8: POST /api/chats starts a chat and returns chatId/ticketId/status', async () => {
    const chatManager = stubChatManager();
    await withServer({ ...baseDeps(), chatManager }, async (api) => {
      const { status, body } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
      expect(status).toBe(200);
      expect(body.chatId).toBe('chat-1');
      expect(body.ticketId).toBe('TKT-TEST');
      expect(body.status).toBe('idle');
    });
  });

  test('POST /api/chats without ticketId is a 400', async () => {
    const chatManager = stubChatManager();
    await withServer({ ...baseDeps(), chatManager }, async (api) => {
      const { status } = await api('POST', '/api/chats', {});
      expect(status).toBe(400);
    });
  });

  test('TC-9: POST /api/chats/:id/message sends a turn and grows the history', async () => {
    const chatManager = stubChatManager();
    await withServer({ ...baseDeps(), chatManager }, async (api) => {
      const started = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
      const id = started.body.chatId;
      const { status, body } = await api('POST', `/api/chats/${id}/message`, { message: 'Use a simpler approach' });
      expect(status).toBe(200);
      expect(body.chat.history).toHaveLength(1);
      expect(body.chat.history[0].summary).toBe('Use a simpler approach');
    });
  });

  test('message to an unknown chat is a 404', async () => {
    const chatManager = stubChatManager();
    await withServer({ ...baseDeps(), chatManager }, async (api) => {
      const { status } = await api('POST', '/api/chats/nope/message', { message: 'hi' });
      expect(status).toBe(404);
    });
  });

  test('TC-10: POST /api/chats/:id/commit finalizes the plan', async () => {
    const chatManager = stubChatManager();
    await withServer({ ...baseDeps(), chatManager }, async (api) => {
      const started = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
      const id = started.body.chatId;
      const { status, body } = await api('POST', `/api/chats/${id}/commit`);
      expect(status).toBe(200);
      expect(body.chat.status).toBe('idle');
      expect(chatManager.calls).toContainEqual(['commit', id]);
    });
  });

  test('GET /api/chats and GET /api/chats/:id return the chat', async () => {
    const chatManager = stubChatManager();
    await withServer({ ...baseDeps(), chatManager }, async (api) => {
      const started = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
      const id = started.body.chatId;
      const list = await api('GET', '/api/chats');
      expect(list.body.chats).toHaveLength(1);
      const one = await api('GET', `/api/chats/${id}`);
      expect(one.body.chat.id).toBe(id);
      const missing = await api('GET', '/api/chats/nope');
      expect(missing.status).toBe(404);
    });
  });

  test('chat routes 501 when no ChatManager is wired', async () => {
    await withServer(baseDeps(), async (api) => {
      const { status } = await api('POST', '/api/chats', { ticketId: 'TKT-TEST' });
      expect(status).toBe(501);
    });
  });
});
