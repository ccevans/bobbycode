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
import { buildPromptFor } from '../pipeline.js';
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
import { runClaude } from './executor.js';
import { newWorkspace, makeWorkspaceId } from './state.js';

/**
 * Map an agent key to the stage it is expected to advance TO after finishing.
 * Used to detect success: if the ticket's stage matches the expected target,
 * the agent succeeded.
 */
const AGENT_STAGE_MAP = {
  'bobby-plan':    'building',
  'bobby-build':   'reviewing',
  'bobby-review':  'testing',
  'bobby-test':    'shipping',
  'bobby-ship':    'done',
  'bobby-security': 'testing',
};

const PIPELINE_ORDER = ['plan', 'build', 'review', 'test'];

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

    const stageForBranch = agent === 'pipeline' ? 'pipeline' : agent;
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
      pipeline: this.pipeline,
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
    const handle = runClaude({
      worktreePath: ws.worktreePath,
      prompt: built.prompt,
      sessionId,
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
   * Read the session log entries for a workspace's most recent run.
   */
  readLatestSessionFile(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws || !ws.sessionId) return null;
    const filePath = path.join(this.sessionsDir, `${ws.sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
  }

  _resolveNextAgent(ws) {
    // Use the pipeline config to find the stage after the current one
    const idx = this.pipeline.findIndex(s => s.stage === ws.stage);
    if (idx < 0 || idx >= this.pipeline.length - 1) return null;
    const nextStep = this.pipeline[idx + 1];
    // Pipeline's agent field is like 'bobby-build' — strip prefix for run agent key
    return nextStep.agent.replace(/^bobby-/, '');
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
