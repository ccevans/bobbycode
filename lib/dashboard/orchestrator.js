// lib/dashboard/orchestrator.js
//
// Per-workspace orchestrator. Owns the lifecycle of a workspace:
//   - create worktree
//   - build prompt via pipeline.buildPromptFor
//   - init a bobby session
//   - launch executor (claude subprocess)
//   - forward events to SSE hub + JSONL session log
//   - on exit, detect stage advancement by re-reading the ticket's frontmatter
//   - apply FSM transitions (idle → running → awaiting_approval → running → …)
//
// TICKETS ARE SHARED STATE; ONLY CODE IS ISOLATED PER WORKTREE.
// Every ticket read here goes through `this.ticketsDir` — the main-worktree-rooted
// path from `resolveTicketsDir`. That is not a convenience, it is the only copy an
// agent can write: `bobby ticket move`, run from inside a worktree, resolves to the
// main checkout too (lib/config.js). A worktree's own `.bobby/tickets` is a git
// checkout frozen at fork time — it never sees an agent's move, and for a ticket
// created on a feature branch it does not contain the ticket at all. Reading it
// used to break both ends of a run: the prompt could not be built (TKT-051's
// reported symptom) and no stage change was ever detected, so `awaiting_approval`
// was unreachable and the approve → next-agent chain never fired.
//
// The same dir is what the PROMPT names, absolutely (TKT-052) — the agent reads
// AND writes there (plan.md, test-cases.md, progress.md), so a relative path or
// a read-only `bobby ticket view` would not do.
//
// Keeps a registry of active child processes so the dashboard can stop them
// cleanly on shutdown.
//
// TWO KINDS OF RUN (TKT-014). A WORKTREE run is the above. A REPO run has no
// worktree and no ticket: it launches a freeform agent (ux, arch, docs, ship,
// …) against the MAIN CHECKOUT, which is where those agents have always
// worked and why they were CLI-only until now. Both kinds go through the same
// `_launch` — session, prompt, spawn, SSE, process registry, concurrency cap —
// and differ only in what they are pointed at and what happens when they exit.
// A second half-parallel run path is how `_resolveNextAgent` drifted from
// `resolveNextAgent` (TKT-047); there is one here.
//
// A repo run holds the MAIN CHECKOUT LOCK for its whole life, and so does a
// merge, because `mergeToMain` stashes and swaps branches in that same
// checkout. See main-checkout-lock.js for why it is a file and not a mutex.

