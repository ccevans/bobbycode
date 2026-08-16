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
// WHICH board that is depends on the workspace, not on the moment (TKT-022). In a
// studio `this.ticketsDir` follows the project the user has selected, and that can
// change while an agent runs. So a workspace pins its board at creation and every
// per-workspace read goes through `_ticketsDirFor(ws)`; `this.ticketsDir` is for
// the UI's board and for picking a NEW ticket off it.
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
  headSha,
} from './worktree.js';
import { runAgent, resolveExecutor, resolvePermissionMode, isPermissionDenial, claudeSessionIdFromEvent } from './executor.js';
import { newWorkspace, newRepoRun, newRun, runOutcome, isRepoRun, makeWorkspaceId, makeRepoRunId } from './state.js';
import { acquireMainCheckoutLock, mainCheckoutLockPath } from './main-checkout-lock.js';
import { resolveRepoPath, resolveProductDir, configForProject } from '../config.js';

/**
 * How many agents one orchestrator may have in flight at once when
 * `dashboard.max_concurrent` is not configured. Every running agent is a CLI
 * subprocess spending real tokens on the user's own subscription, so the
 * default is deliberately low.
 */
export const DEFAULT_MAX_CONCURRENT = 4;

/**
 * How many permission refusals a run may collect before the orchestrator stops
 * it (TKT-062).
 *
 * An agent that cannot write does not fail — it apologises, tries again, and
 * keeps spending. The measured run collected 20-odd refusals across 88 turns
 * and 9 minutes before giving up on its own and exiting 0. Three is above the
 * noise (a run whose posture is right collects none) and far below the cost of
 * finding out the slow way.
 */
export const PERMISSION_DENIAL_LIMIT = 3;

export class Orchestrator {
  constructor({ repoRoot, config, ticketsDir, sessionsDir, agentsPath, store, sseHub, pipeline, pipelineName = 'default', projectContext = null }) {
    this.repoRoot = repoRoot;
    this._config = config;
    // The board paths. In studio mode (TKT-022) they move with the active
    // project, so they are read live off `projectContext` via the getters below.
    // The constructor values are the fallback: non-studio dashboards and tests
    // pass no context and keep exactly today's behaviour.
    this.projectContext = projectContext;
    this._ticketsDir = ticketsDir;
    this._sessionsDir = sessionsDir;
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
    /**
     * Permission refusals seen on the current run, per workspace. Reset at
     * launch and dropped on exit, so it is only ever about the run in flight.
     * @type {Map<string, number>}
     */
    this.permissionDenials = new Map();
  }

  /**
   * The active project's board dirs. Read live from the project context so a
   * `switchProject` re-scopes every ticket read the orchestrator does (and every
   * API route that reads `orchestrator.ticketsDir`) without rebuilding anything.
   * Falls back to the constructor values when there is no context, or when the
   * context has no project selected yet.
   */
  get ticketsDir() { return (this.projectContext && this.projectContext.ticketsDir) || this._ticketsDir; }
  get sessionsDir() { return (this.projectContext && this.projectContext.sessionsDir) || this._sessionsDir; }

  /**
   * The active project's CONFIG, live for the same reason the dirs are.
   *
   * `.bobbyrc.yml` is per project in a studio, and the keys that differ are not
   * cosmetic: `project_repos` decides which REPO a ticket's worktree is cut
   * from, `workflows` decides which pipelines exist, `ticket_prefix` names new
   * tickets. Holding the boot config here meant a workspace created after a
   * switch resolved its target repo from the PREVIOUS project — a beta ticket
   * getting a worktree of alpha's repository, where an agent then edits the
   * wrong codebase entirely.
   */
  get config() { return (this.projectContext && this.projectContext.config) || this._config; }

  /**
   * The config a WORKSPACE belongs to — same contract as `_ticketsDirFor`, and
   * for the same reason. `this.config` answers "what is the user looking at",
   * which is right when picking a ticket off the board and wrong for everything
   * a run in flight does: its permission posture, its workflow, its prompt, its
   * repo group. Those must stay on the project the run was created for.
   */
  _configFor(ws) {
    const project = ws && ws.project;
    if (!project || !this.projectContext || !this.projectContext.isStudio()) return this.config;
    if (project === this.projectContext.projectName) return this.projectContext.config;
    try {
      return configForProject(this.repoRoot, project);
    } catch {
      // A project renamed or removed while a run was in flight. The live config
      // is wrong, but it is a working config — better than throwing inside an
      // exit handler, which would strand the workspace as `running` forever.
      return this.config;
    }
  }

