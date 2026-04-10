// lib/pipeline.js
import { isValidStage, TRANSITIONS } from './stages.js';
import { findTicket, listTickets } from './tickets.js';
import { AGENT_REGISTRY } from './agent-registry.js';

export const DEFAULT_PIPELINE = [
  { stage: 'planning', agent: 'bobby-plan' },
  { stage: 'building', agent: 'bobby-build' },
  { stage: 'reviewing', agent: 'bobby-review' },
  { stage: 'testing', agent: 'bobby-test' },
];

/**
 * Resolve which agent should run next based on the ticket's current stage
 */
export function resolveNextAgent(pipeline, currentStage) {
  const step = pipeline.find(s => s.stage === currentStage);
  return step ? step.agent : null;
}

/**
 * Get the next stage name after the current one in the pipeline.
 * Returns 'shipping' if current is the last pipeline stage.
 */
function nextStageName(currentStage, pipeline) {
  const idx = pipeline.findIndex(s => s.stage === currentStage);
  if (idx < 0 || idx >= pipeline.length - 1) return 'shipping';
  return pipeline[idx + 1].stage;
}

/**
 * Build an orchestration prompt for Claude Code to follow.
 *
 * The orchestrator is a lightweight coordinator — it launches a **subagent**
 * for each pipeline stage instead of following skill instructions inline.
 * This keeps each stage's context clean and prevents cross-stage pollution.
 */
export function buildOrchestrationPrompt(ticketIds, pipeline, maxRetries = 3, ticketsDir = '.bobby/tickets', maxIterations = 20, agentsPath = '.claude/agents', hasServices = false) {
  const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];

  const serviceContext = hasServices
    ? `Read the ticket's \`services\` frontmatter field. If present, read \`.bobbyrc.yml\` services to get each service's path and commands — include this context in the subagent prompt so it runs test/lint/build from the correct service directory.`
    : '';

  const steps = pipeline.map((s, i) => {
    const next = nextStageName(s.stage, pipeline);
    const preGate = s.stage === 'testing'
      ? `\n     a) **Pre-gate:** Before launching the subagent, verify the app is running by curling the project's health check URLs. If health checks fail, start the dev server first. The test agent must test the live app, not run specs.`
      : '';
    return `${i + 1}. If stage is "${s.stage}":${preGate}\n` +
      `     ${preGate ? 'b' : 'a'}) Claim: \`bobby assign {TICKET_ID} ${s.agent}\`\n` +
      `     ${preGate ? 'c' : 'b'}) **Launch a subagent** (using the Agent tool) with **exactly** this prompt — do NOT rephrase, summarize, or write your own version:\n` +
      `        "You are ${s.agent} working on ticket {TICKET_ID}.\n` +
      `         1. Read \`${ticketsDir}/{TICKET_ID}*/ticket.md\` to load context.\n` +
      `         2. CRITICAL: Read and follow \`${agentsPath}/${s.agent}.md\` end-to-end. This file contains your full workflow — do NOT skip it or improvise your own.\n` +
      `         3. When done, move: \`bobby move {TICKET_ID} ${next}\`.\n` +
      `         4. Verify: \`git status --short\` — no uncommitted source files."\n` +
      `     ${preGate ? 'd' : 'c'}) After the subagent finishes, re-read \`ticket.md\` frontmatter to confirm the stage advanced.`;
  }).join('\n');

  const ticketList = ids.map(id => `- ${id}`).join('\n');

  return `You are orchestrating a Bobby pipeline for the following ticket(s):
${ticketList}

**Your role is coordination, not execution.** For each pipeline stage, launch a subagent to do the work. Do not follow skill instructions inline — each subagent gets a fresh context with only the ticket and skill it needs.

**Guardrails:**
- Always use \`bobby create\` to make tickets. Never write ticket files manually.
- Do not create separate task/todo lists — the ticket stage in \`ticket.md\` frontmatter is the sole progress tracker.
- Never suppress errors (no \`2>/dev/null\`, no \`|| true\`). If a command fails, investigate.

**Before starting any work:**
0. Branch guard: run \`git branch --show-current\`. If on main/master, create a feature branch: \`git checkout -b tkt-${ids[0]}\` before running any agents. NEVER commit directly to main/master.

**Safety limits:** Max retries per ticket: ${maxRetries}. Max total agent invocations across all tickets: ${maxIterations}. Stop and report if either cap is hit.
${hasServices ? `\n**Multi-service project:** ${serviceContext}\n` : ''}
Process each ticket sequentially. For each ticket:

1. Read the ticket's \`ticket.md\` from \`${ticketsDir}/\` to determine the current stage (in frontmatter).

2. Based on the current stage, launch the appropriate subagent (replace {TICKET_ID} with the actual ticket ID):
${steps}

3. If the stage advanced to the next pipeline step, continue to the next agent.

4. If the stage went back to "building" (rejection), the subagent rejected the work. Loop back and launch a bobby-build subagent again. Maximum retries: ${maxRetries}. **On the 2nd retry failure**, launch a bobby-debug subagent (prompt: "Follow \`${agentsPath}/bobby-debug.md\` on ticket {TICKET_ID}") before the 3rd build attempt — the debug agent's structured investigation often breaks deadlocks that repeated build attempts cannot.

5. If the stage is "shipping", this ticket's pipeline is complete. Move to the next ticket.

6. If the stage is "blocked", stop this ticket and report the blocker. Move to the next ticket.

7. If max retries are exceeded, stop this ticket and report the failure. Move to the next ticket.

After all tickets are processed, report the final status of each ticket.`;
}

