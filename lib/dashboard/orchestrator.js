// lib/dashboard/orchestrator.js
//
// Per-workspace orchestrator. Owns the lifecycle of a workspace:
//   - create worktree
//   - build prompt via pipeline.buildPromptFor
//   - init a bobby session
//   - launch executor (claude subprocess)
//   - forward events to SSE hub + JSONL session log
//   - on exit, detect stage advancement by reading ticket frontmatter in the worktree
//   - apply FSM transitions (idle → running → awaiting_approval → running → …)
//
// Keeps a registry of active child processes so the dashboard can stop them
// cleanly on shutdown.

import path from 'path';
import fs from 'fs';
import { buildPromptFor, resolveWorkflow, resolveNextAgent } from '../workflow.js';
import { initSession, logEntry } from '../session.js';
import { findTicket, getFeatureTickets } from '../tickets.js';
import {
  createWorktree,
  removeWorktree,
  computeWorktreePlacement,
  commitCheckpoint,
  diffAgainstMain,
  changedFiles,
  mergeToMain,
  detectMainBranch,
} from './worktree.js';
import { runAgent, resolveExecutor } from './executor.js';
import { newWorkspace, makeWorkspaceId } from './state.js';

/**
 * How many agents one orchestrator may have in flight at once when
 * `dashboard.max_concurrent` is not configured. Every running agent is a CLI
 * subprocess spending real tokens on the user's own subscription, so the
 * default is deliberately low.
 */
export const DEFAULT_MAX_CONCURRENT = 4;

export class Orchestrator {
  constructor({ repoRoot, config, ticketsDir, sessionsDir, agentsPath, store, sseHub, pipeline, pipelineName = 'default' }) {
    this.repoRoot = repoRoot;
    this.config = config;
    this.ticketsDir = ticketsDir;
    this.sessionsDir = sessionsDir;
    this.agentsPath = agentsPath;
    this.store = store;
    this.sseHub = sseHub;
    this.pipeline = pipeline;
    this.pipelineName = pipelineName;
    /** @type {Map<string, { stop: () => void, done: Promise<any>, pid: number }>} */
    this.runningProcesses = new Map();
  }