import path from 'path';
import fs from 'fs';
import { buildPromptFor, resolveWorkflow, resolveNextAgent } from '../workflow.js';
import { initSession, logEntry } from '../session.js';
import { findTicket, getFeatureTickets, updateTicket } from '../tickets.js';
import { AGENT_REGISTRY, runsWithoutTicket, REPO_AGENTS } from '../agent-registry.js';
import {
  createWorktree,
  removeWorktree,
  computeWorktreePlacement,
  commitCheckpoint,
  diffAgainstMain,
  changedFiles,
  workingDiff,
  workingChangedFiles,
  mergeToMain,
  detectMainBranch,
} from './worktree.js';
import { runAgent, resolveExecutor } from './executor.js';
import { newWorkspace, newRepoRun, newRun, runOutcome, isRepoRun, makeWorkspaceId, makeRepoRunId } from './state.js';
import { acquireMainCheckoutLock, mainCheckoutLockPath } from './main-checkout-lock.js';

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
    /**
     * The main-checkout lock file, shared with any other process on this repo.
     * Keyed to `repoRoot` deliberately: that is the exact directory
     * `mergeToMain` stashes and swaps branches in, and the exact directory a
     * repo run works in, so the lock covers precisely what it protects.
     */
    this.lockFile = mainCheckoutLockPath(repoRoot, config);
    /** @type {Map<string, { release: () => boolean }>} held by in-flight repo runs. */
    this.repoRunLocks = new Map();
  }

  /**
   * Create a new workspace for a ticket. Creates the git worktree and stores
   * the initial workspace record. Does NOT start running the agent.
   */
  createWorkspace({ ticketId, agent = 'plan', pipelineName }) {
    const ticket = this._requireTicket(ticketId);

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
   * Create a REPO RUN: kind 'repo', no worktree, no ticket, aimed at the main
   * checkout. Does NOT start the agent — `runAgent` does, and that is where the
   * main-checkout lock is taken, so a refusal comes from the same place a
   * worktree run's concurrency refusal does.
   *
   * Only agents that can build a prompt with no ticket are accepted; the set is
   * derived from the registry's own flags (`runsWithoutTicket`), so the API and
   * the prompt builder can never disagree about which agents these are.
   */
  createRepoRun({ agent }) {
    this._assertRepoRunnable(agent);

    const id = makeRepoRunId(agent);
    const run = newRepoRun({ id, agent, pipeline: this.pipelineName });
    this.store.create(run);
    this._broadcast(id, 'repo_run_created', { agent });
    return run;
  }

  /**
   * Start running the currently-queued agent for a workspace or repo run.
   * Returns the updated record. Throws if it is already running.
   *
   * The guards above the split are every run's guards, including the
   * concurrency cap — a repo run spends the same tokens on the same
   * subscription and counts against the same budget.
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

    return isRepoRun(ws)
      ? this._runInMainCheckout(ws, agent)
      : this._runInWorktree(ws, agent);
  }

  /**
   * A ticket-scoped run, in the workspace's own worktree. Everything here is
   * about the ticket; the launching itself is `_launch`.
   */
  _runInWorktree(ws, agent) {
    // Verify the ticket still exists on the shared board, which is also where
    // its current stage lives — see the header note.
    this._requireTicket(ws.ticketId);

    // Build prompt via the unified dispatcher. For feature mode, treat the
    // workspace's ticket id as an epic and resolve children.
    let epicData;
    if (agent === 'feature') {
      try {
        const { epic, children } = getFeatureTickets(this.ticketsDir, ws.ticketId);
        epicData = { epicId: ws.ticketId, epic, children };
      } catch (e) {
        throw new Error(`Feature mode requires an epic ticket. ${e.message}`);
      }
    }

    const built = buildPromptFor(agent, [ws.ticketId], this._promptContext(ws, { epicData }));

    return this._launch(ws, {
      agent,
      prompt: built.prompt,
      // The agent's cwd. `git worktree list` calls the main checkout a worktree
      // too, so this name stays true for a repo run below.
      worktreePath: ws.worktreePath,
      ticketIds: [ws.ticketId],
    });
  }

  /**
   * A repo run, in the main checkout. Takes the main-checkout lock FIRST: if a
   * merge holds it, refusing before we have spent a session id or a token is
   * the whole point. The lock is released in `_onExit`, or here if the launch
   * never happens.
   */
  _runInMainCheckout(ws, agent) {
    // Checked here as well as in createRepoRun, because `runAgent` accepts an
    // agentOverride: re-running a repo run as `build` would otherwise reach
    // buildPromptFor's batch branch and fail with something about tickets in a
    // stage, which explains nothing about what actually went wrong.
    this._assertRepoRunnable(agent);

    const lock = acquireMainCheckoutLock(this.lockFile, {
      holder: `bobby-${agent} (repo run ${ws.id})`,
    });
    this.repoRunLocks.set(ws.id, lock);
    try {
      // No ticket ids — that is what makes buildPromptFor take the freeform
      // branch for cowork agents and the generic one for freeform agents.
      const built = buildPromptFor(agent, [], this._promptContext(ws));
      return this._launch(ws, {
        agent,
        prompt: built.prompt,
        worktreePath: this.repoRoot,
        ticketIds: [],
      });
    } catch (e) {
      this._releaseRepoLock(ws.id);
      throw e;
    }
  }

  /**
   * Everything a run does that is neither about tickets nor about which
   * directory it works in: session init, the running mark, the SSE start
   * event, the executor spawn, the process registry, and the exit handler.
   * Both kinds of run go through here so they can never drift apart.
   */
  _launch(ws, { agent, prompt, worktreePath, ticketIds }) {
    const workspaceId = ws.id;

    // Init a bobby session — session log file lives in the MAIN repo's .bobby/sessions
    // so the dashboard can tail it regardless of which worktree is active.
    const sessionId = initSession(this.sessionsDir, {
      ticketIds,
      agent,
      pipeline: ws.pipeline || this.pipelineName,
    });

    // Mark running
    this.store.update(workspaceId, {
      agent,
      status: 'running',
      sessionId,
      startedAt: new Date().toISOString(),
      lastError: null,
    });
    this._broadcast(workspaceId, 'run_start', { agent, sessionId, prompt });

    // Launch executor
    const executor = resolveExecutor(this.config);
    const handle = this._runExecutor({
      worktreePath,
      prompt,
      sessionId,
      executor: executor.name,
      model: this.config.dashboard?.model,
      // Unset by default, which leaves each CLI in its own default permission
      // posture. Opt in via dashboard.permission_mode to let agents work
      // unattended — worktrees isolate them, but this still grants write access.
      // A repo run is NOT isolated: it edits the main checkout by design.
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

  /**
   * The ctx `buildPromptFor` needs. Identical for both kinds — only the ticket
   * ids passed alongside it differ.
   *
   * The tickets path the PROMPT names is the same main-rooted absolute dir we
   * read from, not the relative `config.tickets_dir`. The agent's cwd is its
   * worktree, which forked from main and therefore holds no copy of a ticket
   * created on a feature branch — a relative path would miss on step 1 of
   * every agent prompt (TKT-052). Absolute makes the prompt machine-specific,
   * which is harmless: it is built per run and handed straight to a local
   * subprocess.
   */
  _promptContext(ws, { epicData } = {}) {
    return {
      config: this.config,
      ticketsDir: this.ticketsDir,
      ticketsPath: this.ticketsDir,
      agentsPath: this.agentsPath,
      workflow: this._pipelineFor(ws),
      maxRetries: 3,
      hasServices: !!(this.config.services && Object.keys(this.config.services).length > 0),
      epicData,
      gitConventions: this.config.git_conventions || {},
    };
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
    if (!ws) {
      // The record was discarded mid-run. The lock is still ours to give back.
      this._releaseRepoLock(workspaceId);
      return;
    }

    // One definition of what a run is, in state.js, so a worktree run and a
    // repo run produce the same record and /api/runs can list them together.
    // `costUsd` comes off the executor's result and is null when the CLI never
    // reported one — never 0, which would read as "this run was free".
    const runRecord = newRun({
      workspace: ws,
      agent,
      sessionId,
      startedAt: ws.startedAt,
      endedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      signal: result.signal,
      error: result.error || null,
      costUsd: result.costUsd,
    });

    if (isRepoRun(ws)) return this._onRepoRunExit(ws, runRecord, result);

    // Re-read the ticket's stage to detect advancement. From the shared board:
    // the agent's `bobby ticket move` landed there, and only there.
    const ticket = findTicket(this.ticketsDir, ws.ticketId);
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

    let nextStatus = this._terminalStatus(result);
    if (nextStatus === 'idle') {
      // A clean exit only means more than "nothing to do" when the ticket moved.
      if (stageAdvanced) nextStatus = 'awaiting_approval';
      if (newStage === 'shipping' || newStage === 'done') nextStatus = 'ready_to_merge';
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
    const lastError = this._lastErrorFor(result);
    if (lastError) patch.lastError = lastError;

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
   * A repo run has exited. Three things a worktree run does are deliberately
   * absent:
   *
   *   NO CHECKPOINT COMMIT. `commitCheckpoint` runs `git add -A && git commit`.
   *     In a worktree that is harmless bookkeeping; in the MAIN checkout it
   *     would sweep the user's unrelated in-progress work into a commit on
   *     whatever branch they happen to be standing on. A repo run's output is
   *     left exactly as the agent wrote it, for the user to review and commit.
   *   NO STAGE RE-READ. There is no ticket, so there is nothing to advance and
   *     no `awaiting_approval` to reach.
   *   NO READY_TO_MERGE. Nothing was branched, so nothing can be merged.
   *
   * A clean exit therefore lands on `idle`: not running, nothing pending, and
   * runnable again. What it did is in `runs` and in the session log.
   *
   * The lock goes back first, so a failure below cannot strand the checkout.
   */
  _onRepoRunExit(ws, runRecord, result) {
    this._releaseRepoLock(ws.id);

    const nextStatus = this._terminalStatus(result);
    const patch = {
      status: nextStatus,
      pid: null,
      runs: [...(ws.runs || []), runRecord],
    };
    const lastError = this._lastErrorFor(result);
    if (lastError) patch.lastError = lastError;

    this.store.update(ws.id, patch);
    this._broadcast(ws.id, 'run_end', { result, stageAdvanced: false, newStage: null, nextStatus });
  }

  /**
   * The status an exit implies before any ticket-specific promotion. Shared so
   * a repo run and a worktree run can never disagree about what a SIGTERM or a
   * non-zero exit means.
   *
   * Delegates the classification itself to `runOutcome`, which is what the run
   * record uses, so a run listed as 'failed' in /api/runs can never sit on a
   * workspace that thinks the same exit was fine. Only the clean case is
   * renamed: a run that COMPLETED leaves its workspace idle — not running,
   * nothing pending, runnable again.
   */
  _terminalStatus(result) {
    const outcome = runOutcome(result);
    return outcome === 'completed' ? 'idle' : outcome;
  }

  /** The error worth recording on the record, or null. Shared for the same reason. */
  _lastErrorFor(result) {
    if (result.exitCode !== 0 && result.exitCode !== null) {
      return `claude exited with code ${result.exitCode}`;
    }
    return result.error || null;
  }

  /**
   * The one place that decides whether an agent may run against the repo, so
   * creating a repo run and re-running one can never disagree.
   */
  _assertRepoRunnable(agent) {
    if (!AGENT_REGISTRY[agent]) throw new Error(`Unknown agent '${agent}'`);
    if (runsWithoutTicket(agent)) return;
    throw new Error(
      `Agent '${agent}' works on a ticket, so it cannot run against the repo. ` +
      `Create a workspace for it instead. Repo-runnable agents: ${REPO_AGENTS.join(', ')}.`
    );
  }

  /**
   * Hand the main-checkout lock back. Idempotent: a run that never took one, or
   * whose lock was already released, is a no-op. `release()` itself refuses to
   * delete a lock that is no longer ours.
   */
  _releaseRepoLock(workspaceId) {
    const lock = this.repoRunLocks.get(workspaceId);
    if (!lock) return;
    this.repoRunLocks.delete(workspaceId);
    lock.release();
  }

  /**
   * Approve the workspace → queue and run the next agent in the pipeline.
   */
  async approve(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (isRepoRun(ws)) {
      throw new Error(
        `${workspaceId} is a repo run — there is no pipeline to approve it into. ` +
        'Run another agent against the repo, or start a workspace for a ticket.'
      );
    }
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
    if (isRepoRun(ws)) {
      throw new Error(
        `${workspaceId} is a repo run — rejecting means re-running the build agent ` +
        'on a ticket, and there is no ticket here. Run the agent again instead.'
      );
    }
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
   *
   * Holds the MAIN CHECKOUT LOCK for the duration. `mergeToMain` stashes the
   * main checkout, checks out main and merges there, so a repo run working in
   * that same directory would have its half-written files stashed and the
   * branch swapped underneath it. This is the other half of TKT-014's guard;
   * the run side is `_runInMainCheckout`.
   */
  async merge(workspaceId, { message } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (isRepoRun(ws)) {
      throw new Error(
        `${workspaceId} is a repo run — it worked in the main checkout, so its changes ` +
        'are already there and there is no branch to merge. Review them with `git diff`.'
      );
    }
    if (ws.status === 'running') throw new Error('Cannot merge a running workspace — stop it first');

    const lock = acquireMainCheckoutLock(this.lockFile, {
      holder: `merge of ${ws.branch}`,
    });
    let mergeResult;
    try {
      mergeResult = this._mergeToMain(ws.branch, { message });
      // Remove worktree (branch is retained until explicit delete, so revert is possible)
      removeWorktree(this.repoRoot, ws.worktreePath, { deleteBranch: false });
    } finally {
      lock.release();
    }

    // The moment the merge happened, recorded in two places for two reasons
    // (TKT-013). On the TICKET it is the durable, user-visible fact — it
    // survives discarding the workspace, it travels with the ticket in git, and
    // it is where a feature view already reads its children from, so no
    // consumer has to join workspaces to tickets to answer "when was this
    // merged". On the WORKSPACE it is the dashboard's own log of when it did
    // the work, and it dies with the record, which is correct for bookkeeping.
    const mergedAt = new Date().toISOString();
    const mergedAtError = this._recordTicketMerge(ws.ticketId, mergedAt);

    this.store.update(workspaceId, {
      status: 'merged',
      mergedAt,
      pid: null,
      lastError: null,
    });
    this._broadcast(workspaceId, 'merged', { ...mergeResult, mergedAt, mergedAtError });
    return this.store.get(workspaceId);
  }

  /**
   * Stamp `mergedAt` into the ticket's frontmatter. Returns the reason it could
   * not, or null.
   *
   * A full ISO-8601 timestamp, in its own field, rather than reusing `updated`:
   * `updated` is date-only by convention and everything that reads it expects
   * YYYY-MM-DD, which is the whole reason a row can only say "merged" and not
   * "merged 2h ago". A new field leaves that convention alone.
   *
   * Failure here is reported, never thrown. The merge has already happened —
   * the branch is in main and the worktree is gone — so throwing now would
   * report a completed merge as a failure and invite the user to run it again.
   */
  _recordTicketMerge(ticketId, mergedAt) {
    if (!ticketId) return null;
    try {
      updateTicket(this.ticketsDir, ticketId, { mergedAt });
      return null;
    } catch (e) {
      process.stderr.write(
        `[bobby dashboard] merged ${ticketId}, but could not record mergedAt in its ` +
        `frontmatter: ${e.message}\n`
      );
      return e.message;
    }
  }

  /**
   * Discard a workspace: remove the worktree (force if needed), delete the
   * branch, and drop the workspace record.
   *
   * For a REPO RUN this drops the record and nothing else — and that is not a
   * shortcut, it is the only honest thing to do. The run edited the main
   * checkout in place; those edits are the user's working tree now, and
   * "discard" must never be a button that reverts it. Use git for that.
   */
  async discard(workspaceId, { force = false } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (ws.status === 'running') {
      await this.stop(workspaceId);
    }
    if (!isRepoRun(ws)) {
      try {
        removeWorktree(this.repoRoot, ws.worktreePath, { deleteBranch: true, branch: ws.branch, force });
      } catch (e) {
        if (!force) throw e;
      }
    }
    this.store.delete(workspaceId);
    this._broadcast(workspaceId, 'discarded', {});
  }

  /**
   * The diff a run produced.
   *
   * For a worktree run that is its branch against main. For a repo run there is
   * no branch — the agent edited the main checkout — so it is the working tree
   * against HEAD, which is the same question asked of the only place the work
   * exists. Untracked files are listed by `getChangedFiles` but cannot appear
   * in a diff; see `workingDiff`.
   */
  getDiff(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (isRepoRun(ws)) return workingDiff(this.repoRoot);
    return diffAgainstMain(this.repoRoot, ws.branch);
  }

  /**
   * The files a run changed — branch vs main for a worktree run, working tree
   * vs HEAD (plus untracked) for a repo run. Same shape either way.
   */
  getChangedFiles(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (isRepoRun(ws)) return workingChangedFiles(this.repoRoot);
    return changedFiles(this.repoRoot, ws.branch);
  }

  /**
   * The epic + children for a feature workspace, read from the shared board.
   *
   * This used to read the WORKTREE, on the belief that children advance there
   * during a run and the main checkout only catches up on merge. That was never
   * true: a child advances when an agent runs `bobby ticket move`, which writes
   * to the main checkout from inside any worktree. The worktree copy is frozen
   * at fork time, so reading it showed stages that could only ever go stale.
   */
  featureProgress(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (isRepoRun(ws)) {
      throw new Error(`${workspaceId} is a repo run — it has no ticket, so there is no feature progress to report.`);
    }
    return getFeatureTickets(this.ticketsDir, ws.ticketId);
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
   * The ticket, off the shared board, or an error that names the reason it is
   * most often missing. `.bobby/tickets` resolves to the MAIN checkout, so a
   * ticket committed on a branch that checkout is not on is invisible here even
   * though it is plainly on disk somewhere — and "not found" alone sends people
   * hunting for a typo instead of looking at branch topology (TKT-051).
   */
  _requireTicket(ticketId) {
    const ticket = findTicket(this.ticketsDir, ticketId);
    if (ticket) return ticket;
    throw new Error(
      `Ticket ${ticketId} not found in ${this.ticketsDir}. Tickets are read from the ` +
      'main checkout, whatever branch it is on — if this ticket was created on another ' +
      'branch, check that branch out there first.'
    );
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
   * The git merge itself. A method for the same reason `_runExecutor` is one:
   * the window in which the main-checkout lock is held is exactly this call,
   * and a test that wants to prove nothing else can get in has to be able to
   * stand inside it.
   */
  _mergeToMain(branch, opts) {
    return mergeToMain(this.repoRoot, branch, opts);
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
    const list = running.map(r => `${r.subject} ${r.agent}`).join(', ');
    throw new Error(
      `${running.length} agent${running.length === 1 ? ' is' : 's are'} already running: ${list}. ` +
      `Stop one, or raise dashboard.max_concurrent (currently ${max}).`
    );
  }

  /**
   * The genuinely-running agents: one entry per live child process, of either
   * kind. `subject` is what the run is working on, which is the only part of it
   * a user can recognise in a refusal — a ticket id, or the main checkout.
   */
  _runningAgents() {
    return Array.from(this.runningProcesses.keys()).map((id) => {
      const ws = this.store.get(id);
      const subject = isRepoRun(ws) ? 'the main checkout' : (ws?.ticketId || id);
      return { workspaceId: id, subject, agent: ws?.agent || 'agent' };
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
