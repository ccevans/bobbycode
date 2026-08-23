// lib/agent-registry.js

/**
 * Central registry of all Bobby agents.
 *
 * Adding a new agent? Add an entry here — that's it.
 * The generic prompt builder and run.js dispatch handle the rest.
 */
export const AGENT_REGISTRY = {
  // --- Standard workflow agents (use buildSingleAgentPrompt / buildBatchStagePrompt) ---
  plan:   { label: 'Bobby Plan',   agentName: 'bobby-plan' },
  build:  { label: 'Bobby Build',  agentName: 'bobby-build' },
  review: { label: 'Bobby Review', agentName: 'bobby-review' },
  test:   { label: 'Bobby Test',   agentName: 'bobby-test' },

  // --- Custom agents (have their own builder in workflow.js) ---
  // ship is `freeform` as well as `custom`: buildShipPrompt takes no ticket id,
  // so ship has always been runnable against the repo alone — the flag just
  // says so where the dispatch can read it.
  ship:     { label: 'Bobby Ship',     custom: true, freeform: true },
  workflow: { label: 'Bobby Workflow', custom: true },
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
  // Deliberately the shortest promptSteps in this file. Freewill's whole premise
  // is that Opus 5 / Fable 5 do better from a goal plus invariants than from a
  // procedure, so a long step list here would defeat the agent it dispatches.
  // Add to `bobby learn bobby-freewill`, not to this array.
  freewill: {
    label: 'Bobby Freewill',
    agentName: 'bobby-freewill',
    requiresTicket: true,
    promptHeader: 'Run the bobby-freewill agent on ticket {ticketId} — one agent, start to shipping.',
    promptSteps: [
      'Read `{ticketsDir}/{ticketId}*/ticket.md`. Its Description and Acceptance Criteria are the contract.',
      'Follow `{agentsPath}/bobby-freewill.md`. How you build is your call; the invariants there are not.',
      'Security-sensitive, underspecified, or epic-sized? Say so and stop — that ticket wants the default or secure workflow.',
      'Self-review your own diff adversarially before shipping — you are the only reviewer this ticket gets.',
      'Done: `bobby ticket move {ticketId} ship`. Stuck: `bobby ticket move {ticketId} block "<the decision you need>"`.',
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
      'When fixed, move to review: `bobby ticket move {ticketId} review`.',
    ],
  },

  // --- Cowork agents (freeform or with ticket) ---
  ux: {
    label: 'Bobby UX',
    agentName: 'bobby-ux',
    cowork: true,
    promptHeader: 'Run the bobby-ux agent for a design review.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-ux.md`.',
      'If `.bobby/design/design-spec.md` exists, run Spec Conformance FIRST — pass/fail per field against the built source. File failures as bugs.',
      'Review the live application through the browser and API calls.',
      'File findings as tickets using `bobby ticket create -t "Finding" --type improvement`.',
      'Produce a summary of findings organized by severity (critical, high, medium, low).',
    ],
  },
  'design-research': {
    label: 'Design Research',
    agentName: 'bobby-design-research',
    cowork: true,
    promptHeader: 'Run the bobby-design-research agent to gather and cite the inspiration set.',
    promptSteps: [
      'FIRST decide the STRUCTURE (list / queue / letter / conversation / briefing / ledger / stage) — name the category default so you can refuse it, then ask the user. Structure decides which references are relevant.',
      'Then ask the user for references — their references are THE SET; never pad it with your own picks.',
      'Only if they supply none, find 3-5 yourself, ranging outside the category.',
      "Cite every reference: name, source URL, what is good (the thinking), what we take.",
      'Write the table to `.bobby/design/references.md` and show the user.',
    ],
  },
  'design-analyze': {
    label: 'Design Analyze',
    agentName: 'bobby-design-analyze',
    cowork: true,
    promptHeader: 'Run the bobby-design-analyze agent to tear each reference down into extracted values.',
    promptSteps: [
      'RENDER each reference with Playwright and LOOK at the screenshots before anything else.',
      'Then curl the raw HTML/CSS for declared values; resolve token indirection.',
      'Extract layout, anchor, motion (durations AND distances), not just colour and type.',
      'Never report a negative from static HTML — JS-rendered sites ship a shell.',
      'Write `.bobby/design/teardown-<ref>.md`, then vet the traits with the user in plain language.',
    ],
  },
  'design-mockup': {
    label: 'Design Mockup',
    agentName: 'bobby-design-mockup',
    cowork: true,
    promptHeader: "Run the bobby-design-mockup agent to build comparable options in each reference's system.",
    promptSteps: [
      'Ask the fidelity level (close replica / inherit system / inspired by) before building.',
      'Ask separate-per-reference or combined — never assume a blend.',
      'Build two options per reference: faithful plus a variant, using identical real content.',
      'Every value comes from a teardown; run the slop checklist; render your own build and look at it.',
      'Get a pick, then record the choice and signature move.',
    ],
  },
  'design-spec': {
    label: 'Design Spec',
    agentName: 'bobby-design-spec',
    cowork: true,
    promptHeader: 'Run the bobby-design-spec agent to lock the decisions into a versioned contract.',
    promptSteps: [
      'Write `.bobby/design/design-spec.md` — what was DECIDED, not what a reference does.',
      'Record direction, headline verbatim, layout, every token in both themes, motion, vetted keep/drop.',
      'Log every deviation with a written reason; type floors override reference fidelity.',
      'Commit it — a colour change should be reviewable in a diff like an API contract.',
    ],
  },
  'design-build': {
    label: 'Design Build',
    agentName: 'bobby-design-build',
    cowork: true,
    promptHeader: 'Run the bobby-design-build agent to implement the spec exactly.',
    promptSteps: [
      'Read `.bobby/design/design-spec.md` and build ONLY from it — copy values, never retype from memory.',
      'Carry the system through the whole page, not just the hero; build real product UI, not placeholder text.',
      'Never hide content in CSS awaiting JS; avoid viewport units and scroll-snap if the page may be embedded.',
      'Build mobile-first: the always-works layout is the default, desktop is the enhancement.',
      'Render your own build at 375/768/1440, both themes, JS off. Do not self-certify — hand off to design-check.',
    ],
  },
  'design-check': {
    label: 'Design Check',
    agentName: 'bobby-design-check',
    cowork: true,
    promptHeader: 'Run the bobby-design-check agent for an independent live review against the spec and slop checklist.',
    promptSteps: [
      'Run Spec Conformance FIRST — pass/fail per field against the built source.',
      'Any value in the build not in the spec is a FAIL: drift, not a decision.',
      'Score the page against `slop_checklist.md`; unexempted hits are findings.',
      "Review live in the browser: both themes, 375/768/1440, drive the interaction, do not just measure it.",
      'Report Spec Conformance PASS/FAIL and Slop count alongside the Design Health Score. File failures as bugs.',
    ],
  },
  'define-brief': {
    label: 'Define Brief',
    agentName: 'bobby-define-brief',
    cowork: true,
    promptHeader: 'Run the bobby-define-brief agent to interview the founder and write the product brief.',
    promptSteps: [
      'Read the epic ticket — its Description holds the idea, verbatim.',
      'Interview one question at a time (tags: [Problem] [Users] [Outcome] [Constraints] [Success-metric] [Non-goals]; budget 5-8 questions).',
      'Write `.bobby/product/brief.md` with the Locked/Status header and Decided / Vetted / Deviations / Changelog sections.',
      'Your FINAL message: the brief in five lines, then the gate question — is the Problem line the problem they actually mean, and which Non-goal is wrong?',
    ],
  },
  'define-personas': {
    label: 'Define Personas',
    agentName: 'bobby-define-personas',
    cowork: true,
    promptHeader: 'Run the bobby-define-personas agent to derive 2-3 personas from the brief.',
    promptSteps: [
      'Read `.bobby/product/brief.md` first — personas quote its Problem and Target user lines.',
      'Interview (tags: [Persona] [Context] [Pain] [Frequency] [Proxy]; budget 4-6 questions). 2-3 personas max, exactly one PRIMARY.',
      'Write `.bobby/product/personas.md` (P1, P2… with goal, context, pains, workaround, proxy).',
      'FINAL message: the personas in brief, then the gate — which one is v1 actually for, and do they know a real person who matches?',
    ],
  },
  'define-journeys': {
    label: 'Define Journeys',
    agentName: 'bobby-define-journeys',
    cowork: true,
    promptHeader: 'Run the bobby-define-journeys agent to map the primary journeys step by step.',
    promptSteps: [
      'Read `.bobby/product/personas.md` — every journey names its persona.',
      'One journey per primary-persona goal, 1-3 total; steps numbered J1.S1… with what the persona does, what the product does, and the drop-off risk.',
      'Interview where steps are uncertain (tags: [Trigger] [Step] [Decision] [Dead-end]; budget 4-6 per journey).',
      'Write `.bobby/product/journeys.md`.',
      'FINAL message: walk J1 with the founder as the persona — at which step would they give up?',
    ],
  },
  'define-features': {
    label: 'Define Features',
    agentName: 'bobby-define-features',
    cowork: true,
    promptHeader: 'Run the bobby-define-features agent to derive the feature map and lock the definition.',
    promptSteps: [
      'Read `.bobby/product/journeys.md` — every feature cites the journey step(s) it serves; features are derived, not brainstormed.',
      'Build the map: F<j>.<n> rows with journey step, persona, MoSCoW column. v1 = the Must rows. Never rows must cite a brief Non-goal.',
      'Gate: the Must column is all of v1 — ask the founder to strike one thing, or say why nothing can go.',
      'Then LOCK all four artifacts (Locked/Status headers), commit `.bobby/product/`, and move the epic: `bobby ticket move {EPIC} plan`.',
    ],
  },
  'define-mockups': {
    label: 'Define Mockups',
    agentName: 'bobby-define-mockups',
    cowork: true,
    promptHeader: 'Run the bobby-define-mockups agent to design the v1 screens from the locked product artifacts, and present options at a gate that accepts "skip".',
    promptSteps: [
      'Read `.bobby/product/brief.md`, `personas.md`, `journeys.md`, and `feature-map.md` FIRST — they ARE the design brief. The PRIMARY persona is the audience, the headline journey\'s Success line is the page\'s job, the Must features and the journey steps they serve are the screens to mock.',
      'Never re-ask what those artifacts already answer (audience, problem, journey steps). You may ask only what they cannot: structure, references, fidelity — budget 3-5 questions, tags [Structure] [References] [Fidelity].',
      'Follow the design skill\'s research → teardown → mockup-options arc with the product\'s REAL content (persona names, journey language) identical across options; write references/teardowns/options under `.bobby/design/`.',
      'Your FINAL message is the gate: present the options built from THEIR artifacts and ask for a pick — or "skip". On a pick, write `.bobby/product/mockups.md` and commit; on "skip", comment the skip on the epic and move on. Either way the pipeline continues.',
    ],
  },
  'define-blueprint': {
    label: 'Define Blueprint',
    agentName: 'bobby-define-blueprint',
    cowork: true,
    promptHeader: 'Run the bobby-define-blueprint agent to generate the build blueprint and walk the human through it.',
    promptSteps: [
      'Run `bobby blueprint {ticketId}` — it derives the page from the locked artifacts and the board. Never hand-write it.',
      'Read the terminal summary. If it reports drift, fix the cause (a Must row with no ticket, or a ticket pointing at a feature not in the map) and re-run.',
      'Walk the human through what the page shows: the crux, the tracks, what is deliberately out of scope.',
      'FINAL message: the gate — does this look like the thing they want built, and what is missing?',
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
      'File findings as tickets using `bobby ticket create -t "Finding" --type feature`.',
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
      'Run `bobby ticket list testing` to find tickets ready for QE.',
      'Test each ticket through the browser and API calls.',
      'Pass: `bobby ticket move {ID} ship`. Fail: `bobby ticket move {ID} reject "reason"`.',
      'File new bugs found: `bobby ticket create -t "Bug" --type bug -p high`.',
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
      'Run `bobby ticket list backlog --sort priority` to see all backlog tickets.',
      'For each ticket, read `{ticketsDir}/{ID}*/ticket.md` to understand scope and demand.',
      'Evaluate each ticket through the strategy framework: demand validation, status quo analysis, scope assessment, alternative exploration, impact scoring.',
      'For each ticket, make a decision:\n   - APPROVE: `bobby ticket move {ID} plan` + strategy brief comment\n   - DEFER: comment with reasoning and revisit conditions (stays in backlog)\n   - KILL: `bobby ticket archive {ID}` + explanation comment',
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
      'Write `.bobby/architecture.md` (full reference) and `.bobby/architecture-wakeup.md` (compressed ~300-token summary).',
      'Record each architectural decision with `bobby decision add --id … --fact … --why …` — never by editing `.bobby/decisions.yaml` by hand.',
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
      'Create the ticket with `bobby ticket create` and overwrite ticket.md with real content — no placeholders.',
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
      'Run `bobby ticket list done --sort newest` to see recently shipped tickets.',
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
  lighthouse: {
    label: 'Bobby Lighthouse',
    agentName: 'bobby-lighthouse',
    freeform: true,
    promptHeader: 'Run the bobby-lighthouse agent to audit page templates against the four Lighthouse pillars.',
    promptSteps: [
      'Follow the instructions in `{agentsPath}/bobby-lighthouse.md`.',
      'Read the output of `bobby ticket list` first, so you know what is already open.',
      'Run the shipped runner (path is in the agent file) mobile first, at least 3 runs. The site resolves from --url, BOBBY_AUDIT_URL, or lighthouse.base in .bobbyrc.yml.',
      'Propose tickets ONLY on audits that fail with real DOM nodes, ranked by pages affected. Never on a score, a zero-node timing audit, or anything the runner marks ALREADY TICKETED.',
      'For each proposal, `bobby ticket create` then write a body with the measurement, the failing audit id and sample selectors, the pages affected, and measurement-demanding acceptance criteria.',
      'Report separately what you measured, what you filed, and what you deliberately did not file.',
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

/**
 * Can this agent be launched with no ticket at all?
 *
 * Derived from the registry's own dispatch flags rather than kept as a second
 * hand-maintained list, so a new agent is still one edit (`agents-live-in-the-
 * registry`). It answers exactly the question `buildPromptFor(agent, [], ctx)`
 * asks: `freeform` agents never take a ticket, `cowork` agents take one
 * optionally and fall through to the generic builder without, and
 * `requiresTicket` agents refuse outright. plan/build/review/test have no
 * promptSteps and reach the batch branch, which needs tickets in a stage —
 * they are ticket agents and are excluded by having neither flag.
 *
 * This is the set the orchestrator will accept as a REPO RUN.
 */
export function runsWithoutTicket(key) {
  const entry = AGENT_REGISTRY[key];
  if (!entry) return false;
  if (entry.requiresTicket) return false;
  return !!(entry.freeform || entry.cowork);
}

/** Every agent runnable against the repo itself, in registry order. */
export const REPO_AGENTS = VALID_AGENTS.filter(runsWithoutTicket);
