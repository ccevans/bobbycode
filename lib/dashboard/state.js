// lib/dashboard/state.js
//
// Workspace state store for the dashboard. In-memory map with atomic
// write-through to .bobby/workspaces.json so the dashboard survives restarts.
//
// A workspace represents one ticket being worked on in an isolated git worktree
// by one or more agent runs.

import fs from 'fs';
import path from 'path';

export const WORKSPACE_STATUSES = [
  'idle',              // created, no agent running
  'running',           // claude subprocess active
  'awaiting_approval', // agent finished, waiting for human to advance pipeline
  'ready_to_merge',    // pipeline complete, ready to merge to main
  'merged',            // worktree merged and removed
  'failed',            // agent errored out or max retries hit
  'stopped',           // user manually stopped a run
  'unknown',           // dashboard restarted; process lost
];

/**
 * Create an empty workspace object. `id`, `ticketId`, `worktreePath`, `branch`
 * are required at construction time because they define the identity of the
 * workspace; everything else is mutated as the workspace runs.
 */
export function newWorkspace({ id, ticketId, worktreePath, branch, agent, pipeline = 'default' }) {
  const now = new Date().toISOString();
  return {
    id,
    ticketId,
    worktreePath,
    branch,
    agent: agent || null,
    pipeline,
    stage: null,
    status: 'idle',
    pid: null,
    sessionId: null,
    startedAt: null,
    lastTurnAt: null,
    createdAt: now,
    updatedAt: now,
    runs: [],       // [{ agent, sessionId, startedAt, endedAt, status, exitCode }]
    checkpoints: [], // [{ turn, sha, message, at }]
    lastError: null,
  };
}

/**
 * WorkspaceStore — in-memory map with atomic JSON persistence. Not thread-safe
 * (Node single-threaded), but write-through is atomic via tmp-file + rename so
 * a crash mid-write leaves the previous state intact.
 */
export class WorkspaceStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.workspaces = new Map();
    this.listeners = new Set();
  }

  /**
   * Load state from disk. Silently returns empty state if file doesn't exist
   * or is corrupt (logs a warning to stderr in the corrupt case).
   */
  load() {
    if (!fs.existsSync(this.filePath)) {
      this.workspaces = new Map();
      return this;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const map = new Map();
      for (const [id, ws] of Object.entries(parsed.workspaces || {})) {
        map.set(id, ws);
      }
      this.workspaces = map;
    } catch (e) {
      process.stderr.write(`[bobby dashboard] corrupt workspaces.json (${e.message}), starting empty\n`);
      this.workspaces = new Map();
    }
    return this;
  }

  /**
   * Atomic persist: write to tmp file then rename into place.
   */
  save() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      workspaces: Object.fromEntries(this.workspaces),
    };
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Subscribe to state changes. Returns an unsubscribe function. Listeners
   * receive `(event, workspace)` where event is 'create'|'update'|'delete'.
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event, workspace) {
    for (const fn of this.listeners) {
      try { fn(event, workspace); } catch { /* listener errors are isolated */ }
    }
  }

  list() {
    return Array.from(this.workspaces.values()).sort((a, b) => {
      // newest updates first
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }

  get(id) {
    return this.workspaces.get(id) || null;
  }

  create(workspace) {
    if (this.workspaces.has(workspace.id)) {
      throw new Error(`Workspace ${workspace.id} already exists`);
    }
    this.workspaces.set(workspace.id, workspace);
    this.save();
    this._emit('create', workspace);
    return workspace;
  }

  /**
   * Shallow-merge `patch` into the workspace and persist. `patch` may include
   * any subset of workspace fields except `id`.
   */
  update(id, patch) {
    const existing = this.workspaces.get(id);
    if (!existing) throw new Error(`Workspace ${id} not found`);
    const updated = {
      ...existing,
      ...patch,
      id: existing.id, // id is immutable
      updatedAt: new Date().toISOString(),
    };
    this.workspaces.set(id, updated);
    this.save();
    this._emit('update', updated);
    return updated;
  }

  /**
   * Append to the workspace's run history.
   */
  appendRun(id, run) {
    const existing = this.workspaces.get(id);
    if (!existing) throw new Error(`Workspace ${id} not found`);
    const runs = [...(existing.runs || []), run];
    return this.update(id, { runs });
  }

  /**
   * Append a checkpoint (git commit sha) to the workspace.
   */
  appendCheckpoint(id, checkpoint) {
    const existing = this.workspaces.get(id);
    if (!existing) throw new Error(`Workspace ${id} not found`);
    const checkpoints = [...(existing.checkpoints || []), {
      ...checkpoint,
      at: checkpoint.at || new Date().toISOString(),
    }];
    return this.update(id, { checkpoints });
  }

  delete(id) {
    const existing = this.workspaces.get(id);
    if (!existing) return false;
    this.workspaces.delete(id);
    this.save();
    this._emit('delete', existing);
    return true;
  }

  /**
   * Mark any workspaces that were `running` at load time as `unknown`, since
   * the subprocess that was running them is dead when the dashboard restarts.
   * Call this once immediately after load().
   */
  reconcileAfterRestart() {
    for (const ws of this.workspaces.values()) {
      if (ws.status === 'running') {
        this.update(ws.id, {
          status: 'unknown',
          pid: null,
          lastError: 'Dashboard restarted — previous run status lost. Re-run the agent or discard the workspace.',
        });
      }
    }
  }
}

/**
 * Generate a workspace id from ticket id + stage + a short random suffix.
 * Format: ws-TKT-155-building-a3f
 */
export function makeWorkspaceId(ticketId, stage = 'idle') {
  const suffix = Math.random().toString(36).slice(2, 5);
  return `ws-${ticketId}-${stage}-${suffix}`;
}
