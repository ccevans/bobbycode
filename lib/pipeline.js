// lib/pipeline.js
import { isValidStage } from './stages.js';
import { findTicket } from './tickets.js';

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
  return `Run the bobby-security agent on ticket ${ticketId}.

1. Claim the ticket: \`bobby assign ${ticketId} bobby-security\`
2. Read \`${ticketsDir}/${ticketId}*/ticket.md\` and \`plan.md\` for context.
3. Run \`git diff\` to see the changed code.
4. Follow the instructions in \`${agentsPath}/bobby-security.md\`.
5. Check OWASP Top 10 and STRIDE threat model against the changed code.
6. Only flag findings with 8/10+ confidence and concrete exploit scenarios.
7. If approved: add a security-passed comment. If rejected: move back to building with specific vulnerability details.`;
}

/**
 * Build a prompt for the debug/investigation agent
 */
export function buildDebugPrompt(ticketId, ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-debug agent on ticket ${ticketId}.

1. Claim the ticket: \`bobby assign ${ticketId} bobby-debug\`
2. Read \`${ticketsDir}/${ticketId}*/ticket.md\` — understand the failure and rejection comments.
3. Follow the instructions in \`${agentsPath}/bobby-debug.md\`.
4. Follow the debug methodology strictly: Reproduce → Hypothesize → Trace → Verify → Fix.
5. Maximum 3 fix attempts. If all fail, block the ticket with your analysis.
6. Scope lock: only fix the bug, do not refactor or add features.
7. When fixed, move to review: \`bobby move ${ticketId} review\`.`;
}

/**
 * Build a prompt for the documentation update agent
 */
export function buildDocsPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-docs agent to update project documentation.

1. Follow the instructions in \`${agentsPath}/bobby-docs.md\`.
2. Run \`bobby list done --sort newest\` to see recently shipped tickets.
3. Run \`git log --oneline -20\` to understand what changed.
4. Read current documentation (README.md, CLAUDE.md, CHANGELOG.md, docs/).
5. Update only documentation that is now stale due to shipped changes.
6. Do not rewrite sections that are still accurate.
7. Commit documentation changes with: \`docs: update for {shipped features}\`.`;
}

/**
 * Build a prompt for the performance benchmarking agent
 */
export function buildPerformancePrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-performance agent for performance benchmarking.

1. Follow the instructions in \`${agentsPath}/bobby-performance.md\`.
2. Navigate to key application pages via browser automation.
3. Measure page load times, resource sizes, and request counts.
4. If a baseline exists in \`.bobby/benchmarks/baseline.json\`, compare and flag regressions.
5. If no baseline exists, establish one.
6. Save results to \`.bobby/benchmarks/\`.
7. File bug tickets for any significant regressions (>10% slower).`;
}

/**
 * Build a prompt for the post-deploy watchdog agent
 */
export function buildWatchdogPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-watchdog agent for post-deploy verification.

1. Follow the instructions in \`${agentsPath}/bobby-watchdog.md\`.
2. Read \`.bobbyrc.yml\` for \`production_url\` and \`watchdog_pages\` config.
3. Navigate to each page and verify:
   - HTTP 200 response
   - Page renders within 5 seconds
   - No JavaScript console errors
   - No failed network requests
4. Screenshot each page for the record.
5. Save results to \`.bobby/watchdog/\`.
6. File critical bug tickets for any failures.`;
}

/**
 * Build a prompt for a freeform UX design audit
 */
export function buildUxPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-ux agent for a freeform design audit.

1. Follow the instructions in \`${agentsPath}/bobby-ux.md\`.
2. Review the live application through Chrome browser automation.
3. File findings as tickets using \`bobby create -t "Finding" --type improvement\`.
4. Produce a summary of findings organized by severity (critical, high, medium, low).`;
}

/**
 * Build a prompt for a freeform PM product review
 */
export function buildPmPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-pm agent for a product review.

1. Follow the instructions in \`${agentsPath}/bobby-pm.md\`.
2. Review the live application through Chrome browser automation.
3. Identify UX gaps, feature opportunities, and product issues.
4. File findings as tickets using \`bobby create -t "Finding" --type feature\`.
5. Produce a summary of findings organized by severity (critical, high, medium, low).`;
}

/**
 * Build a prompt for a freeform QE testing session
 */
export function buildQePrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-qe agent for QE testing.

1. Follow the instructions in \`${agentsPath}/bobby-qe.md\`.
2. Run \`bobby list testing\` to find tickets ready for QE.
3. Test each ticket through Chrome browser automation and API calls.
4. Pass: \`bobby move {ID} ship\`. Fail: \`bobby move {ID} reject "reason"\`.
5. File new bugs found: \`bobby create -t "Bug" --type bug -p high\`.`;
}


/**
 * Build a prompt for the vet agent (design interrogation before planning)
 */
export function buildVetPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-vet agent to vet an idea or ticket design before planning.

1. Follow the instructions in \`${agentsPath}/bobby-vet.md\`.
2. If a ticket ID was provided, read \`${ticketsDir}/{ID}*/ticket.md\` for context.
3. Ask ONE probing question at a time. Wait for the user's response before asking the next.
4. Challenge assumptions, probe edge cases, explore alternatives, map dependencies.
5. When done, produce a vet summary and offer to update the ticket description/AC.
6. Do NOT move the ticket between stages. Add findings as comments.`;
}

/**
 * Build a prompt for the strategy gate agent (pre-planning validation)
 */
export function buildStrategyPrompt(ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents') {
  return `Run the bobby-strategy agent to evaluate backlog tickets for strategic readiness.

1. Follow the instructions in \`${agentsPath}/bobby-strategy.md\`.
2. Run \`bobby list backlog --sort priority\` to see all backlog tickets.
3. For each ticket, read \`${ticketsDir}/{ID}*/ticket.md\` to understand scope and demand.
4. Evaluate each ticket through the strategy framework: demand validation, status quo analysis, scope assessment, alternative exploration, impact scoring.
5. For each ticket, make a decision:
   - APPROVE: \`bobby move {ID} plan\` + strategy brief comment
   - DEFER: comment with reasoning and revisit conditions (stays in backlog)
   - KILL: \`bobby archive {ID}\` + explanation comment
6. Produce a batch summary ranking all evaluated tickets by score.`;
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
