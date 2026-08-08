---
id: TKT-048
title: >-
  Agents hardcode their exit stage, so any workflow but 'default' silently
  truncates
stage: done
type: bug
priority: high
area: orchestrator
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

Each agent hardcodes the stage it moves the ticket to when it finishes,
regardless of which workflow the ticket is running:

    .claude/agents/bobby-plan.md    -> `bobby ticket move {ID} build`
    .claude/agents/bobby-build.md   -> `bobby ticket move {ID} review`
    .claude/agents/bobby-review.md  -> `bobby ticket move {ID} test`

That is only correct for the `default` workflow. Traced against `quick`
(plan -> build -> test, no review stage):

    quick: planning -> building -> testing
      after plan   lands in building   direct -> build   OK
      after build  lands in reviewing  direct -> null    WRONG, should be test

bobby-build moves the ticket to `reviewing`, which is not a stage in `quick`,
so the stage lookup misses and the orchestrator concludes the pipeline is
finished. A `quick` feature therefore plans, builds, and stops — it never
tests, and it reports ready-to-merge.

The same breakage applies to `secure` (which inserts a security stage) and to
any workflow defined under `workflows:` in .bobbyrc.yml. Custom workflows are
advertised in CLAUDE.md and the README; they do not work through the app.

The fix is to stop hardcoding: the next stage should come from the ticket's
resolved workflow. lib/workflow.js already computes it (`nextStageName`), and
buildPromptFor already receives the resolved workflow, so the prompt can carry
the correct target instead of the agent file naming a literal.

Pairs with TKT-047 — fixing either alone leaves custom workflows broken.

## Acceptance Criteria

- [ ] Agents no longer name a literal next stage in their agent/skill files
- [ ] The next stage comes from the ticket's resolved workflow
- [ ] A `quick` ticket runs plan -> build -> test and does not stop after build
- [ ] A `secure` ticket runs its security stage
- [ ] Covered by a test that drives the real FSM across at least two workflows

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