  /**
   * The board a WORKSPACE belongs to — pinned onto the record at creation, and
   * the only board anything about that workspace may read.
   *
   * The getters above are live by design: the UI must follow the switch. A RUN
   * must not. A run takes minutes; switching to another project while it works
   * is the exact thing switching is for. Everything the run does after launch —
   * re-reading the stage on exit, appending to the session log, stamping
   * `mergedAt` — happens on the far side of a switch that may already have
   * happened, and reading `this.ticketsDir` there would ask the WRONG project's
   * board how this run went. That misreports a finished run as a no-op when the
   * id is absent, and, when both boards happen to hold the same id, compares
   * against an unrelated ticket and can auto-approve the next agent against it.
   *
   * The fallback is the live board, which is right for the two cases that have
   * no pin: a single-project dashboard (there is one board) and records written
   * before this field existed.
   */
  _ticketsDirFor(ws) { return (ws && ws.ticketsDir) || this.ticketsDir; }
  _sessionsDirFor(ws) { return (ws && ws.sessionsDir) || this.sessionsDir; }

  /** The project a NEW record is created in, or null off-studio. */
  _activeProjectName() {
    return (this.projectContext && this.projectContext.isStudio())
      ? this.projectContext.projectName
      : null;
  }

  /**
   * Switch the dashboard to another studio project (TKT-022). Delegates the
   * validate-and-persist to the project context, then announces the change on
   * the global SSE channel so open clients re-scope their views.
   *
   * Deliberately NOT a lifecycle event: no worktree is touched, no process is
   * stopped, the shared process map is untouched — a running agent in the old
   * project keeps running in its own worktree. Switching is only a re-pointing
   * of which board the UI reads.
   *
   * It re-points the UI ONLY. An in-flight run stays bound to the board it was
   * launched against, because that board is pinned on its workspace record —
   * see `_ticketsDirFor`. Without that pin this method would silently reach into
   * a running agent's bookkeeping, which is the one thing it promises not to do.
   */
  switchProject(name) {
    if (!this.projectContext) {
      throw new Error('Project switching is not available — this dashboard has no project context.');
    }
    if (!this.projectContext.isStudio()) {
      throw new Error('Project switching is only available in a studio.');
    }
    this.projectContext.switchTo(name);
    this._broadcastGlobal('project_switched', {
      project: name,
      ticketsDir: this.ticketsDir,
      sessionsDir: this.sessionsDir,
    });
    return { project: name, ticketsDir: this.ticketsDir, sessionsDir: this.sessionsDir };
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

    // Resolve the TARGET repo before any worktree is created or record stored
    // (TKT-069). A two-repo ticket throws here — before we spend a worktree or a
    // token — so the refusal is total (Decision 1).
    const { repoRoot, lockFile } = this._resolveTargetRepo(ticket);

    const stageForBranch = agent === 'workflow' ? 'workflow' : agent;
    // `this.repoRoot` is the studio root (the launch dir); `repoRoot` above is
    // the ticket's CODE repo. Passing the studio root lets resolveWorktreeRoot
    // refuse a worktree_root outside the studio before we spend a worktree or a
    // token (PRO-027). Off-studio the two are equal and no validation runs.
    const { worktreePath, branch } = computeWorktreePlacement(
      repoRoot,
      this.config,
      ticketId,
      stageForBranch,
      this.repoRoot
    );

    createWorktree(repoRoot, { worktreePath, branch });

    const id = makeWorkspaceId(ticketId, stageForBranch);
    const workspace = newWorkspace({
      id,
      ticketId,
      worktreePath,
      branch,
      agent,
      pipeline: pipelineName || this.pipelineName,
      repoRoot,
      lockFile,
      // The project this workspace was created IN, pinned for the life of the
      // record so a later project switch cannot move it (TKT-022). The name is
      // the source; the dirs are stored beside it because they are what the hot
      // paths read.
      project: this._activeProjectName(),
      ticketsDir: this.ticketsDir,
      sessionsDir: this.sessionsDir,
    });
    workspace.stage = ticket.data.stage;
    this.store.create(workspace);
    this._logSessionEvent(workspace.id, { type: 'workspace_created', ticketId, worktreePath, branch, agent });
    return workspace;
  }

