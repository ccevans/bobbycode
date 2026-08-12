// lib/dashboard/chat.js
//
// ChatManager — conversational planning via executor --resume (TKT-021).
//
// A chat session IS a workspace in `plan` mode with `--resume` enabled.
// ChatManager wraps the orchestrator's workspace creation and runAgent calls,
// adding: chatId tracking (the Claude session id for --resume), chatHistory
// (a timeline for the UI), and persistence to .bobby/chats.json.
//
// Persistence follows the same pattern as WorkspaceStore: in-memory map with
// atomic write-through via tmp-file + rename.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Generate a short chat id. Format: chat-<8 hex chars>
 */
function makeChatId() {
  return `chat-${crypto.randomBytes(4).toString('hex')}`;
}

export class ChatManager {
  /**
   * @param {object} opts
   * @param {import('./state.js').WorkspaceStore} opts.store - workspace store
   * @param {import('./orchestrator.js').Orchestrator} opts.orchestrator
   * @param {string} opts.chatsFile - path to .bobby/chats.json
   */
  constructor({ store, orchestrator, chatsFile }) {
    this.store = store;
    this.orchestrator = orchestrator;
    this.chatsFile = chatsFile;
    this.chats = new Map();
    this._load();
  }

  /**
   * Load chat metadata from disk. Silently starts empty if file is missing
   * or corrupt.
   */
  _load() {
    if (!fs.existsSync(this.chatsFile)) {
      this.chats = new Map();
      return;
    }
    try {
      const raw = fs.readFileSync(this.chatsFile, 'utf8');
      const parsed = JSON.parse(raw);
      this.chats = new Map(Object.entries(parsed.chats || {}));
    } catch {
      this.chats = new Map();
    }
  }

  /**
   * Atomic persist: write to tmp file then rename into place.
   */
  _save() {
    const dir = path.dirname(this.chatsFile);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.chatsFile}.tmp`;
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      chats: Object.fromEntries(this.chats),
    };
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, this.chatsFile);
  }

  /**
   * Start a new chat session for a ticket.
   *
   * Creates a workspace with chatMode: true. The workspace is created in idle
   * status, ready for the first sendMessage call.
   *
   * @param {string} ticketId
   * @returns {{ chatId: string, workspaceId: string, ticketId: string }}
   */
  async startChat(ticketId) {
    const chatId = makeChatId();

    // Create the workspace via the orchestrator
    const ws = this.orchestrator.createWorkspace({
      ticketId,
      agent: 'plan',
      pipelineName: 'default',
    });

    // Mark the workspace as a chat session
    this.store.update(ws.id, {
      chatMode: true,
      chatHistory: [],
    });

    // Store chat metadata
    const chatMeta = {
      chatId,
      workspaceId: ws.id,
      ticketId,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    this.chats.set(chatId, chatMeta);
    this._save();

    return { chatId, workspaceId: ws.id, ticketId };
  }

  /**
   * Send a message in an existing chat. Calls runAgent with plan permission
   * mode and --resume (after the first turn).
   *
   * @param {string} chatId
   * @param {string} message
   */
  async sendMessage(chatId, message) {
    const meta = this.chats.get(chatId);
    if (!meta) throw new Error(`Chat ${chatId} not found`);

    const ws = this.store.get(meta.workspaceId);
    if (!ws) throw new Error(`Workspace ${meta.workspaceId} for chat ${chatId} not found`);

    // Append the user message to chat history
    const entry = {
      role: 'user',
      summary: message,
      at: new Date().toISOString(),
    };
    const history = [...(ws.chatHistory || []), entry];
    this.store.update(meta.workspaceId, { chatHistory: history });

    // Call runAgent. On subsequent turns, pass the Claude session id for --resume.
    const runOpts = {};
    if (ws.chatId) {
      runOpts.resume = ws.chatId;
    }
    runOpts.permissionMode = 'plan';

    await this.orchestrator.runAgent(meta.workspaceId, runOpts);

    this._save();
  }

  /**
   * Commit the plan: run one final agent turn with --resume but WITHOUT plan
   * mode restriction, so the agent can write plan.md and test-cases.md.
   *
   * @param {string} chatId
   */
  async commitPlan(chatId) {
    const meta = this.chats.get(chatId);
    if (!meta) throw new Error(`Chat ${chatId} not found`);

    const ws = this.store.get(meta.workspaceId);
    if (!ws) throw new Error(`Workspace ${meta.workspaceId} for chat ${chatId} not found`);

    // Must have at least one message before committing
    if (!ws.chatHistory || ws.chatHistory.length === 0) {
      throw new Error(`Nothing to commit — chat ${chatId} has no messages yet`);
    }

    // Append a system entry recording the commit action
    const commitEntry = {
      role: 'system',
      summary: 'Plan commit requested — writing plan.md and test-cases.md',
      at: new Date().toISOString(),
    };
    const history = [...(ws.chatHistory || []), commitEntry];
    this.store.update(meta.workspaceId, { chatHistory: history });

    // Final run: --resume with write permissions (no plan restriction)
    const runOpts = {};
    if (ws.chatId) {
      runOpts.resume = ws.chatId;
    }
    // No permissionMode: 'plan' — let the agent write

    await this.orchestrator.runAgent(meta.workspaceId, runOpts);

    // Mark chat as committed
    meta.status = 'committed';
    this.chats.set(chatId, meta);
    this._save();
  }

  /**
   * Get a single chat by id.
   * @param {string} chatId
   * @returns {object|null}
   */
  getChat(chatId) {
    return this.chats.get(chatId) || null;
  }

  /**
   * List all chats.
   * @returns {object[]}
   */
  listChats() {
    return Array.from(this.chats.values());
  }
}
