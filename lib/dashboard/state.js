// lib/dashboard/state.js
//
// Workspace state store for the dashboard. In-memory map with atomic
// write-through to .bobby/workspaces.json so the dashboard survives restarts.
//
// A workspace represents one ticket being worked on in an isolated git worktree
// by one or more agent runs.
//
// …or, since TKT-014, a REPO RUN: `kind: 'repo'`, no worktree, no branch, no
// ticket, running a freeform agent against the main checkout itself. The two
// share this record because they share everything the app displays — status,
// session, runs, live events — and differ only in what they work on. `kind` is
// what says which; nothing infers it from a null worktreePath.

import fs from 'fs';
import path from 'path';

export const WORKSPACE_STATUSES = [
  'idle',              // created, no agent running
  'running',           // claude subprocess active
  'awaiting_approval', // agent finished, waiting for human to advance pipeline
  'ready_to_merge',    // pipeline complete, ready to merge to main
  'merged',            // worktree merged and removed
  'failed',            // agent errored out or max retries hit
  'no_op',             // agent exited clean having written nothing and moved nothing
  'stopped',           // user manually stopped a run
  'unknown',           // dashboard restarted; process lost
];

/**
 * What a finished run's exit meant. Runs are only ever recorded on exit, so
 * there is no 'running' — see `listRuns`.
 *
 * 'no_op' is its own status rather than a flavour of 'failed' (TKT-062). The
 * measured failure it names — 88 turns, $2.97, exit 0, nothing written — was
 * invisible for exactly as long as a clean exit was allowed to mean success, and
 * folding it into 'failed' would lose the distinction a second time: 'failed' is
 * a CLI that blew up and says so, 'no_op' is a CLI that reported success and
 * achieved nothing. They have different causes and different fixes.
 */
export const RUN_STATUSES = ['completed', 'failed', 'no_op', 'stopped'];

/** How many runs `listRuns` returns when the caller does not say. */
export const DEFAULT_RUNS_LIMIT = 100;
/** The most it will return however loudly the caller asks. */
export const MAX_RUNS_LIMIT = 500;

/**
 * Classify an exit. The single definition of what an exit code and a signal
 * MEAN, shared with the orchestrator's `_terminalStatus` so a run record and
 * the workspace it belongs to can never disagree about the same exit.
 *
 * `producedNothing` is the caller's verdict on whether the run left anything
 * behind — it cannot be read off an exit code, because the whole point is that
 * this run's exit code was 0. Only the caller that can see the worktree and the
 * board may set it, and only when it actually checked: unknown must arrive here
 * as false, never as true, so a no_op is never claimed without evidence.
 * Historical records have no such field, so they classify exactly as before.
 */
export function runOutcome({ exitCode, signal, producedNothing } = {}) {
  if (exitCode === 0) return producedNothing ? 'no_op' : 'completed';
  if (signal === 'SIGTERM' || signal === 'SIGKILL') return 'stopped';
  return 'failed';
}

/**
 * A cost figure, or null.
 *
 * The whole point of this function is the difference between the two. A
 * reported 0 is a FACT — the run was free — and is kept. Anything else
 * (undefined, null, a string, NaN) is the ABSENCE of a figure and becomes
 * null, because an executor that does not report cost must not be made to look
 * like one that reported nothing spent. A total that counted absence as zero
 * would understate itself and never say so.
 */