  /**
   * The repo a ticket's CODE lives in, as `{ repoRoot, lockFile }` (absolute
   * paths). TKT-069.
   *
   * Precedence: the ticket's own `repos` frontmatter, then the project's
   * `project_repos` (the subset of the studio's group it uses), then the launch
   * repo (`this.repoRoot`). A ticket that names MORE THAN ONE repo is refused
   * here (Decision 1, `one-repo-per-ticket-v1`): a workspace ships in exactly
   * one repo, and taking the first of two would ship half the ticket in silence
   * — the exact wrong-repo class this method exists to kill. The refusal comes
   * before any worktree or token is spent, and names the ticket, the repos, and
   * the way out.
   *
   * REGRESSION GUARD (Decision 2): resolution is only attempted in a studio with
   * a non-empty repo group. Off-studio — a v1 single-repo project — this returns
   * `this.repoRoot` / `this.lockFile` UNCHANGED, so every downstream git call
   * receives exactly today's arguments, and `resolveRepoPath` (which throws on an
   * empty group) is never reached.
   */
  _resolveTargetRepo(ticket) {
    const fallback = { repoRoot: this.repoRoot, lockFile: this.lockFile };

    const group = this.config.repo_group || this.config.repos || {};
    const inStudio = !!this.config.studio && Object.keys(group).length > 0;
    if (!inStudio) return fallback;

    const ticketId = ticket?.data?.id || '(unknown ticket)';
    const repos = ticket?.data?.repos;

    let name = null;
    if (Array.isArray(repos) && repos.length > 0) {
      if (repos.length > 1) {
        throw new Error(
          `${ticketId} names ${repos.length} repos (${repos.join(', ')}), but a workspace ships in ` +
          `exactly one. v1 is one repo per ticket: split the ticket, or narrow its \`repos\` frontmatter ` +
          `to the single repo the code lives in.`
        );
      }
      name = repos[0];
    } else if (Array.isArray(this.config.project_repos) && this.config.project_repos.length > 0) {
      name = this.config.project_repos[0];
    }

    if (!name) return fallback;

    let repoRoot;
    try {
      repoRoot = resolveRepoPath(this.repoRoot, this.config, name);
    } catch (e) {
      // Name a misconfigured `repos:` so it is diagnosable, not a bare "not in
      // the group" with no ticket to trace it back to.
      throw new Error(`${ticketId}: cannot resolve target repo '${name}' — ${e.message}`);
    }
    return { repoRoot, lockFile: mainCheckoutLockPath(repoRoot, this.config) };
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
    // Both dirs, not just sessions. A repo run has no ticket of its own, but the
    // freeform agents that can be one (docs, ux, arch, …) are handed the board
    // in their prompt, and `createRepoRun` and `runAgent` are separate calls — a
    // switch can land between them. The project it was created for is the
    // project it reads.
    const run = newRepoRun({
      id, agent, pipeline: this.pipelineName,
      project: this._activeProjectName(),
      ticketsDir: this.ticketsDir, sessionsDir: this.sessionsDir,
    });
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
    // its current stage lives — see the header note. The workspace's OWN board:
    // re-running an agent (approve, reject) can happen after a project switch.
    this._requireWorkspaceTicket(ws);

    // Build prompt via the unified dispatcher. For feature mode, treat the
    // workspace's ticket id as an epic and resolve children.
    let epicData;
    if (agent === 'feature') {
      try {
        const { epic, children } = getFeatureTickets(this._ticketsDirFor(ws), ws.ticketId);
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
   * Run ONE turn of a planning conversation (TKT-021), and resolve when it
   * finishes. The ChatManager owns the chat record and persistence; this owns
   * the single run.
   *
   * `mode: 'plan'` (the default) is a discussion turn: the agent reads code and
   * the ticket, argues, proposes — but writes nothing, because the executor is
   * launched with `permissionMode: 'plan'`. `mode: 'commit'` drops that
   * restriction and tells the agent to write the plan the conversation agreed
   * on. Both resume the same Claude session via `--resume`.
   *
   * This deliberately does NOT go through `_onExit`. A chat turn that writes
   * nothing is the whole point of plan mode, and `_onExit` would read that as a
   * no-op failure (TKT-062) and mislabel every discussion turn. Instead a small
   * exit handler records the turn, captures the Claude session id from the
   * stream so the next turn can resume, and appends to the timeline.
   */
  runChatTurn(workspaceId, { message, mode = 'plan' } = {}) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Chat workspace ${workspaceId} not found`);
    if (ws.status === 'running') throw new Error(`Workspace ${workspaceId} is already running`);
    if (this.runningProcesses.has(workspaceId)) {
      throw new Error(`Workspace ${workspaceId} already has an active process`);
    }
    if (mode !== 'plan' && mode !== 'commit') {
      throw new Error(`Unknown chat turn mode '${mode}' (expected 'plan' or 'commit')`);
    }
    this._assertConcurrencyHeadroom();

    const prompt = mode === 'commit'
      ? this._buildChatCommitPrompt(ws)
      : this._buildChatMessagePrompt(ws, message);

    // The write posture to commit the plan is the same one an ordinary worktree
    // run gets — sandboxed, and proven able to finish a stage.
    const permissionMode = mode === 'commit'
      ? resolvePermissionMode(this._configFor(ws), 'worktree')
      : 'plan';

    // Seeded from the stored id so a resumed turn keeps it even if this turn's
    // stream never re-announces it.
    let chatSessionId = ws.chatId || null;

    return new Promise((resolve, reject) => {
      try {
        this._launch(ws, {
          agent: 'plan',
          prompt,
          worktreePath: ws.worktreePath,
          ticketIds: [ws.ticketId],
          permissionMode,
          resume: ws.chatId || undefined,
          onEvent: (ev) => {
            const sid = claudeSessionIdFromEvent(ev);
            if (sid) chatSessionId = sid;
          },
          onExit: (result) => {
            const entry = {
              role: mode === 'commit' ? 'commit' : 'user',
              summary: mode === 'commit' ? 'Committed the plan' : this._chatSummary(message),
              at: new Date().toISOString(),
            };
            const patch = {
              status: this._terminalStatus(result),
              pid: null,
              chatHistory: [...(ws.chatHistory || []), entry],
            };
            if (chatSessionId) patch.chatId = chatSessionId;
            const lastError = this._lastErrorFor(result);
            if (lastError) patch.lastError = lastError;
            const updated = this.store.update(workspaceId, patch);
            this._broadcast(workspaceId, 'chat_turn_end', { result, mode });
            resolve({ workspace: updated, result, chatSessionId });
          },
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /** A one-line summary of a chat message for the timeline. */
  _chatSummary(message) {
    const text = String(message || '').trim().replace(/\s+/g, ' ');
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  }

  /** The prompt for a discussion turn: read the ticket, discuss, write nothing. */
  _buildChatMessagePrompt(ws, message) {
    const ticket = this._requireWorkspaceTicket(ws);
    const ticketFile = path.join(ticket.path, 'ticket.md');
    return [
      `You are planning ticket ${ws.ticketId} in a live conversation with the user.`,
      `Read the ticket at \`${ticketFile}\`, and any code you need, to reason about it.`,
      `You are in PLAN MODE: discuss, ask questions, weigh options, and propose an approach —`,
      `but do NOT write any files yet. The user will tell you when to commit the plan.`,
      ``,
      `User: ${message}`,
    ].join('\n');
  }

  /** The prompt for the commit turn: write the plan the conversation agreed on. */
  _buildChatCommitPrompt(ws) {
    const ticket = this._requireWorkspaceTicket(ws);
    const planFile = path.join(ticket.path, 'plan.md');
    const testFile = path.join(ticket.path, 'test-cases.md');
    return [
      `Write the plan you and the user agreed on for ticket ${ws.ticketId}, using the full`,
      `context of our conversation.`,
      `Write the implementation plan to \`${planFile}\` and the test cases to \`${testFile}\`.`,
      `Do not ask further questions — produce the files.`,
    ].join('\n');
  }

  /**
   * Everything a run does that is neither about tickets nor about which
   * directory it works in: session init, the running mark, the SSE start
   * event, the executor spawn, the process registry, and the exit handler.
   * Both kinds of run go through here so they can never drift apart.
   */
  _launch(ws, { agent, prompt, worktreePath, ticketIds, permissionMode, resume, onEvent, onExit }) {
    const workspaceId = ws.id;
    const kind = isRepoRun(ws) ? 'repo' : 'worktree';

    // Fresh count for a fresh run — a workspace that was blocked once and then
    // re-run with a better posture starts from zero.
    this.permissionDenials.set(workspaceId, 0);

    // Where this worktree's branch stood before the agent touched it. Compared
    // against the same reading on exit to answer "did this run write anything",
    // which no exit code can answer. Null means git could not say, which stays
    // null all the way to the verdict and is read there as "cannot tell".
    const headAtStart = kind === 'worktree' ? headSha(worktreePath) : null;

    // Init a bobby session — session log file lives in the MAIN repo's .bobby/sessions
    // so the dashboard can tail it regardless of which worktree is active. Pinned
    // to the workspace's project, and carried through exit: a session whose header
    // is written to one project and whose tail lands in another is a log with a
    // hole in it, on both sides (TKT-022).
    const sessionsDir = this._sessionsDirFor(ws);
    const sessionId = initSession(sessionsDir, {
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
    const runConfig = this._configFor(ws);
    const executor = resolveExecutor(runConfig);
    const handle = this._runExecutor({
      worktreePath,
      prompt,
      sessionId,
      executor: executor.name,
      model: runConfig.dashboard?.model,
      // Per KIND, never one setting for both (TKT-062). A worktree run is
      // sandboxed by construction — the copy is disposable — so it gets the
      // posture that can actually finish a stage. A repo run edits the main
      // checkout by design, where that reasoning does not hold, so it gets a
      // narrower one. See resolvePermissionMode and lib/config.js DEFAULTS.
      //
      // A caller may override the posture (a chat turn runs `plan` while
      // discussing, then the launch posture to commit the plan) and pass a
      // Claude session id to `--resume` — TKT-021.
      permissionMode: permissionMode || resolvePermissionMode(runConfig, kind),
      // The pin, extended to the AGENT (TKT-022). Pinning the orchestrator's own
      // reads is only half of it: the agent runs `bobby ticket move`, and that
      // resolves its board through resolveActiveProject, which falls back to
      // `.bobby/active-project` — a file the UI rewrites on every switch. So an
      // alpha run whose user had moved on to beta would move its ticket on
      // BETA's board, which is the exact bug the pin exists to prevent, one
      // process further out. BOBBY_PROJECT is the top of that precedence chain,
      // so naming the run's own project here settles it for every bobby command
      // the agent runs. Off-studio there is no project to name and nothing to
      // resolve, so the env is left exactly as it was.
      env: ws.project ? { BOBBY_PROJECT: ws.project } : {},
      resume,
      onEvent: (ev) => {
        this._onExecutorEvent(workspaceId, sessionId, ev, sessionsDir);
        if (onEvent) onEvent(ev);
      },
    });

    this.runningProcesses.set(workspaceId, handle);
    this.store.update(workspaceId, { pid: handle.pid });

    // Attach exit handler — don't await here, let it run. A custom `onExit`
    // (chat turns) takes over the exit entirely, so the shared process-registry
    // cleanup the default handler does at its top has to happen here instead.
    const settle = (result) => {
      if (!onExit) {
        return this._onExit(workspaceId, agent, sessionId, result, { headAtStart });
      }
      this.runningProcesses.delete(workspaceId);
      this.permissionDenials.delete(workspaceId);
      return onExit(result);
    };
    handle.done.then(settle)
      .catch((e) => settle({ exitCode: null, signal: null, error: e.message }));

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
    // The workspace's own board (TKT-022): the agent about to be launched works
    // on THIS ticket, so the path it is handed must point at the project that
    // ticket is on — not at whatever project the UI moved to before this run.
    const ticketsDir = this._ticketsDirFor(ws);
    // …and its own CONFIG, for the same reason: `services`, `git_conventions`
    // and the product dir are project-level, so a prompt built after a switch
    // would otherwise describe the other project to this project's agent.
    const config = this._configFor(ws);
    return {
      config,
      ticketsDir,
      ticketsPath: ticketsDir,
      agentsPath: this.agentsPath,
      workflow: this._pipelineFor(ws),
      maxRetries: 3,
      hasServices: !!(config.services && Object.keys(config.services).length > 0),
      // Re-threaded on the app+studio merge: without it, an agent launched from
      // the app loses the "read the feature-map row and journey step" step that
      // a CLI `bobby run` gets, and product-defined tickets silently build
      // without their product context (TKT-068).
      hasProduct: fs.existsSync(path.join(this.repoRoot, config.bobby_dir || '.bobby', 'product', 'feature-map.md')),
      // Absolute studio-rooted product dir so the product hint resolves from an
      // agent whose worktree cwd is in a different repo than the board (PRO-026).
      productDir: resolveProductDir(this.repoRoot, config),
      epicData,
      gitConventions: config.git_conventions || {},
    };
  }

  _onExecutorEvent(workspaceId, sessionId, ev, sessionsDir = this.sessionsDir) {
    // Mirror into JSONL log — into the dir this run was launched with, so the
    // stream keeps landing in the same file after a mid-run project switch.
    try {
      logEntry(sessionsDir, sessionId, { type: `exec_${ev.type}`, ...ev });
    } catch { /* logging must never crash the dashboard */ }
    this.store.update(workspaceId, { lastTurnAt: new Date().toISOString() });
    this._broadcast(workspaceId, 'exec_event', ev);
    this._notePermissionDenial(workspaceId, ev);
  }

  /**
   * Stop a run that is being refused rather than let it spend the afternoon
   * proving it (TKT-062).
   *
   * The failure this exists for is not an error: the CLI is working exactly as
   * asked, refusing tool calls nobody is there to approve, and it will exit 0
   * at the end of it. Nothing downstream can tell that from success, so the
   * only place to catch it is here, mid-stream, on the refusals themselves.
   *
   * Stopping is a SIGTERM, so the run is recorded as `stopped` — true, and not
   * `completed`. The message goes on the workspace before the stop so it is
   * already there when the exit handler lands, and it names the config key,
   * because "permission denied" without the key to change is the same dead end
   * the agent was in.
   */
  _notePermissionDenial(workspaceId, ev) {
    if (!isPermissionDenial(ev)) return;
    const seen = (this.permissionDenials.get(workspaceId) || 0) + 1;
    this.permissionDenials.set(workspaceId, seen);
    // Fires once, on the run that crosses the line — later refusals in the
    // window before the process dies must not stop it a second time.
    if (seen !== PERMISSION_DENIAL_LIMIT) return;

    const ws = this.store.get(workspaceId);
    if (!ws) return;
    const kind = isRepoRun(ws) ? 'repo' : 'worktree';
    const key = kind === 'repo' ? 'dashboard.repo_permission_mode' : 'dashboard.worktree_permission_mode';
    const mode = resolvePermissionMode(this.config, kind);
    const message =
      `Stopped after ${seen} permission refusals — this agent cannot do the work it was asked to do. ` +
      `It runs headless, so a permission prompt has nobody to answer it and the agent retries until ` +
      `it gives up, having written nothing. Raise ${key} (currently '${mode}') to ` +
      `${kind === 'repo' ? "'acceptEdits' or 'bypassPermissions'" : "'bypassPermissions'"} and run it again.`;

    this.store.update(workspaceId, { lastError: message });
    this._broadcast(workspaceId, 'permission_blocked', {
      denials: seen, permissionMode: mode, configKey: key, message,
    });

    const handle = this.runningProcesses.get(workspaceId);
    if (handle) handle.stop();
  }

  async _onExit(workspaceId, agent, sessionId, result, { headAtStart = null } = {}) {
    this.runningProcesses.delete(workspaceId);
    this.permissionDenials.delete(workspaceId);
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
    const buildRunRecord = (extra = {}) => newRun({
      workspace: ws,
      agent,
      sessionId,
      startedAt: ws.startedAt,
      endedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      signal: result.signal,
      error: result.error || null,
      costUsd: result.costUsd,
      ...extra,
    });

    if (isRepoRun(ws)) return this._onRepoRunExit(ws, buildRunRecord(), result);

    // Re-read the ticket's stage to detect advancement. From the shared board:
    // the agent's `bobby ticket move` landed there, and only there — and from
    // THIS workspace's board, which is where the agent has been writing for the
    // last several minutes, whatever the UI has been showing meanwhile.
    const ticket = findTicket(this._ticketsDirFor(ws), ws.ticketId);
    const newStage = ticket?.data?.stage || null;
    const stageAdvanced = newStage && newStage !== ws.stage;

    // Commit a checkpoint so the diff viewer always reflects a committed state.
    let checkpointSha = null;
    let checkpointError = null;
    try {
      checkpointSha = commitCheckpoint(ws.worktreePath, `bobby ${agent}: ${ws.ticketId} → ${newStage || 'work'}`);
    } catch (e) {
      // Commit failures are non-fatal — log and continue.
      checkpointError = e.message;
    }

    // Did this run leave anything behind? Read AFTER the checkpoint, so work
    // the agent left uncommitted counts as work — and so does work it committed
    // itself, which is what a build agent does and what made "nothing was
    // committed just now" the wrong question to ask.
    const producedNothing = this._producedNothing(ws, result, headAtStart, stageAdvanced);
    const noOpReason = producedNothing ? this._noOpReason(ws, agent, newStage) : null;

    const runRecord = buildRunRecord({
      producedNothing,
      error: result.error || noOpReason || null,
    });
    if (checkpointError) runRecord.checkpointError = checkpointError;

    let nextStatus = this._terminalStatus({ ...result, producedNothing });
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
    const lastError = this._lastErrorFor(result) || noOpReason;
    if (lastError) patch.lastError = lastError;

    this.store.update(workspaceId, patch);
    this._broadcast(workspaceId, 'run_end', { result, stageAdvanced, newStage, nextStatus });

    // Auto-approve: if the config says to auto-advance past this stage, kick off
    // the next agent immediately. From the RUN's config, not the UI's: whether
    // an unattended agent launches is the run's own project's policy, and
    // reading it live would let a switch to a project that auto-approves fire an
    // agent a run's own project never sanctioned — the exit path's decisions are
    // pinned for exactly this reason (TKT-022).
    if (nextStatus === 'awaiting_approval') {
      const autoApproveStages = this._configFor(ws)?.dashboard?.auto_approve_stages || [];
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
   * Did this worktree run achieve nothing at all — no code, no stage change
   * (TKT-062)?
   *
   * This is the question a `completed` used to answer wrongly. `claude -p`
   * exits 0 after being refused every write it attempted, and at the
   * orchestrator boundary that is indistinguishable from a stage done well. So
   * the boundary has to ask something an exit code cannot fake: is the
   * worktree's branch where it was when the agent started, and is the ticket
   * where it was on the board.
   *
   * UNKNOWN IS NOT NOTHING. If git could not say where the branch stood on
   * either side, this returns false: a run is only ever called a no-op on
   * evidence that it was one. The cost of a missed no-op is the status quo; the
   * cost of a wrong one is telling a user their working agent did nothing.
   *
   * Only worktree runs are judged. A repo run has no ticket to advance and no
   * branch of its own, and several of the agents that can be one (ux, pm, qe)
   * are SUPPOSED to write nothing — their output is the report in the log. A
   * blanket "wrote nothing" verdict there would cry wolf on every review.
   *
   * ONLY A CLEAN EXIT IS JUDGED. A run that crashed or was stopped — including
   * one this orchestrator stopped for being refused — already has an honest
   * status and a message that says more about why than this one could. Adding
   * "it also wrote nothing" there would only overwrite the better explanation
   * with a vaguer one.
   */
  _producedNothing(ws, result, headAtStart, stageAdvanced) {
    if (result.exitCode !== 0) return false;
    if (stageAdvanced) return false;
    if (!headAtStart) return false;
    const headNow = headSha(ws.worktreePath);
    if (!headNow) return false;
    return headNow === headAtStart;
  }

  /**
   * Why a run that finished cleanly is being recorded as a no-op, in the words
   * of someone who has to fix it. Names the config key, because the likeliest
   * cause by far is permission posture and the second-likeliest — an agent that
   * did its work but never ran `bobby ticket move` — is only distinguishable
   * from it by looking at the session log, which the message says to do.
   */
  _noOpReason(ws, agent, newStage) {
    const key = 'dashboard.worktree_permission_mode';
    const mode = resolvePermissionMode(this.config, 'worktree');
    return (
      `The ${agent} agent exited cleanly but changed nothing: no commits in its worktree, and ` +
      `${ws.ticketId} is still in '${newStage || ws.stage}'. The usual cause is permission posture — ` +
      `a headless agent that is refused a write retries until it gives up, and still exits 0. ` +
      `Check ${key} (currently '${mode}'; 'bypassPermissions' is the default and the only posture ` +
      `proven to complete a stage), then the session log for what it was refused.`
    );
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
   *
   * A run carrying `producedNothing` classifies as 'no_op' and keeps that name
   * on the workspace: it exited 0, so 'idle' would be the exact misreport this
   * is here to stop, and 'failed' would say the CLI broke when it did not.
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

    // The repo this workspace lives in (TKT-069). The `|| this.*` fallback keeps
    // pre-upgrade records — persisted before these fields existed — merging in
    // the launch repo, exactly as before.
    const repoRoot = ws.repoRoot || this.repoRoot;
    const lockFile = ws.lockFile || this.lockFile;

    const lock = acquireMainCheckoutLock(lockFile, {
      holder: `merge of ${ws.branch}`,
    });
    let mergeResult;
    try {
      mergeResult = this._mergeToMain(ws.branch, { message, repoRoot });
      // Remove worktree (branch is retained until explicit delete, so revert is possible)
      removeWorktree(repoRoot, ws.worktreePath, { deleteBranch: false });
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
    const mergedAtError = this._recordTicketMerge(ws, mergedAt);

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
  _recordTicketMerge(ws, mergedAt) {
    const ticketId = ws && ws.ticketId;
    if (!ticketId) return null;
    try {
      // The workspace's own board — a merge is as long-running as a run, and
      // stamping a same-named ticket on another project's board would be a
      // false record on a ticket nobody merged (TKT-022).
      updateTicket(this._ticketsDirFor(ws), ticketId, { mergedAt });
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
      const repoRoot = ws.repoRoot || this.repoRoot;
      try {
        removeWorktree(repoRoot, ws.worktreePath, { deleteBranch: true, branch: ws.branch, force });
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
    return diffAgainstMain(ws.repoRoot || this.repoRoot, ws.branch);
  }

  /**
   * The files a run changed — branch vs main for a worktree run, working tree
   * vs HEAD (plus untracked) for a repo run. Same shape either way.
   */
  getChangedFiles(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    if (isRepoRun(ws)) return workingChangedFiles(this.repoRoot);
    return changedFiles(ws.repoRoot || this.repoRoot, ws.branch);
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
    return getFeatureTickets(this._ticketsDirFor(ws), ws.ticketId);
  }

  /**
   * Read the session log entries for a workspace's most recent run.
   */
  readLatestSessionFile(workspaceId) {
    const ws = this.store.get(workspaceId);
    if (!ws || !ws.sessionId) return null;
    const filePath = path.join(this._sessionsDirFor(ws), `${ws.sessionId}.jsonl`);
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
  _requireTicket(ticketId, ticketsDir = this.ticketsDir) {
    const ticket = findTicket(ticketsDir, ticketId);
    if (ticket) return ticket;
    throw new Error(
      `Ticket ${ticketId} not found in ${ticketsDir}. Tickets are read from the ` +
      'main checkout, whatever branch it is on — if this ticket was created on another ' +
      'branch, check that branch out there first.'
    );
  }

  /**
   * The same, for a ticket that already has a workspace: read from the board
   * that workspace was pinned to, never the one the UI happens to be on.
   */
  _requireWorkspaceTicket(ws) {
    return this._requireTicket(ws.ticketId, this._ticketsDirFor(ws));
  }

  /**
   * The workflow THIS workspace advances through. A workspace records the
   * workflow it was created with (`ws.pipeline`, a name); the constructor
   * pipeline is only the server-wide default. Before this existed, a
   * workspace created with `pipeline: 'quick'` was recorded as quick but
   * advanced through the default workflow anyway.
   *
   * Always resolved against the RUN's own project config (TKT-022). `workflows`
   * is a per-project key and a workspace records only the workflow NAME, so the
   * same name resolves to different steps in different projects — beta's
   * `default` is not alpha's. The previous short-circuit returned the
   * constructor-captured `this.pipeline` whenever the name equalled the server
   * default, which for nearly every workspace (pipeline `default`) meant the
   * BOOT project's steps: a beta run advancing through alpha's workflow, silently
   * skipping any stage beta added — a security stage among them. `resolveWorkflow`
   * with `default` never throws, so a named workflow since deleted from that
   * project's config degrades to the project's own default rather than the boot
   * one.
   */
  _pipelineFor(ws) {
    const config = this._configFor(ws);
    const name = (ws && ws.pipeline) || this.pipelineName;
    try {
      return resolveWorkflow(config, name);
    } catch {
      return resolveWorkflow(config, 'default');
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
  _mergeToMain(branch, { repoRoot, message } = {}) {
    return mergeToMain(repoRoot || this.repoRoot, branch, { message });
  }

  /**
   * How many agents may run at once. Counted PER ORCHESTRATOR — and since
   * TKT-022 one orchestrator spans every project in a studio, so the budget is
   * SHARED across projects rather than held per project. Start three on alpha,
   * switch to beta, and one slot is left: correct, because all three are
   * subprocesses on this machine spending the same subscription, but not what
   * the old wording promised. The value is read off the ACTIVE project's config,
   * so a project that sets its own `max_concurrent` is honoured while you are in
   * it. Known gap, unchanged: nothing coordinates across processes, so a second
   * server on the same repo gets its own budget.
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

  /** A project-level event, on the global channel only (no workspace scope). */
  _broadcastGlobal(event, data) {
    if (this.sseHub) {
      this.sseHub.broadcast('global', { event, data, at: new Date().toISOString() });
    }
  }

  _logSessionEvent(workspaceId, entry) {
    const ws = this.store.get(workspaceId);
    if (!ws || !ws.sessionId) return;
    try {
      logEntry(this._sessionsDirFor(ws), ws.sessionId, entry);
    } catch { /* ignore */ }
  }
}