/**
 * Build a prompt for running a single agent on a ticket
 */
export function buildSingleAgentPrompt(agent, ticketId, ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents', hasServices = false) {
  const serviceHint = hasServices
    ? `\n3. Check the ticket's \`services\` frontmatter field. If present, read \`.bobbyrc.yml\` services to get each service's path and commands. Run test/lint/build from within each service's directory.`
    : '';
  const stepOffset = hasServices ? 1 : 0;
  return `Run the ${agent} agent on ticket ${ticketId}.

1. Claim the ticket: \`bobby assign ${ticketId} ${agent}\`
2. Read \`${ticketsDir}/${ticketId}*/ticket.md\` to load the ticket context.${serviceHint}
${3 + stepOffset}. Follow the instructions in \`${agentsPath}/${agent}.md\`.
${4 + stepOffset}. When complete, update the ticket stage using \`bobby move\`.
${5 + stepOffset}. Verify \`git status --short\` shows no uncommitted source files.`;
}

/**
 * Build a prompt from an agent registry entry.
 * Handles ticket-required, freeform, and cowork agents generically.
 */
export function buildGenericPrompt(entry, { ticketId, ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents' } = {}) {
  const header = entry.promptHeader
    .replace(/\{ticketId\}/g, ticketId || '{ID}')
    .replace(/\{ticketsDir\}/g, ticketsDir)
    .replace(/\{agentsPath\}/g, agentsPath);

  const claimStep = ticketId
    ? `\n\n1. Claim the ticket: \`bobby assign ${ticketId} ${entry.agentName}\``
    : '';
  const startNum = ticketId ? 2 : 1;

  const steps = entry.promptSteps.map((step, i) => {
    const filled = step
      .replace(/\{ticketId\}/g, ticketId || '{ID}')
      .replace(/\{ticketsDir\}/g, ticketsDir)
      .replace(/\{agentsPath\}/g, agentsPath);
    return `${startNum + i}. ${filled}`;
  }).join('\n');

  return `${header}${claimStep}\n${steps}`;
}

/**
 * Build a prompt for the next agent based on ticket's current stage
 */
export function buildNextStepPrompt(ticketId, pipeline, ticketsDir, ticketsRelDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  const ticket = findTicket(ticketsDir, ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
  const { stage } = ticket.data;

  if (stage === 'blocked')
    return `Ticket ${ticketId} is blocked: ${ticket.data.blocked_reason || 'no reason given'}.\nResolve the blocker, then: bobby move ${ticketId} unblock`;
  if (stage === 'done')
    return `Ticket ${ticketId} is already done.`;
  if (stage === 'shipping')
    return `Ticket ${ticketId} is ready to ship.\nRun: bobby run ship`;
  if (stage === 'backlog')
    return `Ticket ${ticketId} is in backlog.\nRun strategic validation first: bobby run strategy ${ticketId}\nOr move directly to planning: bobby move ${ticketId} plan`;

  const agent = resolveNextAgent(pipeline, stage);
  if (!agent)
    return `No agent mapped for stage "${stage}".`;
  return buildSingleAgentPrompt(agent, ticketId, ticketsRelDir, agentsPath);
}

/**
 * Build a prompt for running an agent on multiple tickets in parallel subagents
 */
export function buildBatchStagePrompt(agent, ticketIds, ticketsDir = '.bobby/tickets', isolation = 'none', agentsPath = '.claude/agents') {
  const ticketList = ticketIds.map(id => `- ${id}`).join('\n');

  if (isolation === 'worktree') {
    return `Run ${agent} on ${ticketIds.length} ticket(s) in parallel using subagents with worktree isolation.

Tickets:
${ticketList}

For each ticket, launch a subagent with isolation: "worktree" and this prompt:
  Run the ${agent} agent on ticket {ID}.
  1. Create a feature branch: \`git checkout -b tkt-{ID}\`
  2. Claim the ticket: \`bobby assign {ID} ${agent}\`
  3. Read \`${ticketsDir}/{ID}*/ticket.md\` to load the ticket context.
  4. CRITICAL: Read and follow \`${agentsPath}/${agent}.md\` end-to-end. This file contains your full workflow — do NOT skip it or improvise your own.
  5. When complete, update the ticket stage using \`bobby move\`.
  6. Commit all changes and verify \`git status --short\` is clean.

Launch all subagents in parallel (single message with multiple Agent tool calls, each with isolation: "worktree").
After all complete, report the status of each ticket and the worktree branch name for each.`;
  }

  return `Run ${agent} on ${ticketIds.length} ticket(s) in parallel using subagents.

Tickets:
${ticketList}

For each ticket, launch a subagent with this prompt:
  Run the ${agent} agent on ticket {ID}.
  1. Claim the ticket: \`bobby assign {ID} ${agent}\`
  2. Read \`${ticketsDir}/{ID}*/ticket.md\` to load the ticket context.
  3. CRITICAL: Read and follow \`${agentsPath}/${agent}.md\` end-to-end. This file contains your full workflow — do NOT skip it or improvise your own.
  4. When complete, update the ticket stage using \`bobby move\`.

Launch all subagents in parallel (single message with multiple Agent tool calls).
After all complete, report the status of each ticket.`;
}

/**
 * Build a prompt for the security audit agent
 */
export function buildSecurityPrompt(ticketId, ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.security, { ticketId, ticketsDir, agentsPath });
}

/**
 * Build a prompt for the debug/investigation agent
 */
export function buildDebugPrompt(ticketId, ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.debug, { ticketId, ticketsDir, agentsPath });
}

