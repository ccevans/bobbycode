---
name: run-workflow
description: "Workflow Skill: Runs the full SDLC workflow on one or more tickets — planning → building → reviewing → testing. Auto-chains agents with retry on rejection. Stops at shipping (use bobby run ship to create PRs/merge). MANDATORY TRIGGERS: workflow, run workflow, work tickets, work the board, auto, full workflow, end to end."
argument-hint: "<ticket ID(s) to workflow>"
---

# Bobby Workflow Skill

> Orchestrates the ticket lifecycle: planning → building → reviewing → testing. Auto-chains agents and retries on rejection. Stops at shipping — use `bobby run ship` separately to create PRs and merge.

## Before Starting

1. **Ticket selection** — If ticket IDs were provided as arguments, use those. Otherwise, discover and present tickets:
   a) Run `bobby ticket list planning` and `bobby ticket list backlog` to find tickets ready to start
   b) Run `bobby ticket list building`, `bobby ticket list reviewing`, `bobby ticket list testing` to find in-progress tickets that can be resumed
   c) Present the results to the user in two groups:

   **Ready to start:**
   | Ticket | Title | Stage |
   |--------|-------|-------|
   | ... | ... | backlog/planning |

   **Resumable (in progress):**
   | Ticket | Title | Stage |
   |--------|-------|-------|
   | ... | ... | building/reviewing/testing |

   d) Ask the user which tickets to workflow (specific IDs or "all")
   e) **Wait for the user's response before proceeding.** Do not auto-select.

2. **Branch guard** — Run `git branch --show-current`. If on main/master, create a feature branch: `git checkout -b tkt-{first-ticket-ID}`. NEVER commit directly to main/master.

## Safety Limits

- **Max retries per ticket:** 3 (when an agent rejects, loop back to building)
- **Max total agent invocations:** 20 (across all tickets — stop and report if hit)

## Workflow Stages

| Stage | Agent | What it does |
|-------|-------|-------------|
| planning | bobby-plan | Creates plan.md + test-cases.md |
| building | bobby-build | Implements the plan, commits code |
| reviewing | bobby-review | Code review — runs tests, lint, checks ACs |
| testing | bobby-test | Live app verification — browser + API testing |

> **Note:** Shipping is handled separately via `bobby run ship`. The workflow stops once a ticket reaches the shipping stage.

## Orchestration Process

For each ticket, sequentially:

### 1. Read Ticket State
Read `.bobby/tickets/{ID}*/ticket.md` frontmatter to determine the current stage.

### 2. Run the Right Agent
Based on the current stage, launch the corresponding agent:

- If stage is `backlog`: move to planning first (`bobby ticket move {ID} plan`), then run bobby-plan
- If stage is `planning`: run bobby-plan agent
- If stage is `building`: run bobby-build agent
- If stage is `reviewing`: run bobby-review agent
- If stage is `testing`: run bobby-test agent
- If stage is `shipping`: this ticket is complete — skip to the next ticket

For each agent:
1. Claim the ticket: `bobby ticket assign {ID} {agent-name}`
2. Read `.bobby/tickets/{ID}*/ticket.md` for context
3. CRITICAL: Read and follow `.claude/agents/{agent-name}.md` end-to-end — this file IS the agent's workflow. Do not improvise.
4. When complete, the agent updates the ticket stage via `bobby ticket move`

### 3. Check Result
After each agent completes:
1. Look for `<bobby:done ticket="..." stage="..." />` in the output — this signals the new stage
2. If not present, re-read `ticket.md` frontmatter as fallback
3. Run `git status --short` — if there are uncommitted source files, the agent failed to commit. STOP and report.

### 4. Advance or Retry
- **Stage advanced** → continue to the next agent
- **Stage went back to building** (rejection) → run bobby-build again. The build agent reads rejection comments to understand what to fix. Max retries: 3
- **Stage is shipping** → this ticket's workflow is complete. Move to the next ticket. To ship, run `bobby run ship` separately.
- **Stage is blocked** → stop this ticket, report the blocker, move to next ticket
- **Max retries exceeded** → stop this ticket, report failure, move to next ticket

### 5. Next Ticket
Repeat for each ticket in the queue.

## After All Tickets

1. Report the final status of each ticket
2. Run `bobby sync` to commit ticket state changes to the umbrella repo
3. If any tickets reached shipping, remind the user: `Run bobby run ship to create PRs and merge.`

## Key Principles

- **Use agent files, not inline prompts** — always tell subagents to read their `.md` agent file. Never write custom inline instructions that bypass standardized agent behavior.
- **One ticket at a time** — process sequentially, don't parallelize workflow stages
- **Trust agent decisions** — if an agent rejects, don't override it
- **Clean workspace** — verify `git status` after each agent
- **Stop on confusion** — if a ticket is in an unexpected state, stop and report rather than guessing
- **Never auto-ship** — workflow stops at shipping; user triggers `bobby run ship` when ready

---

## Project overrides

If `.claude/skills/bobby-workflow/SKILL.local.md` exists, read it and follow it. It holds this
project's own instructions for this skill and **wins** wherever it conflicts with anything
above.

`SKILL.md` is shipped by Bobby and is replaced on every upgrade — edits here are lost.
`SKILL.local.md` is yours and is never overwritten.