export function normalizeCostUsd(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Milliseconds between two ISO timestamps, or null if either is unusable. */
function durationBetween(startedAt, endedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return end - start;
}

/**
 * Build a run record — the thing `/api/runs` lists, and the one definition of
 * what a run IS (TKT-017).
 *
 * It carries its own identity and its own parentage rather than relying on
 * where it happens to be stored, so a run pulled out of `workspace.runs[]` and
 * put in a flat list still knows what it belonged to. `ticketId` is null for a
 * repo run, which is a fact about that run and not missing data — repo runs
 * (kind 'repo') are first-class here, not an afterthought.
 *
 * `costUsd` is part of the shape rather than bolted on later (TKT-019): every
 * run answers "what did this cost", including by saying it does not know.
 */
export function newRun({
  workspace, agent, sessionId, startedAt, endedAt, exitCode, signal, error, costUsd,
  producedNothing = false,
}) {
  const seq = (workspace.runs?.length || 0) + 1;
  const ended = endedAt || new Date().toISOString();
  return {
    // Unique and derivable: runs are only ever appended, so a run's position in
    // its workspace never changes once written.
    id: `${workspace.id}-run-${seq}`,
    workspaceId: workspace.id,
    kind: workspace.kind || 'worktree',
    ticketId: workspace.ticketId ?? null,
    agent: agent || null,
    sessionId: sessionId || null,
    startedAt: startedAt || null,
    endedAt: ended,
    durationMs: durationBetween(startedAt, ended),
    status: runOutcome({ exitCode, signal, producedNothing }),
    exitCode: exitCode ?? null,
    signal: signal ?? null,
    error: error || null,
    costUsd: normalizeCostUsd(costUsd),
  };
}

/**
 * Bring a stored run up to the current shape.
 *
 * Records written before `newRun` existed have no id, no parentage, no
 * duration, no status and no cost. They are real history and must not be
 * dropped, so the fields that can be derived are derived and the one that
 * cannot — cost — becomes null rather than 0. `kind` defaults to 'worktree'
 * because every record predating the field was one.
 */
function normalizeRun(run, workspace, index) {
  const startedAt = run.startedAt || null;
  const endedAt = run.endedAt || null;
  return {
    ...run,
    id: run.id || `${workspace.id}-run-${index + 1}`,
    workspaceId: run.workspaceId || workspace.id,
    kind: run.kind || workspace.kind || 'worktree',
    ticketId: run.ticketId ?? workspace.ticketId ?? null,
    agent: run.agent || null,
    sessionId: run.sessionId || null,
    startedAt,
    endedAt,
    durationMs: run.durationMs ?? durationBetween(startedAt, endedAt),
    status: run.status || runOutcome(run),
    exitCode: run.exitCode ?? null,
    signal: run.signal ?? null,
    error: run.error || null,
    costUsd: normalizeCostUsd(run.costUsd),
  };
}

/** Clamp a caller-supplied limit. Nonsense falls back to the default. */
function resolveLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RUNS_LIMIT;
  return Math.min(Math.floor(n), MAX_RUNS_LIMIT);
}

/**
 * Every run across every workspace, newest first, filtered and paged (TKT-017).
 *
 * ORDERING is newest-ended first: this is a history, and the question asked of
 * a history is almost always "what just happened". Ties break on id so the
 * order is stable across calls — two runs can share an `endedAt` when a test or
 * a fast agent finishes inside the same millisecond.
 *
 * PAGING is not optional. `workspace.runs[]` grows for the life of a project
 * and nothing prunes it, so an unbounded list is a response that gets slower
 * every week and eventually stops fitting anywhere. `limit` defaults to 100 and
 * is capped at 500.
 *
 * TOTALS are computed over the whole FILTERED set, never over the page — a
 * per-ticket cost that changed when you turned the page would be worse than no
 * cost at all. `runsWithoutCost` is the honest part: it says how much of the
 * set the total could not account for, and `costUsd` is null rather than 0 when
 * that is all of it.
 */