/**
 * Build a prompt for the documentation update agent
 */
export function buildDocsPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.docs, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for the performance benchmarking agent
 */
export function buildPerformancePrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.performance, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for the post-deploy watchdog agent
 */
export function buildWatchdogPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.watchdog, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for a freeform UX design audit
 */
export function buildUxPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.ux, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for a freeform PM product review
 */
export function buildPmPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.pm, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for a freeform QE testing session
 */
export function buildQePrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.qe, { ticketsDir, agentsPath });
}


/**
 * Build a prompt for the vet agent (design interrogation before planning)
 */
export function buildVetPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.vet, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for the strategy gate agent (pre-planning validation)
 */
export function buildStrategyPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return buildGenericPrompt(AGENT_REGISTRY.strategy, { ticketsDir, agentsPath });
}

/**
 * Build a prompt for the ship command
 */
export function buildShipPrompt(ticketsDir = '.bobby/tickets', repos = [], agentsPath = '.claude/agents') {
  const repoSteps = repos.length > 0
    ? `3. This is a multi-repo project. For EACH repo:\n${repos.map((r, i) =>
        `   ${String.fromCharCode(97 + i)}) cd ${r.path} → rebase onto origin/main → push → create PR`
      ).join('\n')}\n4. Create PRs for ALL repos. Wait for CI on each. Do NOT merge — report PR URLs to the user.\n5.`
    : `3. Rebase onto origin/main, then create a PR from the current branch and wait for CI. Do NOT merge — report the PR URL to the user.\n4.`;

  return `Run the bobby-ship agent.

1. Run \`bobby list shipping\` to see all tickets ready to ship.
2. Follow the instructions in \`${agentsPath}/bobby-ship.md\`.
${repoSteps} Move each shipped ticket to done: \`bobby move {ID} done\`.`;
}

