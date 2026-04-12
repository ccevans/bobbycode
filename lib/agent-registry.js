// lib/agent-registry.js

/**
 * Central registry of all Bobby agents.
 *
 * Adding a new agent? Add an entry here — that's it.
 * The generic prompt builder and run.js dispatch handle the rest.
 */
export const AGENT_REGISTRY = {
  // --- Standard pipeline agents (use buildSingleAgentPrompt / buildBatchStagePrompt) ---
  plan:   { label: 'Bobby Plan',   agentName: 'bobby-plan' },
  build:  { label: 'Bobby Build',  agentName: 'bobby-build' },
  review: { label: 'Bobby Review', agentName: 'bobby-review' },
  test:   { label: 'Bobby Test',   agentName: 'bobby-test' },

  // --- Custom agents (have their own builder in pipeline.js) ---
  ship:     { label: 'Bobby Ship',     custom: true },
  pipeline: { label: 'Bobby Pipeline', custom: true },
  feature:  { label: 'Bobby Feature',  custom: true },
  next:     { label: 'Bobby Next',     custom: true },

  // --- Ticket-required agents ---
  security: {
    label: 'Bobby Security',
    agentName: 'bobby-security',
    requiresTicket: true,
    promptHeader: 'Run the bobby-security agent on ticket {ticketId}.',
    promptSteps: [
      'Read `{ticketsDir}/{ticketId}*/ticket.md` and `plan.md` for context.',
      'Run `git diff` to see the changed code.',
      'Follow the instructions in `{agentsPath}/bobby-security.md`.',
      'Check OWASP Top 10 and STRIDE threat model against the changed code.',
      'Only flag findings with 8/10+ confidence and concrete exploit scenarios.',
      'If approved: add a security-passed comment. If rejected: move back to building with specific vulnerability details.',
    ],
  },
  debug: {
    label: 'Bobby Debug',
    agentName: 'bobby-debug',
    requiresTicket: true,
    promptHeader: 'Run the bobby-debug agent on ticket {ticketId}.',
    promptSteps: [
      'Read `{ticketsDir}/{ticketId}*/ticket.md` — understand the failure and rejection comments.',
      'Follow the instructions in `{agentsPath}/bobby-debug.md`.',
      'Follow the debug methodology strictly: Reproduce → Hypothesize → Trace → Verify → Fix.',
      'Maximum 3 fix attempts. If all fail, block the ticket with your analysis.',
      'Scope lock: only fix the bug, do not refactor or add features.',
      'When fixed, move to review: `bobby move {ticketId} review`.',
    ],
  },

  // --- Cowork agents (freeform or with ticket) ---
  ux: {
    label: 'Bobby UX',
    agentName: 'bobby-ux',
    cowork: true,
    promptHeader: 'Run the bobby-ux agent for a freeform design audit.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-ux.md`.',
      'Review the live application through the browser and API calls.',
      'File findings as tickets using `bobby create -t "Finding" --type improvement`.',
      'Produce a summary of findings organized by severity (critical, high, medium, low).',
    ],
  },
  pm: {
    label: 'Bobby PM',
    agentName: 'bobby-pm',
    cowork: true,
    promptHeader: 'Run the bobby-pm agent for a product review.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-pm.md`.',
      'Review the live application through the browser and API calls.',
      'Identify UX gaps, feature opportunities, and product issues.',
      'File findings as tickets using `bobby create -t "Finding" --type feature`.',
      'Produce a summary of findings organized by severity (critical, high, medium, low).',
    ],
  },
  qe: {
    label: 'Bobby QE',
    agentName: 'bobby-qe',
    cowork: true,
    promptHeader: 'Run the bobby-qe agent for QE testing.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-qe.md`.',
      'Run `bobby list testing` to find tickets ready for QE.',
      'Test each ticket through the browser and API calls.',
      'Pass: `bobby move {ID} ship`. Fail: `bobby move {ID} reject "reason"`.',
      'File new bugs found: `bobby create -t "Bug" --type bug -p high`.',
    ],
  },
  vet: {
    label: 'Bobby Vet',
    agentName: 'bobby-vet',
    cowork: true,
    promptHeader: 'Run the bobby-vet agent to vet an idea or ticket design before planning.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-vet.md`.',
      'If a ticket ID was provided, read `{ticketsDir}/{ID}*/ticket.md` for context.',
      'Ask ONE probing question at a time. Wait for the user\'s response before asking the next.',
      'Challenge assumptions, probe edge cases, explore alternatives, map dependencies.',
      'When done, produce a vet summary and offer to update the ticket description/AC.',
      'Do NOT move the ticket between stages. Add findings as comments.',
    ],
  },
  strategy: {
    label: 'Bobby Strategy',
    agentName: 'bobby-strategy',
    cowork: true,
    promptHeader: 'Run the bobby-strategy agent to evaluate backlog tickets for strategic readiness.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-strategy.md`.',
      'Run `bobby list backlog --sort priority` to see all backlog tickets.',
      'For each ticket, read `{ticketsDir}/{ID}*/ticket.md` to understand scope and demand.',
      'Evaluate each ticket through the strategy framework: demand validation, status quo analysis, scope assessment, alternative exploration, impact scoring.',
      'For each ticket, make a decision:\n   - APPROVE: `bobby move {ID} plan` + strategy brief comment\n   - DEFER: comment with reasoning and revisit conditions (stays in backlog)\n   - KILL: `bobby archive {ID}` + explanation comment',
      'Produce a batch summary ranking all evaluated tickets by score.',
    ],
  },

  // --- Architecture & intake agents ---
  arch: {
    label: 'Bobby Arch',
    agentName: 'bobby-arch',
    freeform: true,
    promptHeader: 'Run the bobby-arch agent to discover and document this codebase.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-arch.md`.',
      'Read `.bobby/docs/` and all dependency manifests and key config files first — no questions until you\'ve read as much as possible.',
      'Write `.bobby/architecture.md` (full reference), `.bobby/architecture-wakeup.md` (compressed ~300-token summary), and seed `.bobby/decisions.yaml`.',
      'Only ask questions you cannot answer from reading the code.',
    ],
  },
  intake: {
    label: 'Bobby Ticket Intake',
    agentName: 'bobby-ticket-intake',
    cowork: true,
    promptHeader: 'Run the bobby-ticket-intake agent to convert a pasted PM spec into a Bobby ticket.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-ticket-intake.md`.',
      'Read `.bobbyrc.yml` for valid areas before inferring area from the spec.',
      'Parse the spec the user has provided. Extract id, title, type, priority, area, description, ACs, and open questions.',
      'If area or priority are genuinely ambiguous, ask the user. Otherwise proceed.',
      'Create the ticket with `bobby create` and overwrite ticket.md with real content — no placeholders.',
      'Output: `Created {ID}: "{title}" [{type} · {priority} · {area}]`',
    ],
  },

  // --- Freeform agents (no ticket required) ---
  docs: {
    label: 'Bobby Docs',
    agentName: 'bobby-docs',
    freeform: true,
    promptHeader: 'Run the bobby-docs agent to update project documentation.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-docs.md`.',
      'Run `bobby list done --sort newest` to see recently shipped tickets.',
      'Run `git log --oneline -20` to understand what changed.',
      'Read current documentation (README.md, CLAUDE.md, CHANGELOG.md, docs/).',
      'Update only documentation that is now stale due to shipped changes.',
      'Do not rewrite sections that are still accurate.',
      'Commit documentation changes with: `docs: update for {shipped features}`.',
    ],
  },
  performance: {
    label: 'Bobby Performance',
    agentName: 'bobby-performance',
    freeform: true,
    promptHeader: 'Run the bobby-performance agent for performance benchmarking.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-performance.md`.',
      'Navigate to key application pages via browser automation.',
      'Measure page load times, resource sizes, and request counts.',
      'If a baseline exists in `.bobby/benchmarks/baseline.json`, compare and flag regressions.',
      'If no baseline exists, establish one.',
      'Save results to `.bobby/benchmarks/`.',
      'File bug tickets for any significant regressions (>10% slower).',
    ],
  },
  watchdog: {
    label: 'Bobby Watchdog',
    agentName: 'bobby-watchdog',
    freeform: true,
    promptHeader: 'Run the bobby-watchdog agent for post-deploy verification.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-watchdog.md`.',
      'Read `.bobbyrc.yml` for `production_url` and `watchdog_pages` config.',
      'Navigate to each page and verify:\n   - HTTP 200 response\n   - Page renders within 5 seconds\n   - No JavaScript console errors\n   - No failed network requests',
      'Screenshot each page for the record.',
      'Save results to `.bobby/watchdog/`.',
      'File critical bug tickets for any failures.',
    ],
  },
};

export const VALID_AGENTS = Object.keys(AGENT_REGISTRY);