export function listRuns(workspaces, { ticketId, status, limit, offset } = {}) {
  const all = [];
  for (const ws of workspaces || []) {
    (ws.runs || []).forEach((run, i) => all.push(normalizeRun(run, ws, i)));
  }

  const filtered = all.filter((run) => {
    if (ticketId && run.ticketId !== ticketId) return false;
    if (status && run.status !== status) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const byEnd = (b.endedAt || '').localeCompare(a.endedAt || '');
    return byEnd !== 0 ? byEnd : (b.id || '').localeCompare(a.id || '');
  });

  const withCost = filtered.filter(r => r.costUsd !== null);
  const summed = withCost.reduce((sum, r) => sum + r.costUsd, 0);

  const resolvedLimit = resolveLimit(limit);
  const resolvedOffset = Math.max(0, Math.floor(Number(offset)) || 0);

  return {
    runs: filtered.slice(resolvedOffset, resolvedOffset + resolvedLimit),
    total: filtered.length,
    limit: resolvedLimit,
    offset: resolvedOffset,
    totals: {
      runs: filtered.length,
      // Rounded because summing floats gives 0.30000000000000004, and null
      // rather than 0 when there was nothing to sum — see normalizeCostUsd.
      costUsd: withCost.length ? Math.round(summed * 1e6) / 1e6 : null,
      runsWithCost: withCost.length,
      runsWithoutCost: filtered.length - withCost.length,
    },
  };
}

/**
 * Create an empty workspace object. `id`, `ticketId`, `worktreePath`, `branch`
 * are required at construction time because they define the identity of the
 * workspace; everything else is mutated as the workspace runs.
 */
export function newWorkspace({ id, ticketId, worktreePath, branch, agent, pipeline = 'default', kind = 'worktree', repoRoot = null, lockFile = null }) {
  const now = new Date().toISOString();
  return {
    id,
    // What this record works on: 'worktree' (one ticket, its own worktree and
    // branch) or 'repo' (the main checkout itself, no ticket, no worktree).
    // Records written before the field existed have none; `isRepoRun` reads a
    // missing value as 'worktree', which is what every one of them was.
    kind,
    ticketId,
    worktreePath,
    branch,
    // The repo this workspace's code lives in, resolved once at createWorkspace
    // (TKT-069). In a studio a ticket's code can live in a repo other than the
    // launch repo; every per-workspace git op (worktree, branch, lock, diff,
    // merge, discard) acts against THIS repo. `lockFile` is that repo's
    // main-checkout lock. Both null for repo runs and for records written before
    // this field existed — consumers fall back to the orchestrator's own
    // `this.repoRoot` / `this.lockFile`, which is exactly today's behavior.
    repoRoot,
    lockFile,
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
    // When this workspace's branch went into main. Null until it does. The
    // DURABLE record of that fact is the ticket's own `mergedAt` frontmatter
    // (TKT-013) — this field is the dashboard's log of when IT did the merge,
    // and dies with the record when the workspace is discarded.
    mergedAt: null,
    runs: [],       // run records — see newRun() for the shape
    checkpoints: [], // [{ turn, sha, message, at }]
    lastError: null,
    // Chat fields (TKT-021): conversational planning via executor --resume.
    // chatId is the Claude session id used for --resume continuity.
    // chatMode flags a workspace that is in a conversational planning session.
    // chatHistory is a timeline of {role, summary, at} entries for the UI.
    chatId: null,
    chatMode: false,
    chatHistory: [],
  };
}

/**
 * A repo run. The nulls are the point rather than missing data: there is no
 * ticket to advance, no branch to compare, and no worktree to merge or discard.
 * The agent works in the main checkout, so its output is already where a
 * merge would have put it.
 */
export function newRepoRun({ id, agent, pipeline = 'default' }) {
  return newWorkspace({
    id,
    ticketId: null,
    worktreePath: null,
    branch: null,
    agent,
    pipeline,
    kind: 'repo',
  });
}

/** Does this record run against the main checkout? Missing kind = 'worktree'. */
export function isRepoRun(workspace) {
  return !!workspace && workspace.kind === 'repo';
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

/**
 * Generate a repo run id. A distinct `repo-` prefix rather than `ws-`, because
 * a repo run has no ticket to name it after and the id shows up in logs and
 * error messages where "which kind is this" is the first question.
 * Format: repo-ux-a3f
 */
export function makeRepoRunId(agent) {
  const suffix = Math.random().toString(36).slice(2, 5);
  return `repo-${agent}-${suffix}`;
}