/**
 * Unified prompt builder — single entry point for dispatching an agent invocation
 * to the right specialized builder. Used by both `bobby run` (CLI) and the
 * dashboard executor. Pure function: no console.log, no process.exit, no fs
 * mutations. Throws Error on invalid input.
 *
 * @param {string} agent - agent key from AGENT_REGISTRY (plan/build/pipeline/feature/ship/etc.)
 * @param {string[]} ticketIds - array of ticket IDs (may be empty for batch/freeform agents)
 * @param {object} ctx - resolved context:
 *   - config            (object)  result of readConfig()
 *   - ticketsDir        (string)  absolute path to tickets dir (for findTicket)
 *   - ticketsRelDir     (string)  relative path for prompt text (config.tickets_dir)
 *   - agentsPath        (string)  target.paths().agents
 *   - pipeline          (array)   resolved pipeline array
 *   - maxRetries        (number)
 *   - maxIterations     (number|undefined)
 *   - hasServices       (boolean)
 *   - epicData          (object|undefined) for feature mode: { epicId, epic, children }
 * @returns {{ prompt: string, label: string, subtitle?: string }}
 */
export function buildPromptFor(agent, ticketIds, ctx) {
  const {
    config,
    ticketsDir,
    ticketsRelDir,
    agentsPath,
    pipeline,
    maxRetries = 3,
    maxIterations,
    hasServices = false,
    epicData,
  } = ctx;

  const ids = Array.isArray(ticketIds) ? ticketIds : (ticketIds ? [ticketIds] : []);

  // --- Custom agents ---
  if (agent === 'ship') {
    return {
      prompt: buildShipPrompt(ticketsRelDir, config.repos || [], agentsPath),
      label: 'Bobby Ship',
    };
  }

  if (agent === 'pipeline') {
    if (ids.length === 0) {
      throw new Error('Pipeline mode requires at least one ticket ID');
    }
    for (const id of ids) {
      if (!findTicket(ticketsDir, id)) throw new Error(`Ticket ${id} not found`);
    }
    return {
      prompt: buildOrchestrationPrompt(ids, pipeline, maxRetries, ticketsRelDir, maxIterations, agentsPath, hasServices),
      label: `Bobby Pipeline — ${ids.length} ticket(s)`,
    };
  }

  if (agent === 'feature') {
    if (!epicData || !epicData.epic || !epicData.children) {
      throw new Error('Feature mode requires resolved epicData: { epicId, epic, children }');
    }
    const { epicId, epic, children } = epicData;
    if (children.length === 0) {
      throw new Error(`Epic ${epicId} has no child tickets`);
    }
    const needsPlanning = children.filter(t => ['backlog', 'planning'].includes(t.stage));
    const childIds = children.map(t => t.id);
    const subtitle = needsPlanning.length > 0
      ? `Phase 1: Plan ${needsPlanning.length} ticket(s) → Phase 2: Execute ${childIds.join(' → ')}`
      : `All planned → Execute ${childIds.join(' → ')}`;
    return {
      prompt: buildFeaturePrompt(epicId, epic.data.title, children, pipeline, maxRetries, ticketsRelDir, maxIterations, agentsPath),
      label: `Bobby Feature — ${epicId}: ${epic.data.title}`,
      subtitle,
    };
  }

  if (agent === 'next') {
    if (ids.length === 0) throw new Error('Usage: bobby run next <ticketId>');
    const ticketId = ids[0];
    const found = findTicket(ticketsDir, ticketId);
    const stageLabel = found ? ` [${found.data.stage}]` : '';
    return {
      prompt: buildNextStepPrompt(ticketId, pipeline, ticketsDir, ticketsRelDir, agentsPath),
      label: `Bobby Next — ${ticketId}${stageLabel}`,
    };
  }

  // --- Registry-driven agents ---
  const reg = AGENT_REGISTRY[agent];
  if (!reg) throw new Error(`Unknown agent '${agent}'`);

  if (reg.promptSteps) {
    let prompt;
    if (reg.cowork && ids.length > 0) {
      const ticketId = ids[0];
      if (!findTicket(ticketsDir, ticketId)) throw new Error(`Ticket ${ticketId} not found`);
      prompt = buildSingleAgentPrompt(reg.agentName, ticketId, ticketsRelDir, agentsPath, hasServices);
    } else if (reg.requiresTicket) {
      if (ids.length === 0) throw new Error(`Usage: bobby run ${agent} <ticketId>`);
      const ticketId = ids[0];
      if (!findTicket(ticketsDir, ticketId)) throw new Error(`Ticket ${ticketId} not found`);
      prompt = buildGenericPrompt(reg, { ticketId, ticketsDir: ticketsRelDir, agentsPath });
    } else {
      prompt = buildGenericPrompt(reg, { ticketsDir: ticketsRelDir, agentsPath });
    }
    const ticketSuffix = ids.length > 0 ? ` — ${ids[0]}` : '';
    return { prompt, label: `${reg.label}${ticketSuffix}` };
  }

  // --- Standard pipeline agents (plan/build/review/test) — single or batch ---
  if (ids.length === 0) {
    const stage = TRANSITIONS[agent];
    if (!stage) throw new Error(`Usage: bobby run ${agent} <ticketId>`);
    const stageTickets = listTickets(ticketsDir, { stage });
    const available = stageTickets.filter(t => !t.assigned);
    if (available.length === 0) {
      if (stageTickets.length > 0) {
        throw new Error(`No available tickets in "${stage}" stage (${stageTickets.length} assigned).`);
      }
      throw new Error(`No tickets in "${stage}" stage.`);
    }
    const batchIds = available.map(t => t.id);
    const isolation = config.parallel_isolation || 'none';
    const isolationLabel = isolation === 'worktree' ? ' (worktree-isolated)' : '';
    return {
      prompt: buildBatchStagePrompt(reg.agentName, batchIds, ticketsRelDir, isolation, agentsPath),
      label: `${reg.label} — ${batchIds.length} ticket(s) in ${stage}${isolationLabel}`,
    };
  }

  const ticketId = ids[0];
  if (!findTicket(ticketsDir, ticketId)) throw new Error(`Ticket ${ticketId} not found`);
  return {
    prompt: buildSingleAgentPrompt(reg.agentName, ticketId, ticketsRelDir, agentsPath, hasServices),
    label: `${reg.label} — ${ticketId}`,
  };
}

