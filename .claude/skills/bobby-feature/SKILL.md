---
name: run-feature
description: "Feature Skill: Works an entire epic — gathers child tickets, plans them holistically as a group, then processes each through build → review → test on a single feature branch. Catches integration issues between tickets and verifies everything works together. MANDATORY TRIGGERS: feature, work feature, run feature, epic, work epic, implement feature, feature workflow."
argument-hint: "<epic ticket ID>"
---

# Bobby Feature Skill

> Orchestrates a full feature (epic) across all its child tickets on a single branch. First plans ALL tickets holistically so each plan benefits from knowing its siblings, then builds/reviews/tests each sequentially. Catches integration issues between tickets and verifies the whole feature works before shipping.

## Before Starting

1. **Epic selection** — If an epic ID was provided as an argument, use it. Otherwise, discover and present epics:
   a) Run `bobby ticket list` and identify tickets with `type: epic`
   b) For each epic, count children and summarize their stages
   c) Present the results:

   **Available Epics:**
   | Epic | Title | Children | Status |
   |------|-------|----------|--------|
   | ... | ... | N tickets | stage summary |

   d) Ask the user which epic to work on
   e) **Wait for the user's response before proceeding.** Do not auto-select.

2. **Validate epic** — Read `.bobby/tickets/{ID}*/ticket.md` and confirm `type: epic`. If not an epic, tell the user.

3. **Gather children** — Run `bobby ticket list --epic {ID}` to find all child tickets. If no children exist, tell the user: `Create children with: bobby ticket create -t "..." --parent {ID}`

4. **Order tickets** — Sort children for processing:
   - **In-progress first**: Tickets further along (testing > reviewing > building > planning > backlog) go first — finish what's started
   - **Then by priority**: critical > high > medium > low
   - **Then by ID**: TKT-001 before TKT-002 as tiebreaker

5. **Present the plan** — Show the user the processing order and the two-phase approach. Ask for confirmation before starting:

   **Feature: {epic title}**
   **Branch:** `feature/{epicId}-{slug}`
   **Phase 1:** Plan {N} ticket(s) holistically
   **Phase 2:** Build → Review → Test each sequentially
   | Order | Ticket | Title | Priority | Current Stage |
   |-------|--------|-------|----------|---------------|
   | 1 | ... | ... | ... | ... |

6. **Branch guard** — This workflow runs in an isolated worktree, so the working directory is clean. Run `git branch --show-current`. If on main/master, create the feature branch: `git checkout -b feature/{epicId}-{slug}`. NEVER commit directly to main/master. All child ticket work goes on this single branch.

## Safety Limits

- **Max retries per ticket:** 3 (when an agent rejects, loop back to building)
- **Max total agent invocations:** 20 (across all tickets — stop and report if hit)

## Workflow Stages

| Stage | Agent | What it does |
|-------|-------|-------------|
| planning | bobby-plan | Creates plan.md + test-cases.md (Feature-Aware mode for epic children) |
| building | bobby-build | Implements the plan, commits code |
| reviewing | bobby-review | Code review — runs tests, lint, checks ACs |
| testing | bobby-test | Live app verification — browser + API testing |

> **Note:** Shipping is handled separately via `bobby run ship`. The feature workflow stops once all tickets reach shipping.

---

## Phase 1: Holistic Planning

Plan ALL tickets before building any. This ensures consistent patterns, shared utilities, and coherent architecture across the entire feature.

For each ticket in the sorted order that is in `backlog` or `planning` stage:

### 1. Read Ticket State
Read `.bobby/tickets/{ID}*/ticket.md` frontmatter to determine the current stage.

### 2. Move to Planning
If stage is `backlog`, move to planning: `bobby ticket move {ID} plan`

### 3. Run Bobby-Plan (Feature-Aware)
1. Claim the ticket: `bobby ticket assign {ID} bobby-plan`
2. Read `.bobby/tickets/{ID}*/ticket.md` for context
3. Follow the instructions in `.claude/agents/bobby-plan.md` — the bobby-plan skill will automatically detect **Feature-Aware Refine Mode** when it sees the ticket has a `parent` field. This mode reads sibling plans and the feature-plan.md for cross-ticket context.
4. When complete, the agent moves the ticket to building via `bobby ticket move`

### 4. Verify Planning Complete
1. Re-read `ticket.md` frontmatter to confirm the ticket moved to `building`
2. Verify `plan.md` and `test-cases.md` exist in the ticket folder
3. Run `git status --short` — if there are uncommitted source files, STOP and report.

### 5. Feature Plan Check
- After the **first** ticket is planned, verify `.bobby/tickets/{epicId}*/feature-plan.md` was created. If not, the plan agent missed it — create it now with the cross-cutting decisions from the first ticket's plan.
- After **each subsequent** ticket is planned, verify `feature-plan.md` was updated.
- Ensure `feature-plan.md` includes a **File References** section with line ranges for large files (>500 lines) that multiple tickets will touch. Example: `agentDashboard.css — Emails section: lines 7094-7150`. This prevents every agent from re-reading thousands of lines to find the right section.
- If the epic ticket references a design mockup (HTML file, screenshot, Figma URL), record it in `feature-plan.md` under a `## Design Reference` section with the file path and which pages/tabs it covers. This allows the test agent to compare the live app against the mockup during verification.

### 6. Next Ticket (Planning)
Continue to the next ticket that needs planning. Skip tickets already in `building` or later — but still read their `plan.md` as sibling context.

