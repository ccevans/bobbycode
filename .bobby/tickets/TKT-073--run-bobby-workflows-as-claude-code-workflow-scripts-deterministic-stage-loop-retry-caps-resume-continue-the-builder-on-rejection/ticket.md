---
id: TKT-073
title: >-
  Run Bobby workflows as Claude Code Workflow scripts (deterministic stage loop,
  retry caps, resume) + continue the builder on rejection
stage: building
type: feature
priority: high
area: null
author: CC
assigned: bobby-build
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-10-25'
updated: '2026-10-25'
---

## Description

Today `bobby run workflow`, `bobby run feature` and `bobby sprint run` hand the host Claude session a long prose prompt (`lib/workflow.js` `buildFeaturePrompt` / `buildSprintPrompt` / `buildBatchStagePrompt`) that asks the model to loop stages, count retries, escalate to bobby-debug on the 2nd failure, and re-read `ticket.md` to detect stage changes. Nothing enforces those caps; the orchestrator is the model's judgment, and a crash means starting over.

Claude Code now ships a **Workflow** tool: a plain-JS script (`agent()`, `pipeline()`, `parallel()`, `phase()`, `log()`) that runs subagents deterministically, takes JSON-schema typed returns, supports `agentType` (so each stage runs as its own `.claude/agents/bobby-*.md` agent and keeps that file's model), `isolation: 'worktree'`, live progress in `/workflows`, and `resumeFromRunId` (completed agent calls return cached). Saved scripts live in `.claude/workflows/<name>.js` and run when the user names them.

Second part: on a review/test rejection the loop launches a FRESH build agent that re-reads everything. In the Agent-tool path (non-Workflow), the orchestrator can `SendMessage` the original builder with the rejection instead, keeping its context and saving the ~36k harness setup per agent. Workflow `agent()` calls cannot be continued, so this applies to the prompt path only.

Scope:
- Generate one saved Workflow script per named workflow (built-ins + `.bobbyrc.yml` `workflows:`) for the claude-code target only (`lib/targets/claude-code.js`); Cursor/Cline keep today's prompts.
- The script encodes the FSM in code: per-ticket `pipeline()`, each stage agent returns `{stage, verdict, reason}` by schema, retry cap + debug-on-2nd-failure in code, max-iterations backstop, blocked/done preflight, `log()` for anything skipped.
- Tickets stay the source of truth: stage agents still move tickets with `bobby ticket move`; the script reads the returned stage, never edits ticket files.
- Opt-in via config (e.g. `orchestration: workflow` in `.bobbyrc.yml`, default unchanged). When on, `bobby run workflow|feature|sprint` prints the saved-workflow invocation (name + args) instead of the prose prompt.
- Prompt path: the rejection loop tells the orchestrator to SendMessage the original builder (by agent id). If that builder is gone, the orchestrator says so in its report and starts a fresh build agent as an explicit, logged step (no silent substitute).

Out of scope: dashboard `claude -p` executor (separate), remote/cloud isolation, cross-session ownership.

## Acceptance Criteria

- [ ] With `orchestration: workflow`, `bobby init`/`bobby upgrade` writes `.claude/workflows/bobby-<name>.js` for every built-in and user workflow; scripts start with a pure-literal `meta` and parse as plain JS (no TS, no Date.now/Math.random)
- [ ] Each stage runs via `agentType: 'bobby-<step>'` and returns a schema-validated `{ticket, stage, verdict, reason}`; retry cap, debug escalation on the 2nd failure, and max-iteration cap are enforced in script code (unit-tested against the generated source)
- [ ] `bobby run workflow TKT-x` / `run feature` / `sprint run` print the saved-workflow call with args when the flag is on, and today's prompt unchanged when it is off (existing snapshot tests still pass)
- [ ] Rejection step in the prompt path continues the original builder via SendMessage; covered by prompt tests
- [ ] Non-claude targets never get workflow scripts
- [ ] One real end-to-end run on a throwaway ticket, including a kill + `resumeFromRunId`, with evidence in test-evidence/

## Comments
- [2026-10-25] bobby-build: Built: workflow-script generator + shared runtime, orchestration flag, run/feature/sprint print path, continue-the-builder prompts, README. 1311 tests pass (baseline 1275), lint 0 errors. Live e2e done headless with kill + same-session resume (build served from cache); cross-session resume does NOT cache - see test-evidence/README.md.
- [2026-10-25] bobby-plan: Planned. Size L (Complex). Recommended workflow: default. Approach A (generator + one shared runtime template) scored 32, vs 25 for a nested core and 24 for EJS. Deviation: tickets run sequentially, not through pipeline(), because they share one branch. Risk R1: init --refresh drops orchestration/workflows from .bobbyrc.yml on main (BOB-123 is unmerged), and Step 1 fixes it.
