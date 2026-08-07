---
id: TKT-047
title: >-
  Orchestrator _resolveNextAgent looks off by one — the app's approve may skip
  the build stage
stage: backlog
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
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

`Orchestrator._resolveNextAgent` and `lib/workflow.js`'s `resolveNextAgent`
use OPPOSITE conventions for the same concept, and the orchestrator's version
appears to skip a stage.

`_onExit` writes the stage the ticket **moved to**:
    const newStage = ticket?.data?.stage       // read from the WORKTREE
    patch.stage = newStage || ws.stage
bobby-plan's prompt ends with `bobby ticket move <id> building`, so after plan
succeeds `ws.stage === 'building'`.

`_resolveNextAgent` then does:
    const idx = pipeline.findIndex(s => s.stage === ws.stage);   // 'building' -> 1
    const nextStep = pipeline[idx + 1];                          // -> reviewing
    return nextStep.agent.replace(/^bobby-/, '');                // -> 'review'

So approving after plan queues **review**, skipping **build**.

`lib/workflow.js` reads the same field the other way — stage -> the agent that
works ON that stage — and would return `build`:
    export function resolveNextAgent(workflow, currentStage) {
      const step = workflow.find(s => s.stage === currentStage);
      return step ? step.agent : null;
    }

The ambiguity is what `workspace.stage` MEANS: "the stage the ticket is now
in" (so its agent should run next) or "the stage just completed" (so +1 is
right). `_onExit` writes the former; `_resolveNextAgent` assumes the latter.

`test/lib/dashboard/orchestrator-pipeline.test.js` encodes the +1 form, so the
test and the code agree — but they may be agreeing on the bug. That test was
written for TKT-"per-workspace pipeline" and its intent was the *pipeline
selection*, not the offset.

Also in the same file: `AGENT_STAGE_MAP` and `PIPELINE_ORDER` are declared and
never read.

Scope note: this affects the APP's Approve button (orchestrator.approve ->
_resolveNextAgent). The CLI's `bobby run workflow` path builds one
orchestration prompt instead, so it does not go through here — which is
probably why this has not been noticed.

Found by bobby-arch while writing .bobby/architecture.md; recorded there as
pitfall 6/7.

## Acceptance Criteria

- [ ] A decision recorded in decisions.yaml on what workspace.stage means
- [ ] _onExit and _resolveNextAgent use the SAME convention
- [ ] Approving after plan queues build, not review — proven by a test that
      drives the real FSM rather than calling _resolveNextAgent directly
- [ ] orchestrator-pipeline.test.js updated if it was asserting the bug
- [ ] AGENT_STAGE_MAP and PIPELINE_ORDER removed or used

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