  /**
   * Create a new workspace for a ticket. Creates the git worktree and stores
   * the initial workspace record. Does NOT start running the agent.
   */
  createWorkspace({ ticketId, agent = 'plan', pipelineName }) {
    const ticket = findTicket(this.ticketsDir, ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    // Fail on an unknown workflow now, not mid-run when approve() tries to
    // advance through it.
    if (pipelineName) resolveWorkflow(this.config, pipelineName);

    const stageForBranch = agent === 'workflow' ? 'workflow' : agent;
    const { worktreePath, branch } = computeWorktreePlacement(
      this.repoRoot,
      this.config,
      ticketId,
      stageForBranch
    );

    createWorktree(this.repoRoot, { worktreePath, branch });

    const id = makeWorkspaceId(ticketId, stageForBranch);
    const workspace = newWorkspace({
      id,
      ticketId,
      worktreePath,
      branch,
      agent,
      pipeline: pipelineName || this.pipelineName,
    });
    workspace.stage = ticket.data.stage;
    this.store.create(workspace);
    this._logSessionEvent(workspace.id, { type: 'workspace_created', ticketId, worktreePath, branch, agent });
    return workspace;
  }

  /**
   * Start running the currently-queued agent for a workspace. Returns the
   * updated workspace. Throws if the workspace is already running.
   */
  async runAgent(workspaceId, { agentOverride } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (ws.status === 'running') throw new Error(`Workspace ${workspaceId} is already running`);
    if (this.runningProcesses.has(workspaceId)) {
      throw new Error(`Workspace ${workspaceId} already has an active process`);
    }

    const agent = agentOverride || ws.agent;
    if (!agent) throw new Error(`No agent set on workspace ${workspaceId}`);

    this._assertConcurrencyHeadroom();

    // Verify the ticket still exists and read its current stage from the WORKTREE
    // so we pick the right prompt for where the work actually is.
    const worktreeTicketsDir = path.join(ws.worktreePath, this.config.tickets_dir || '.bobby/tickets');
    const ticket = findTicket(worktreeTicketsDir, ws.ticketId)
      || findTicket(this.ticketsDir, ws.ticketId);
    if (!ticket) throw new Error(`Ticket ${ws.ticketId} not found in worktree or main repo`);

    // Init a bobby session — session log file lives in the MAIN repo's .bobby/sessions
    // so the dashboard can tail it regardless of which worktree is active.
    const sessionId = initSession(this.sessionsDir, {
      ticketIds: [ws.ticketId],
      agent,
      pipeline: ws.pipeline || this.pipelineName,
    });

    // Build prompt via the unified dispatcher. For feature mode, treat the
    // workspace's ticket id as an epic and resolve children.
    const hasServices = !!(this.config.services && Object.keys(this.config.services).length > 0);
    let epicData;
    if (agent === 'feature') {
      try {
        const { epic, children } = getFeatureTickets(worktreeTicketsDir, ws.ticketId);
        epicData = { epicId: ws.ticketId, epic, children };
      } catch (e) {
        throw new Error(`Feature mode requires an epic ticket. ${e.message}`);
      }
    }
    const built = buildPromptFor(agent, [ws.ticketId], {
      config: this.config,
      ticketsDir: worktreeTicketsDir,
      ticketsRelDir: this.config.tickets_dir || '.bobby/tickets',
      agentsPath: this.agentsPath,
      workflow: this._pipelineFor(ws),
      maxRetries: 3,
      hasServices,
      epicData,
      gitConventions: this.config.git_conventions || {},
    });

    // Mark running
    this.store.update(workspaceId, {
      agent,
      status: 'running',
      sessionId,
      startedAt: new Date().toISOString(),
      lastError: null,
    });
    this._broadcast(workspaceId, 'run_start', { agent, sessionId, prompt: built.prompt });

    // Launch executor
    const executor = resolveExecutor(this.config);
    const handle = this._runExecutor({
      worktreePath: ws.worktreePath,
      prompt: built.prompt,
      sessionId,
      executor: executor.name,
      model: this.config.dashboard?.model,
      // Unset by default, which leaves each CLI in its own default permission
      // posture. Opt in via dashboard.permission_mode to let agents work
      // unattended — worktrees isolate them, but this still grants write access.
      permissionMode: this.config.dashboard?.permission_mode,
      onEvent: (ev) => this._onExecutorEvent(workspaceId, sessionId, ev),
    });

    this.runningProcesses.set(workspaceId, handle);
    this.store.update(workspaceId, { pid: handle.pid });

    // Attach exit handler — don't await here, let it run
    handle.done.then((result) => this._onExit(workspaceId, agent, sessionId, result))
      .catch((e) => this._onExit(workspaceId, agent, sessionId, { exitCode: null, signal: null, error: e.message }));

    return this.store.get(workspaceId);
  }

  _onExecutorEvent(workspaceId, sessionId, ev) {
    // Mirror into JSONL log
    try {
      logEntry(this.sessionsDir, sessionId, { type: `exec_${ev.type}`, ...ev });
    } catch { /* logging must never crash the dashboard */ }
    this.store.update(workspaceId, { lastTurnAt: new Date().toISOString() });
    this._broadcast(workspaceId, 'exec_event', ev);
  }

  async _onExit(workspaceId, agent, sessionId, result) {
    this.runningProcesses.delete(workspaceId);
    const ws = this.store.get(workspaceId);
    if (!ws) return;

    const runRecord = {
      agent,
      sessionId,
      startedAt: ws.startedAt,
      endedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      signal: result.signal,
      error: result.error || null,
    };

    // Read ticket stage from the worktree to detect advancement
    const worktreeTicketsDir = path.join(ws.worktreePath, this.config.tickets_dir || '.bobby/tickets');
    const ticket = findTicket(worktreeTicketsDir, ws.ticketId);
    const newStage = ticket?.data?.stage || null;
    const stageAdvanced = newStage && newStage !== ws.stage;

    // Commit a checkpoint so the diff viewer always reflects a committed state.
    let checkpointSha = null;
    try {
      checkpointSha = commitCheckpoint(ws.worktreePath, `bobby ${agent}: ${ws.ticketId} → ${newStage || 'work'}`);
    } catch (e) {
      // Commit failures are non-fatal — log and continue.
      runRecord.checkpointError = e.message;
    }

    let nextStatus = 'failed';
    if (result.exitCode === 0) {
      nextStatus = stageAdvanced ? 'awaiting_approval' : 'idle';
      if (newStage === 'shipping' || newStage === 'done') {
        nextStatus = 'ready_to_merge';
      }
    } else if (result.signal === 'SIGTERM' || result.signal === 'SIGKILL') {
      nextStatus = 'stopped';
    }

    const patch = {
      status: nextStatus,
      stage: newStage || ws.stage,
      pid: null,
      runs: [...(ws.runs || []), runRecord],
    };
    if (checkpointSha) {
      patch.checkpoints = [
        ...(ws.checkpoints || []),
        {
          turn: (ws.checkpoints?.length || 0) + 1,
          sha: checkpointSha,
          message: `${agent}: ${newStage || 'no stage change'}`,
          at: new Date().toISOString(),
        },
      ];
    }
    if (result.exitCode !== 0 && result.exitCode !== null) {
      patch.lastError = `claude exited with code ${result.exitCode}`;
    } else if (result.error) {
      patch.lastError = result.error;
    }

    this.store.update(workspaceId, patch);
    this._broadcast(workspaceId, 'run_end', { result, stageAdvanced, newStage, nextStatus });

    // Auto-approve: if the config says to auto-advance past this stage, kick off
    // the next agent immediately.
    if (nextStatus === 'awaiting_approval') {
      const autoApproveStages = this.config?.dashboard?.auto_approve_stages || [];
      if (autoApproveStages.includes(ws.stage)) {
        try {
          await this.approve(workspaceId);
        } catch (e) {
          this._broadcast(workspaceId, 'auto_approve_failed', { error: e.message });
        }
      }
    }
  }

  /**
   * Approve the workspace → queue and run the next agent in the pipeline.
   */
  async approve(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (ws.status !== 'awaiting_approval' && ws.status !== 'idle') {
      throw new Error(`Cannot approve workspace in status '${ws.status}'`);
    }
    const nextAgent = this._resolveNextAgent(ws);
    if (!nextAgent) {
      // Nothing more to do — mark ready to merge
      this.store.update(workspaceId, { status: 'ready_to_merge' });
      this._broadcast(workspaceId, 'ready_to_merge', {});
      return this.store.get(workspaceId);
    }
    return this.runAgent(workspaceId, { agentOverride: nextAgent });
  }

  /**
   * Reject the current work — re-run the build agent to fix whatever was flagged.
   */
  async reject(workspaceId, { reason } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    this.store.update(workspaceId, { lastError: reason || 'rejected by user' });
    return this.runAgent(workspaceId, { agentOverride: 'build' });
  }

  /**
   * Stop an in-flight agent. Sends SIGTERM; after 5s the executor escalates
   * to SIGKILL. Resolves when the process has actually exited.
   */
  async stop(workspaceId) {
    const handle = this.runningProcesses.get(workspaceId);
    if (!handle) {
      // Nothing running — just flip status if needed
      const ws = this.store.get(workspaceId);
      if (ws && ws.status === 'running') {
        this.store.update(workspaceId, { status: 'stopped', pid: null });
      }
      return;
    }
    handle.stop();
    await handle.done;
  }

  /**
   * Stop all running workspaces. Used on dashboard shutdown.
   */
  async stopAll() {
    const ids = Array.from(this.runningProcesses.keys());
    await Promise.all(ids.map(id => this.stop(id).catch(() => {})));
  }

  /**
   * Merge the workspace's branch into main, then remove the worktree.
   */
  async merge(workspaceId, { message } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (ws.status === 'running') throw new Error('Cannot merge a running workspace — stop it first');

    const mergeResult = mergeToMain(this.repoRoot, ws.branch, { message });
    // Remove worktree (branch is retained until explicit delete, so revert is possible)
    removeWorktree(this.repoRoot, ws.worktreePath, { deleteBranch: false });

    this.store.update(workspaceId, {
      status: 'merged',
      pid: null,
      lastError: null,
    });
    this._broadcast(workspaceId, 'merged', mergeResult);
    return this.store.get(workspaceId);
  }

  /**
   * Discard a workspace: remove the worktree (force if needed), delete the
   * branch, and drop the workspace record.
   */
  async discard(workspaceId, { force = false } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (ws.status === 'running') {
      await this.stop(workspaceId);
    }
    try {
      removeWorktree(this.repoRoot, ws.worktreePath, { deleteBranch: true, branch: ws.branch, force });
    } catch (e) {
      if (!force) throw e;
    }
    this.store.delete(workspaceId);
    this._broadcast(workspaceId, 'discarded', {});
  }

  /**
   * Return the diff between the workspace branch and main.
   */
  getDiff(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    return diffAgainstMain(this.repoRoot, ws.branch);
  }

  /**
   * Return the changed files for the workspace.
   */
  getChangedFiles(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    return changedFiles(this.repoRoot, ws.branch);
  }

  /**
   * The epic + children for a feature workspace, read from the WORKTREE so
   * child stages reflect the run in progress (the main checkout only catches
   * up on merge). Falls back to the main tickets dir if the worktree is gone.
   */
  featureProgress(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    const worktreeTicketsDir = path.join(ws.worktreePath || '', this.config.tickets_dir || '.bobby/tickets');
    const dir = ws.worktreePath && fs.existsSync(worktreeTicketsDir) ? worktreeTicketsDir : this.ticketsDir;
    return getFeatureTickets(dir, ws.ticketId);
  }

  /**
   * Read the session log entries for a workspace's most recent run.
   */
  readLatestSessionFile(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws || !ws.sessionId) return null;
    const filePath = path.join(this.sessionsDir, `${ws.sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
  }

  /**
   * The workflow THIS workspace advances through. A workspace records the
   * workflow it was created with (`ws.pipeline`, a name); the constructor
   * pipeline is only the server-wide default. Before this existed, a
   * workspace created with `pipeline: 'quick'` was recorded as quick but
   * advanced through the default workflow anyway.
   */
  _pipelineFor(ws) {
    if (!ws || !ws.pipeline || ws.pipeline === this.pipelineName) return this.pipeline;
    try {
      return resolveWorkflow(this.config, ws.pipeline);
    } catch {
      // A workflow that was deleted from config after the workspace was
      // created should degrade to the default, not strand the workspace.
      return this.pipeline;
    }
  }

  /**
   * Spawn the agent CLI. A method rather than a direct call so tests can drive
   * the real FSM — createWorkspace → runAgent → _onExit → approve → … — with a
   * fake agent instead of launching a real CLI.
   */
  _runExecutor(opts) {
    return runAgent(opts);
  }

  /**
   * How many agents may run at once. Counted PER ORCHESTRATOR, and there is one
   * orchestrator per `bobby app` / `bobby dashboard` process serving one repo —
   * so the cap is per project, per server process. Two servers on two projects
   * each get their own budget; a second server on the SAME project would too,
   * which is the known gap (nothing coordinates across processes).
   */
  _maxConcurrent() {
    const configured = this.config?.dashboard?.max_concurrent;
    const n = Number(configured);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_CONCURRENT;
    return Math.floor(n);
  }

  /**
   * Refuse — rather than queue — a run that would exceed the cap. Queuing would
   * start an agent minutes later, after the user has forgotten they asked for
   * it and while it spends their tokens unattended. Refusing keeps the user in
   * the loop, so the message names what is holding the slots.
   */
  _assertConcurrencyHeadroom() {
    const running = this._runningAgents();
    const max = this._maxConcurrent();
    if (running.length < max) return;
    const list = running.map(r => `${r.ticketId} ${r.agent}`).join(', ');
    throw new Error(
      `${running.length} agent${running.length === 1 ? ' is' : 's are'} already running: ${list}. ` +
      `Stop one, or raise dashboard.max_concurrent (currently ${max}).`
    );
  }

  /** The genuinely-running agents: one entry per live child process. */
  _runningAgents() {
    return Array.from(this.runningProcesses.keys()).map((id) => {
      const ws = this.store.get(id);
      return { workspaceId: id, ticketId: ws?.ticketId || id, agent: ws?.agent || 'agent' };
    });
  }

  /**
   * The agent to run next for a workspace.
   *
   * `workspace.stage` is the stage the ticket is NOW IN, not the stage it just
   * left: `_onExit` copies the stage straight off the worktree's ticket.md, and
   * every agent hands the ticket to the stage the NEXT agent works in. So the
   * lookup is direct — the agent that owns ws.stage — and never an offset.
   * Recorded as `workspace-stage-is-the-stage-now-in` in .bobby/decisions.yaml.
   *
   * The shared `resolveNextAgent` in lib/workflow.js is that lookup, and is what
   * the CLI path uses. Delegating keeps one definition of the convention; all
   * this method adds is which workflow to look in (the workspace's own, not the
   * server default) and the agent-key prefix the run API expects.
   */
  _resolveNextAgent(ws) {
    const agent = resolveNextAgent(this._pipelineFor(ws), ws.stage);
    // Workflow agents are named 'bobby-build'; the run API's key is 'build'.
    return agent ? agent.replace(/^bobby-/, '') : null;
  }

  _broadcast(workspaceId, event, data) {
    const payload = { workspaceId, event, data, at: new Date().toISOString() };
    if (this.sseHub) {
      this.sseHub.broadcast(`workspace:${workspaceId}`, payload);
      this.sseHub.broadcast('global', payload);
    }
  }

  _logSessionEvent(workspaceId, entry) {
    const ws = this.store.get(workspaceId);
    if (!ws || !ws.sessionId) return;
    try {
      logEntry(this.sessionsDir, ws.sessionId, entry);
    } catch { /* ignore */ }
  }
}
