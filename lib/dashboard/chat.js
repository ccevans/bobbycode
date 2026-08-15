// lib/dashboard/chat.js
//
// ChatManager — conversational planning (TKT-021).
//
// A chat is a planning conversation about one ticket. It IS an ordinary
// workspace running in `plan` (read-only) permission mode with `--resume`
// enabled, so the agent keeps full context across turns and cannot write files
// while you are still arguing. When the plan is settled, `commitPlan` runs one
// more turn WITHOUT the plan restriction, and the agent writes plan.md and
// test-cases.md.
//
// The orchestrator owns each run (`runChatTurn`). This manager owns the chat
// records: which workspace backs a chat, its status, and the message timeline —
// persisted to `.bobby/chats.json`, parallel to workspaces.json, so a chat and
// its history survive an app restart.

import fs from 'fs';
import path from 'path';

export class ChatManager {
  constructor({ orchestrator, filePath }) {
    if (!orchestrator) throw new Error('ChatManager: orchestrator is required');
    if (!filePath) throw new Error('ChatManager: filePath is required');
    this.orchestrator = orchestrator;
    this.filePath = filePath;
    /** @type {Map<string, object>} chatId → chat record */
    this.chats = new Map();
    this.load();
  }

  /** Load chats from disk. Empty on a missing file; empty + warn on a corrupt one. */
  load() {
    if (!fs.existsSync(this.filePath)) {
      this.chats = new Map();
      return this;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.chats = new Map(Object.entries(parsed.chats || {}));
    } catch (e) {
      process.stderr.write(`[bobby dashboard] corrupt chats.json (${e.message}), starting empty\n`);
      this.chats = new Map();
    }
    return this;
  }

  /** Atomic persist: tmp file then rename, same shape as WorkspaceStore.save. */
  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      chats: Object.fromEntries(this.chats),
    };
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Start a chat for a ticket. Creates the backing workspace (in `plan` mode,
   * no agent has run yet) and records the chat. The chat id IS the workspace id
   * — one backs exactly one, and sharing the id spares a mapping layer.
   */
  startChat(ticketId) {
    const ws = this.orchestrator.createWorkspace({ ticketId, agent: 'plan' });
    this.orchestrator.store.update(ws.id, { chatMode: true, chatHistory: [] });
    const now = new Date().toISOString();
    const chat = {
      id: ws.id,
      ticketId,
      workspaceId: ws.id,
      status: 'idle',
      chatSessionId: null,   // the Claude session id, once the first turn captures it
      history: [],           // [{ role, summary, at }]
      createdAt: now,
      updatedAt: now,
    };
    this.chats.set(chat.id, chat);
    this.save();
    return chat;
  }

  /** A chat by id, or null. */
  getChat(chatId) {
    return this.chats.get(chatId) || null;
  }

  /** Every chat, newest-updated first. */
  listChats() {
    return Array.from(this.chats.values())
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  /**
   * Send a message: run one discussion turn (plan mode) and wait for it. The
   * agent resumes the conversation, so it has every prior turn's context.
   */
  async sendMessage(chatId, message) {
    const chat = this._require(chatId);
    if (!message || !String(message).trim()) throw new Error('message is required');
    const { workspace } = await this.orchestrator.runChatTurn(chat.workspaceId, { message, mode: 'plan' });
    return this._syncFromWorkspace(chat, workspace);
  }

  /**
   * Commit the plan: one final turn WITHOUT the plan-mode restriction, so the
   * agent writes plan.md and test-cases.md from the conversation. Refuses a chat
   * with no turns — there is nothing agreed to write.
   */
  async commitPlan(chatId) {
    const chat = this._require(chatId);
    if (!chat.history.some(h => h.role === 'user')) {
      throw new Error(`Chat ${chatId} has no turns to commit — send a message first.`);
    }
    const { workspace } = await this.orchestrator.runChatTurn(chat.workspaceId, { mode: 'commit' });
    return this._syncFromWorkspace(chat, workspace);
  }

  /** The chat, or an error that names the id the caller asked for. */
  _require(chatId) {
    const chat = this.chats.get(chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    return chat;
  }

  /** Mirror the backing workspace's chat state onto the persisted chat record. */
  _syncFromWorkspace(chat, ws) {
    chat.chatSessionId = ws.chatId || chat.chatSessionId;
    chat.history = [...(ws.chatHistory || [])];
    chat.status = ws.status;
    chat.updatedAt = new Date().toISOString();
    this.chats.set(chat.id, chat);
    this.save();
    return chat;
  }
}