/**
 * Build a prompt for running a full feature workflow (epic + children on one branch)
 */
export function buildFeaturePrompt(epicId, epicTitle, childTickets, pipeline, maxRetries = 3, ticketsDir = '.bobby/tickets', maxIterations, agentsPath = '.claude/agents') {
  // Dynamic default: each ticket needs up to pipeline.length agents, ×2 for retry headroom
  if (!maxIterations) {
    maxIterations = childTickets.length * pipeline.length * 2;
  }
  const slug = epicTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const branchName = `feature/${epicId.toLowerCase()}-${slug}`;
  const epicDir = `${ticketsDir}/${epicId}*`;
  const featurePlanPath = `${epicDir}/feature-plan.md`;

  // Separate tickets needing planning from those past it
  const needsPlanning = childTickets.filter(t => ['backlog', 'planning'].includes(t.stage));
  const pastPlanning = childTickets.filter(t => !['backlog', 'planning'].includes(t.stage));

  // Build execution-phase agent steps (building onward — skip planning stage)
  const execPipeline = pipeline.filter(s => s.stage !== 'planning');
  const execSteps = execPipeline.map((s, i) => {
    const next = nextStageName(s.stage, pipeline);
    return `${i + 1}. If stage is "${s.stage}":\n` +
      `     a) Claim: \`bobby assign {TICKET_ID} ${s.agent}\`\n` +
      `     b) Read \`${ticketsDir}/{TICKET_ID}*/ticket.md\` to load ticket context\n` +
      `     c) Read \`${featurePlanPath}\` for cross-cutting feature context\n` +
      `     d) Follow the instructions in \`${agentsPath}/${s.agent}.md\`\n` +
      `     e) When done, move: \`bobby move {TICKET_ID} ${next}\`\n` +
      `     f) Verify: \`git status --short\` — no uncommitted source files`;
  }).join('\n');

  const ticketList = childTickets.map((t, i) =>
    `${i + 1}. ${t.id} — "${t.title}" [${t.priority}] (${t.stage})`
  ).join('\n');

  // Build sibling plan paths for planning context
  const siblingPlanPaths = childTickets.map(t =>
    `  - \`${ticketsDir}/${t.id}*/plan.md\``
  ).join('\n');

  // Phase 1: Holistic Planning
  const planningPhase = needsPlanning.length > 0 ? `
---

## Phase 1 — Holistic Planning

Plan ALL tickets before building any. This ensures consistent patterns, shared utilities, and coherent architecture across the feature.

**Tickets to plan:** ${needsPlanning.map(t => t.id).join(', ')}
${pastPlanning.length > 0 ? `**Already past planning (read their plan.md for context):** ${pastPlanning.map(t => t.id).join(', ')}` : ''}

For each ticket that needs planning (in order). **Do NOT move tickets out of backlog until it is that ticket's turn:**

1. Claim and move to planning: \`bobby assign {TICKET_ID} bobby-plan\` then \`bobby move {TICKET_ID} plan\`
2. Read the ticket's \`ticket.md\` for context
3. Read all existing sibling plan.md files for cross-ticket context:
${siblingPlanPaths}
4. Read \`${featurePlanPath}\` if it exists (from a prior run or earlier ticket in this phase)
5. Follow \`${agentsPath}/bobby-plan.md\` — the skill will detect Feature-Aware Refine Mode when it sees the ticket has a parent epic
6. After planning, verify \`plan.md\` and \`test-cases.md\` were created in the ticket folder
7. Move to building: \`bobby move {TICKET_ID} build\`
8. Verify: \`git status --short\` — no uncommitted source files

**Feature plan management:**
- After the FIRST ticket is planned, create \`${featurePlanPath}\` capturing cross-cutting decisions:
  - Architecture decisions, shared utilities, naming conventions, ticket dependencies, out-of-scope items
- After EACH subsequent ticket is planned, update \`${featurePlanPath}\` with any new shared decisions
- After ALL tickets are planned, review \`${featurePlanPath}\` holistically for consistency. Update if later plans revealed better approaches.
` : `
---

## Phase 1 — Holistic Planning

All tickets are already past planning. Skipping to Phase 2.
${!pastPlanning.length ? '' : `Read existing plans for context: ${pastPlanning.map(t => `\`${ticketsDir}/${t.id}*/plan.md\``).join(', ')}`}
`;

  return `You are running a Bobby feature workflow for epic ${epicId}: "${epicTitle}"

This epic contains ${childTickets.length} child ticket(s) to implement on a single feature branch.
The workflow has two phases: (1) plan all tickets holistically, then (2) build/review/test each sequentially.

**Isolation:** This workflow runs in an isolated worktree. Your working directory is clean and separate from the user's main checkout — commit freely without worrying about stashing or switching branches.

**Before starting any work:**
0. Branch guard: run \`git branch --show-current\`. If on main/master, create a feature branch:
   \`git checkout -b ${branchName}\`
   NEVER commit directly to main/master.

**Safety limits:** Max retries per ticket: ${maxRetries}. Max total agent invocations: ${maxIterations}. Stop and report if either cap is hit.

**Ticket order:**
${ticketList}
${planningPhase}
---

## Phase 2 — Sequential Execution

Now build, review, and test each ticket in order. Every agent should read \`${featurePlanPath}\` for cross-cutting context.

For each ticket (replace {TICKET_ID} with the actual ticket ID):

1. Read the ticket's \`ticket.md\` from \`${ticketsDir}/\` to determine the current stage.

2. Based on the current stage, run the appropriate agent:
${execSteps}

3. After each agent completes, re-read \`ticket.md\` frontmatter to confirm the stage advanced.

4. If the stage advanced to the next pipeline step, continue to the next agent.

5. If the stage went back to "building" (rejection), loop back and run bobby-build again. Maximum retries: ${maxRetries}. The build agent should read the rejection comment in ticket.md to understand what to fix. **On the 2nd retry failure**, run bobby-debug (follow \`${agentsPath}/bobby-debug.md\`) before the 3rd build attempt.

6. If the stage is "shipping", this ticket's pipeline is complete.

7. If the stage is "blocked", skip this ticket and continue with the next. Report the blocker at the end.

8. If max retries are exceeded, skip this ticket and continue with the next.

9. If the stage is "backlog" or "planning", this is an error — it should have been handled in Phase 1. Stop and report.

**Between tickets:**
- After each ticket reaches "shipping", run the project's full test suite to catch integration issues early.
- If tests fail, the most recent ticket's changes likely caused it. Move it back to building and retry.

---

## After All Tickets

1. Run the full test suite one final time.
2. Run lint if configured.
3. If everything passes, move the epic to shipping: \`bobby move ${epicId} ship\`
4. Report the final status of each ticket and the epic.`;
}
