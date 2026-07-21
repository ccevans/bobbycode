// lib/workflow.js
import { isValidStage, TRANSITIONS } from './stages.js';
import { findTicket, listTickets } from './tickets.js';
import { AGENT_REGISTRY } from './agent-registry.js';

export const DEFAULT_WORKFLOW = [
  { stage: 'planning', agent: 'bobby-plan' },
  { stage: 'building', agent: 'bobby-build' },
  { stage: 'reviewing', agent: 'bobby-review' },
  { stage: 'testing', agent: 'bobby-test' },
];

// Built-in workflows, always available without any config. Users add or override
// their own under `workflows:` in .bobbyrc.yml. (Internally the code says
// "workflow"; the user-facing name for the concept is "workflow".)
export const BUILT_IN_WORKFLOWS = {
  default: ['plan', 'build', 'review', 'test'],
  secure: ['plan', 'build', 'security', 'review', 'test'],
  quick: ['plan', 'build', 'test'],
};

const STAGE_MAP = {
  plan: 'planning', build: 'building', review: 'reviewing',
  test: 'testing', ship: 'shipping', security: 'reviewing', debug: 'building',
};

/**
 * Parse a workflow definition (array of step names) into stage/agent objects.
 */
function parseSteps(steps) {
  return steps.map(step => {
    if (typeof step === 'string') {
      return { stage: STAGE_MAP[step] || step, agent: `bobby-${step}` };
    }
    return step;
  });
}

// All named workflows: built-ins merged with the user's `workflows:` config
// (config wins on name collision). Reads the legacy `pipelines:` key too.
function allWorkflows(config) {
  const userDefined = config.workflows || config.pipelines || {};
  return { ...BUILT_IN_WORKFLOWS, ...userDefined };
}

/**
 * Resolve the workflow to use, with this precedence:
 *   1. Explicit --workflow flag (unless 'default')
 *   2. Ticket frontmatter `workflow` field
 *   3. A named workflow (built-in or config)
 *   4. Built-in DEFAULT_WORKFLOW
 *
 * @param {object} config     - readConfig() result
 * @param {string} name       - workflow name from --workflow flag (default: 'default')
 * @param {string|null} ticketPipeline - workflow name from ticket frontmatter
 * @returns {Array<{stage: string, agent: string}>}
 */
export function resolveWorkflow(config, name = 'default', ticketPipeline = null) {
  // Explicit flag takes priority (unless it's just the default placeholder)
  const effectiveName = (name !== 'default') ? name : (ticketPipeline || 'default');

  const workflows = allWorkflows(config);
  if (workflows[effectiveName]) {
    const def = workflows[effectiveName];
    return Array.isArray(def) ? parseSteps(def) : DEFAULT_WORKFLOW;
  }
  if (effectiveName !== 'default') {
    throw new Error(`Unknown workflow '${effectiveName}'. Available: ${Object.keys(workflows).join(', ')}`);
  }
  return DEFAULT_WORKFLOW;
}

/**
 * List all workflow names (built-ins + config).
 */
export function listWorkflows(config) {
  return Object.keys(allWorkflows(config));
}

/**
 * Resolve which agent should run next based on the ticket's current stage
 */
export function resolveNextAgent(workflow, currentStage) {
  const step = workflow.find(s => s.stage === currentStage);
  return step ? step.agent : null;
}

/**
 * Get the next stage name after the current one in the workflow.
 * Returns 'shipping' if current is the last workflow stage.
 */
function nextStageName(currentStage, workflow) {
  const idx = workflow.findIndex(s => s.stage === currentStage);
  if (idx < 0 || idx >= workflow.length - 1) return 'shipping';
  return workflow[idx + 1].stage;
}

/**
 * Build an orchestration prompt for Claude Code to follow.
 *
 * The orchestrator is a lightweight coordinator — it launches a **subagent**
 * for each workflow stage instead of following skill instructions inline.
 * This keeps each stage's context clean and prevents cross-stage pollution.
 */
/**
 * Shared fragment: per-stage subagent-launch steps. Used by both the workflow
 * and sprint orchestrators (the feature workflow runs agents inline instead).
 * `planReadPath` injects an extra "read the shared plan" step (sprints).
 */
