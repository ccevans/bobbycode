---
id: TKT-013
title: >-
  Built-in library workflow: CLI/library projects strand at the live-app test
  stage
stage: backlog
type: bug
priority: critical
area: cli
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

Every built-in workflow except `design` ends in the `test` stage, and
bobby-test is a live-app agent by contract — its skill mandates "NEVER run
any spec/test runner" and "NEVER verify behavior by reading source code";
verification happens only by observing a running app. For a project with no
live app (CLI tools, libraries, npm packages — a large share of Bobby's
stated audience), every test case is BLOCKED by rule and tickets silently
stop advancing at testing. No error, no guidance: the loop just stalls.

Discovered by dogfooding: bobbycode itself hit this on day one. The repo now
carries a local `workflows: default: [plan, build, review]` override in
.bobbyrc.yml as a workaround — this ticket is the upstream fix so no other
CLI project needs to discover the failure mode themselves.

Fix has three parts:

1. **Built-in `library` workflow** in BUILT_IN_WORKFLOWS
   (lib/workflow.js): `[plan, build, review]`. Review already runs the suite
   independently, which is the correct verification for a library. Also add
   `library-secure`: `[plan, build, security, review]`.
2. **Stack-aware default.** Stacks that imply no live app select `library`
   as their default workflow automatically. Concretely: a stack whose config
   has no health_checks and no dev command. Wire through stack JSON
   (stacks/*.json gains an optional `default_workflow` field) rather than
   hardcoding stack names, so custom stacks get the same behavior. `bobby
   init` on such a project writes the choice visibly into .bobbyrc.yml with
   a comment saying why.
3. **Loud failure instead of silent stall.** When a ticket enters `testing`
   and config has no health_checks, bobby-test's health-check step already
   has nothing to probe — the workflow prompt should tell the agent to move
   the ticket to blocked with reason "no live app to test — use the library
   workflow" instead of emitting BLOCKED test cases one by one.

Also fold in the small display bug found while verifying the workaround:
`bobby workflow list` prints the built-in stage list next to "(overridden)"
instead of the effective override (commands/workflow.js or wherever list
renders) — show the resolved stages.

## Acceptance Criteria

- [ ] `library` and `library-secure` are built-in workflows; `bobby workflow
      list` shows them and `bobby run library <id>` works
- [ ] `bobby init` on a project with no dev server/health checks defaults
      that project to the `library` workflow, visibly in .bobbyrc.yml with
      an explanatory comment
- [ ] A ticket entering `testing` with no health_checks configured gets
      blocked with an actionable reason, not silently stalled with BLOCKED
      test cases
- [ ] `bobby workflow list` shows effective stages for overridden workflows
- [ ] bobbycode's own .bobbyrc.yml override is replaced by the built-in
      (dogfood proof: the override comment block is deleted and the loop
      still ends at review)
- [ ] README workflow section documents `library` and when Bobby picks it


## Comments