### 7. Holistic Review
After ALL tickets are planned, review `feature-plan.md` for consistency across all ticket plans:
- Are there contradictory approaches between tickets?
- Are shared utilities referenced consistently?
- Are dependencies between tickets clear and satisfiable?
- **Bundling check:** Are any tickets so tightly coupled (same file, overlapping JSX/code sections) that they'll inevitably be built together? If so, note this in `feature-plan.md` under a `## Bundled Tickets` section — e.g., "TKT-262 will be built as part of TKT-261 since both modify the same component inline." This is informational; it sets expectations rather than requiring ticket merging.

Update `feature-plan.md` if the later plans revealed better approaches or inconsistencies.

> **Skip Phase 1** if all tickets are already past planning (building or later). Read existing `feature-plan.md` for context and proceed to Phase 2.

---

## Phase 2: Sequential Execution

Now build, review, and test each ticket in order. Every agent should read `.bobby/tickets/{epicId}*/feature-plan.md` for cross-cutting context.

### Pre-Build Integration Audit

Before building the first ticket, run these checks across ALL sibling plans to catch cross-ticket integration bugs early:

1. **HTTP method verification** — For every endpoint referenced in any plan, grep `routes.rb` (or the project's route definitions) and verify the HTTP method matches. Plans frequently restate methods wrong (e.g., PATCH for a POST collection action).
2. **Transform helper audit** — If any ticket adds new fields to an API response, check whether shared display/transform helpers (e.g., `toDisplayListing`, `formatResponse`) sit between the raw response and components. These helpers build new object literals and silently drop fields they don't know about.
3. **Test fixture verification** — Verify that test fixtures and factory definitions include any new schema fields added by sibling tickets. Missing fields in fixtures cause false passes.

If any mismatches are found, update the affected `plan.md` files and `feature-plan.md` before proceeding. This audit prevents a full build/review/test rejection cycle per ticket.

For each ticket in the sorted order:

### 1. Read Ticket State
Read `.bobby/tickets/{ID}*/ticket.md` frontmatter to determine the current stage.

### 2. Run the Right Agent
Based on the current stage, launch the corresponding agent:

- If stage is `building`: run bobby-build agent
- If stage is `reviewing`: run bobby-review agent
- If stage is `testing`: run bobby-test agent
- If stage is `shipping` or `done`: this ticket is complete — skip to the next ticket
- If stage is `backlog` or `planning`: ERROR — this should have been handled in Phase 1. Stop and report.

For each agent:
1. Claim the ticket: `bobby ticket assign {ID} {agent-name}`
2. Read `.bobby/tickets/{ID}*/ticket.md` for context
3. Read `.bobby/tickets/{epicId}*/feature-plan.md` for cross-cutting feature context
4. Follow the instructions in `.claude/agents/{agent-name}.md`
5. When complete, the agent updates the ticket stage via `bobby ticket move`

### 3. Check Result
After each agent completes:
1. Re-read `ticket.md` frontmatter to confirm the stage advanced
2. Run `git status --short` — if there are uncommitted source files, the agent failed to commit. STOP and report.

### 4. Advance or Retry
- **Stage advanced** → continue to the next agent
- **Stage went back to building** (rejection) → run bobby-build again. The build agent reads rejection comments to understand what to fix. Max retries: 3
- **Stage is shipping** → this ticket's workflow is complete
- **Stage is blocked** → skip this ticket, report the blocker, continue with the next ticket
- **Max retries exceeded** → skip this ticket, report failure, continue with the next ticket

### 5. Integration Check (Between Tickets)
After each ticket reaches shipping:
1. Run the project's full test suite (`npm test`). If the full test command fails because a service is unavailable (e.g., Docker not running, database not reachable), fall back to the frontend tests only.
2. If tests fail, the most recent ticket's changes likely caused it. Move that ticket back to building (`bobby ticket move {ID} build "Integration test failure: {details}"`) and retry.
3. If tests pass, proceed to the next ticket.

### 6. Next Ticket
Repeat for each ticket in the queue.

---

## After All Tickets

1. **Final verification** — Run the full test suite one final time (`npm test`)
2. **Run lint** if configured (`npm run lint`)
3. **If everything passes** — Move the epic to shipping: `bobby ticket move {epicId} ship`
4. **Report** — Show the final status of each ticket and the epic
5. **Sync** — Run `bobby sync` to commit ticket state changes to the umbrella repo
6. **Remind** — Tell the user: `Run bobby run ship to create a PR and merge.`

## Key Principles

- **Plan holistically first** — plan all tickets before building any, so each plan benefits from knowing its siblings
- **feature-plan.md is the source of truth** — cross-cutting decisions live in the epic's feature-plan.md, not scattered across individual plans
- **Single branch** — all tickets are built on the same feature branch, not separate branches
- **One ticket at a time** — process sequentially to catch integration issues early
- **Finish in-progress work first** — don't start new tickets while others are mid-workflow
- **Integration tests between tickets** — run the full test suite after each ticket ships
- **Trust agent decisions** — if an agent rejects, don't override it
- **Clean workspace** — verify `git status` after each agent
- **Stop on confusion** — if a ticket is in an unexpected state, stop and report rather than guessing
- **Never auto-ship** — feature workflow stops at shipping; user triggers `bobby run ship` when ready

---

## Project overrides

If `.claude/skills/bobby-feature/SKILL.local.md` exists, read it and follow it. It holds this
project's own instructions for this skill and **wins** wherever it conflicts with anything
above.

`SKILL.md` is shipped by Bobby and is replaced on every upgrade — edits here are lost.
`SKILL.local.md` is yours and is never overwritten.