function buildSubagentSteps(workflow, { ticketsDir, agentsPath, planReadPath = '' }) {
  const planRead = planReadPath
    ? `\n         2. Read \`${planReadPath}\` for sprint-wide context (sequencing, shared decisions, out-of-scope).`
    : '';
  const planOffset = planReadPath ? 1 : 0;

  return workflow.map((s, i) => {
    const next = nextStageName(s.stage, workflow);
    const preGate = s.stage === 'testing'
      ? `\n     a) **Pre-gate:** Before launching the subagent, verify the app is running by curling the project's health check URLs. If health checks fail, start the dev server first. The test agent must test the live app, not run specs.`
      : '';
    const k = preGate ? { claim: 'b', launch: 'c', verify: 'd' } : { claim: 'a', launch: 'b', verify: 'c' };
    return `${i + 1}. If stage is "${s.stage}":${preGate}\n` +
      `     ${k.claim}) Claim: \`bobby ticket assign {TICKET_ID} ${s.agent}\`\n` +
      `     ${k.launch}) **Launch a subagent** (using the Agent tool) with **exactly** this prompt — do NOT rephrase, summarize, or improvise:\n` +
      `        "You are ${s.agent} working on ticket {TICKET_ID}.\n` +
      `         1. Read \`${ticketsDir}/{TICKET_ID}*/ticket.md\` to load context.${planRead}\n` +
      `         ${2 + planOffset}. CRITICAL: Read and follow \`${agentsPath}/${s.agent}.md\` end-to-end — this file contains your full workflow. Do NOT skip it or improvise your own.\n` +
      `         ${3 + planOffset}. When done, move: \`bobby ticket move {TICKET_ID} ${next}\`.\n` +
      `         ${4 + planOffset}. Verify: \`git status --short\` — no uncommitted source files."\n` +
      `     ${k.verify}) After the subagent finishes, re-read \`ticket.md\` frontmatter to confirm the stage advanced.`;
  }).join('\n');
}

/**
 * Shared fragment: pre-flight stage gates (done / blocked / backlog).
 * Identical for workflow and sprint orchestration.
 */
function buildPreflightGates(firstStage) {
  return `**Pre-flight stage gates** — handle non-workflow stages before launching any subagent:
   - If stage is **"done"**: this ticket is already complete. Skip it, note it in the final report, and move to the next ticket.
   - If stage is **"blocked"**: stop this ticket, report \`blocked_reason\` from the frontmatter, and move to the next ticket.
   - If stage is **"backlog"**: advance to the first workflow stage now — \`bobby ticket move {TICKET_ID} ${firstStage}\` — then re-read \`ticket.md\` and continue with the new stage.`;
}

/**
 * Shared fragment: rejection retry loop with the bobby-debug escalation on the
 * 2nd failure. Identical for workflow and sprint orchestration.
 */
function buildRetryDebugClause(maxRetries, agentsPath) {
  return `If the stage went back to "building" (rejection), the subagent rejected the work. Loop back and launch a bobby-build subagent again. Maximum retries: ${maxRetries}. **On the 2nd retry failure**, launch a bobby-debug subagent (prompt: "Follow \`${agentsPath}/bobby-debug.md\` on ticket {TICKET_ID}") before the 3rd build attempt — the debug agent's structured investigation often breaks deadlocks that repeated build attempts cannot.`;
}

export function buildOrchestrationPrompt(ticketIds, workflow, maxRetries = 3, ticketsDir = '.bobby/tickets', maxIterations = 20, agentsPath = '.claude/agents', hasServices = false, gitConventions = {}) {
  const ids = Array.isArray(ticketIds) ? ticketIds : [ticketIds];
  const ticketBranchPrefix = gitConventions.ticket_branch_prefix || 'tkt';
  const firstStage = workflow[0]?.stage || 'planning';

  const serviceContext = hasServices
    ? `Read the ticket's \`services\` frontmatter field. If present, read \`.bobbyrc.yml\` services to get each service's path and commands — include this context in the subagent prompt so it runs test/lint/build from the correct service directory.`
    : '';

  const steps = buildSubagentSteps(workflow, { ticketsDir, agentsPath });

  const ticketList = ids.map(id => `- ${id}`).join('\n');

  return `You are orchestrating a Bobby workflow for the following ticket(s):
${ticketList}

**Your role is coordination, not execution.** For each workflow stage, launch a subagent to do the work. Do not follow skill instructions inline — each subagent gets a fresh context with only the ticket and skill it needs.

**Guardrails:**
- Always use \`bobby ticket create\` to make tickets. Never write ticket files manually.
- Do not create separate task/todo lists — the ticket stage in \`ticket.md\` frontmatter is the sole progress tracker.
- Never suppress errors (no \`2>/dev/null\`, no \`|| true\`). If a command fails, investigate.

**Before starting any work:**
0. Branch guard: run \`git branch --show-current\`. If on main/master, create a feature branch: \`git checkout -b ${ticketBranchPrefix}-${ids[0]}\` before running any agents. NEVER commit directly to main/master.

**Safety limits:** Max retries per ticket: ${maxRetries}. Max total agent invocations across all tickets: ${maxIterations}. Stop and report if either cap is hit.
${hasServices ? `\n**Multi-service project:** ${serviceContext}\n` : ''}
Process each ticket sequentially. For each ticket:

1. Read the ticket's \`ticket.md\` from \`${ticketsDir}/\` to determine the current stage (in frontmatter).

2. ${buildPreflightGates(firstStage)}

3. Based on the current stage, launch the appropriate subagent (replace {TICKET_ID} with the actual ticket ID):
${steps}

4. If the stage advanced to the next workflow step, continue to the next agent.

5. ${buildRetryDebugClause(maxRetries, agentsPath)}

6. If the stage is "shipping", this ticket's workflow is complete. Move to the next ticket.

7. If max retries are exceeded, stop this ticket and report the failure. Move to the next ticket.

8. If the stage is anything else not covered above (e.g., outside the configured workflow), log a warning and move to the next ticket — do not silently skip.

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

1. Claim the ticket: \`bobby ticket assign ${ticketId} ${agent}\`
2. Read \`${ticketsDir}/${ticketId}*/ticket.md\` to load the ticket context.${serviceHint}
${3 + stepOffset}. Follow the instructions in \`${agentsPath}/${agent}.md\`.
${4 + stepOffset}. When complete, update the ticket stage using \`bobby ticket move\`.
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
    ? `\n\n1. Claim the ticket: \`bobby ticket assign ${ticketId} ${entry.agentName}\``
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
export function buildNextStepPrompt(ticketId, workflow, ticketsDir, ticketsRelDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  const ticket = findTicket(ticketsDir, ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
  const { stage } = ticket.data;

  if (stage === 'blocked')
    return `Ticket ${ticketId} is blocked: ${ticket.data.blocked_reason || 'no reason given'}.\nResolve the blocker, then: bobby ticket move ${ticketId} unblock`;
  if (stage === 'done')
    return `Ticket ${ticketId} is already done.`;
  if (stage === 'shipping')
    return `Ticket ${ticketId} is ready to ship.\nRun: bobby run ship`;
  if (stage === 'backlog')
    return `Ticket ${ticketId} is in backlog.\nRun strategic validation first: bobby run strategy ${ticketId}\nOr move directly to planning: bobby ticket move ${ticketId} plan`;

  const agent = resolveNextAgent(workflow, stage);
  if (!agent)
    return `No agent mapped for stage "${stage}".`;
  return buildSingleAgentPrompt(agent, ticketId, ticketsRelDir, agentsPath);
}

/**
 * Build a prompt for running an agent on multiple tickets in parallel subagents
 */
export function buildBatchStagePrompt(agent, ticketIds, ticketsDir = '.bobby/tickets', isolation = 'none', agentsPath = '.claude/agents', gitConventions = {}) {
  const ticketList = ticketIds.map(id => `- ${id}`).join('\n');

  if (isolation === 'worktree') {
    return `Run ${agent} on ${ticketIds.length} ticket(s) in parallel using subagents with worktree isolation.

Tickets:
${ticketList}

For each ticket, launch a subagent with isolation: "worktree" and this prompt:
  Run the ${agent} agent on ticket {ID}.
  1. Create a feature branch: \`git checkout -b ${gitConventions.ticket_branch_prefix || 'tkt'}-{ID}\`
  2. Claim the ticket: \`bobby ticket assign {ID} ${agent}\`
  3. Read \`${ticketsDir}/{ID}*/ticket.md\` to load the ticket context.
  4. CRITICAL: Read and follow \`${agentsPath}/${agent}.md\` end-to-end. This file contains your full workflow — do NOT skip it or improvise your own.
  5. When complete, update the ticket stage using \`bobby ticket move\`.
  6. Commit all changes and verify \`git status --short\` is clean.

Launch all subagents in parallel (single message with multiple Agent tool calls, each with isolation: "worktree").
After all complete, report the status of each ticket and the worktree branch name for each.`;
  }

  return `Run ${agent} on ${ticketIds.length} ticket(s) in parallel using subagents.

Tickets:
${ticketList}

For each ticket, launch a subagent with this prompt:
  Run the ${agent} agent on ticket {ID}.
  1. Claim the ticket: \`bobby ticket assign {ID} ${agent}\`
  2. Read \`${ticketsDir}/{ID}*/ticket.md\` to load the ticket context.
  3. CRITICAL: Read and follow \`${agentsPath}/${agent}.md\` end-to-end. This file contains your full workflow — do NOT skip it or improvise your own.
  4. When complete, update the ticket stage using \`bobby ticket move\`.

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

1. Run \`bobby ticket list shipping\` to see all tickets ready to ship.
2. Follow the instructions in \`${agentsPath}/bobby-ship.md\`.
${repoSteps} Move each shipped ticket to done: \`bobby ticket move {ID} done\`.`;
}

/**
 * Unified prompt builder — single entry point for dispatching an agent invocation
 * to the right specialized builder. Used by both `bobby run` (CLI) and the
 * dashboard executor. Pure function: no console.log, no process.exit, no fs
 * mutations. Throws Error on invalid input.
 *
 * @param {string} agent - agent key from AGENT_REGISTRY (plan/build/workflow/feature/ship/etc.)
 * @param {string[]} ticketIds - array of ticket IDs (may be empty for batch/freeform agents)
 * @param {object} ctx - resolved context:
 *   - config            (object)  result of readConfig()
 *   - ticketsDir        (string)  absolute path to tickets dir (for findTicket)
 *   - ticketsRelDir     (string)  relative path for prompt text (config.tickets_dir)
 *   - agentsPath        (string)  target.paths().agents
 *   - workflow          (array)   resolved workflow array
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
    workflow,
    maxRetries = 3,
    maxIterations,
    hasServices = false,
    epicData,
    gitConventions = {},
  } = ctx;

  const ids = Array.isArray(ticketIds) ? ticketIds : (ticketIds ? [ticketIds] : []);

  // --- Custom agents ---
  if (agent === 'ship') {
    return {
      prompt: buildShipPrompt(ticketsRelDir, config.repos || [], agentsPath),
      label: 'Bobby Ship',
    };
  }

  if (agent === 'workflow') {
    if (ids.length === 0) {
      throw new Error('Workflow mode requires at least one ticket ID');
    }
    for (const id of ids) {
      if (!findTicket(ticketsDir, id)) throw new Error(`Ticket ${id} not found`);
    }
    return {
      prompt: buildOrchestrationPrompt(ids, workflow, maxRetries, ticketsRelDir, maxIterations, agentsPath, hasServices, gitConventions),
      label: `Bobby Workflow — ${ids.length} ticket(s)`,
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
      prompt: buildFeaturePrompt(epicId, epic.data.title, children, workflow, maxRetries, ticketsRelDir, maxIterations, agentsPath, gitConventions),
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
      prompt: buildNextStepPrompt(ticketId, workflow, ticketsDir, ticketsRelDir, agentsPath),
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

  // --- Standard workflow agents (plan/build/review/test) — single or batch ---
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
      prompt: buildBatchStagePrompt(reg.agentName, batchIds, ticketsRelDir, isolation, agentsPath, gitConventions),
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
export function buildFeaturePrompt(epicId, epicTitle, childTickets, workflow, maxRetries = 3, ticketsDir = '.bobby/tickets', maxIterations, agentsPath = '.claude/agents', gitConventions = {}) {
  // Dynamic default: each ticket needs up to workflow.length agents, ×2 for retry headroom
  if (!maxIterations) {
    maxIterations = childTickets.length * workflow.length * 2;
  }
  const slug = epicTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const featurePrefix = gitConventions.feature_branch_prefix || 'feature';
  const branchName = `${featurePrefix}/${epicId.toLowerCase()}-${slug}`;
  const epicDir = `${ticketsDir}/${epicId}*`;
  const featurePlanPath = `${epicDir}/feature-plan.md`;

  // Separate tickets needing planning from those past it
  const needsPlanning = childTickets.filter(t => ['backlog', 'planning'].includes(t.stage));
  const pastPlanning = childTickets.filter(t => !['backlog', 'planning'].includes(t.stage));

  // Build execution-phase agent steps (building onward — skip planning stage)
  const execPipeline = workflow.filter(s => s.stage !== 'planning');
  const execSteps = execPipeline.map((s, i) => {
    const next = nextStageName(s.stage, workflow);
    return `${i + 1}. If stage is "${s.stage}":\n` +
      `     a) Claim: \`bobby ticket assign {TICKET_ID} ${s.agent}\`\n` +
      `     b) Read \`${ticketsDir}/{TICKET_ID}*/ticket.md\` to load ticket context\n` +
      `     c) Read \`${featurePlanPath}\` for cross-cutting feature context\n` +
      `     d) Follow the instructions in \`${agentsPath}/${s.agent}.md\`\n` +
      `     e) When done, move: \`bobby ticket move {TICKET_ID} ${next}\`\n` +
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

1. Claim and move to planning: \`bobby ticket assign {TICKET_ID} bobby-plan\` then \`bobby ticket move {TICKET_ID} plan\`
2. Read the ticket's \`ticket.md\` for context
3. Read all existing sibling plan.md files for cross-ticket context:
${siblingPlanPaths}
4. Read \`${featurePlanPath}\` if it exists (from a prior run or earlier ticket in this phase)
5. Follow \`${agentsPath}/bobby-plan.md\` — the skill will detect Feature-Aware Refine Mode when it sees the ticket has a parent epic
6. After planning, verify \`plan.md\` and \`test-cases.md\` were created in the ticket folder
7. Move to building: \`bobby ticket move {TICKET_ID} build\`
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

2. **Pre-flight stage gates** — handle non-execution stages before launching any agent:
   - If stage is **"done"**: this ticket was already complete on entry. Skip it and note in the final report.
   - If stage is **"blocked"**: stop this ticket, report \`blocked_reason\` from the frontmatter, and move to the next ticket.
   - If stage is **"backlog"** or **"planning"**: this is an error — it should have been handled in Phase 1. Stop and report.

3. Based on the current stage, run the appropriate agent:
${execSteps}

4. After each agent completes, re-read \`ticket.md\` frontmatter to confirm the stage advanced.

5. If the stage advanced to the next workflow step, continue to the next agent.

6. If the stage went back to "building" (rejection), loop back and run bobby-build again. Maximum retries: ${maxRetries}. The build agent should read the rejection comment in ticket.md to understand what to fix. **On the 2nd retry failure**, run bobby-debug (follow \`${agentsPath}/bobby-debug.md\`) before the 3rd build attempt.

7. If the stage is "shipping", this ticket's workflow is complete.

8. If max retries are exceeded, skip this ticket and continue with the next.

9. If the stage is anything else not covered above, log a warning and skip to the next ticket — do not silently move on.

**Between tickets:**
- After each ticket reaches "shipping", run the project's full test suite to catch integration issues early.
- If tests fail, the most recent ticket's changes likely caused it. Move it back to building and retry.

---

## After All Tickets

1. Run the full test suite one final time.
2. Run lint if configured.
3. If everything passes, move the epic to shipping: \`bobby ticket move ${epicId} ship\`
4. Report the final status of each ticket and the epic.`;
}

/**
 * Build an orchestration prompt for running a sprint — an ordered set of
 * independent tickets worked one-by-one onto a single shared feature branch.
 *
 * Unlike `buildFeaturePrompt` (epic + children, holistically planned), a sprint
 * groups arbitrary, unrelated tickets. Each ticket runs its own full workflow
 * (including planning); there is no cross-ticket planning phase.
 *
 * @param {object} sprint   - { id, name, goal, branch }
 * @param {Array}  tickets  - ordered [{ id, title, stage, priority }]
 * @param {Array}  workflow - resolved workflow array [{ stage, agent }]
 * @param {object} opts     - { maxRetries, ticketsDir, maxIterations, agentsPath, hasServices, sprintPlanPath }
 */
export function buildSprintPrompt(sprint, tickets, workflow, {
  maxRetries = 3,
  ticketsDir = '.bobby/tickets',
  maxIterations,
  agentsPath = '.claude/agents',
  hasServices = false,
  sprintPlanPath = '',
} = {}) {
  const ids = tickets.map(t => t.id);
  if (!maxIterations) {
    maxIterations = Math.max(ids.length * workflow.length * 2, 10);
  }
  const firstStage = workflow[0]?.stage || 'planning';

  const serviceContext = hasServices
    ? `\n**Multi-service project:** Read each ticket's \`services\` frontmatter field. If present, read \`.bobbyrc.yml\` services to get each service's path and commands — include this context in the subagent prompt so it runs test/lint/build from the correct service directory.\n`
    : '';

  const steps = buildSubagentSteps(workflow, { ticketsDir, agentsPath, planReadPath: sprintPlanPath });

  const ticketList = tickets.map((t, i) =>
    `${i + 1}. ${t.id} — "${t.title}" [${t.priority || 'medium'}] (${t.stage || 'backlog'})`
  ).join('\n');

  return `You are running a Bobby sprint: ${sprint.id} — "${sprint.name}"
${sprint.goal ? `\n**Sprint goal:** ${sprint.goal}\n` : ''}
This sprint contains ${ids.length} independent ticket(s) to deliver on a single shared feature branch, worked one at a time in the order listed.

**Isolation:** This workflow runs in an isolated worktree. Commit freely — your working directory is separate from the user's main checkout.

**Guardrails:**
- Always use \`bobby\` commands to manage tickets. Never edit ticket files manually.
- The ticket stage in \`ticket.md\` frontmatter is the sole progress tracker — do not create separate todo lists.
- Never suppress errors (no \`2>/dev/null\`, no \`|| true\`). If a command fails, investigate.

**Before starting any work:**
0. Branch guard: run \`git branch --show-current\`. If not on \`${sprint.branch}\`, create and switch to it:
   \`git checkout -b ${sprint.branch}\`
   Every ticket in this sprint commits onto this one branch. NEVER commit directly to main/master.

**Safety limits:** Max retries per ticket: ${maxRetries}. Max total agent invocations across all tickets: ${maxIterations}. Stop and report if either cap is hit.
${serviceContext}
**Ticket order:**
${ticketList}

---

## Sequential Execution

Process each ticket in the order listed above. For each ticket (replace {TICKET_ID} with the actual ticket ID):

1. Read the ticket's \`ticket.md\` from \`${ticketsDir}/\` to determine the current stage (in frontmatter).

2. ${buildPreflightGates(firstStage)}

3. Based on the current stage, launch the appropriate subagent:
${steps}

4. If the stage advanced to the next workflow step, continue to the next agent for the same ticket.

5. ${buildRetryDebugClause(maxRetries, agentsPath)}

6. If the stage is "shipping", this ticket is complete. Run the project's full test suite to catch integration issues before starting the next ticket. If tests fail, the most recent ticket's changes likely caused it — move it back to building and retry.

7. If max retries are exceeded, skip this ticket and continue with the next.

8. If the stage is anything else not covered above (e.g., outside the configured workflow), log a warning and skip to the next ticket — do not silently move on.

---

## After All Tickets

1. Run the full test suite one final time. Run lint if configured.
2. If everything passes, mark the sprint done: \`bobby sprint status ${sprint.id} done\`.
3. Report the final status of each ticket and the sprint branch name (\`${sprint.branch}\`).`;
}
