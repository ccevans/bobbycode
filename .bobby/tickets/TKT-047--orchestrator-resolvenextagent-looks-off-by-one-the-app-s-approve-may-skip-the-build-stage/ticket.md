---
id: TKT-047
title: >-
  Orchestrator _resolveNextAgent looks off by one — the app's approve may skip
  the build stage
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
created: '2026-08-07'
updated: '2026-08-08'
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

Traced against the real workflows (resolveWorkflow + each agent's hardcoded
exit move):

    default: planning -> building -> reviewing -> testing
      after plan   lands in building   code(+1) -> review   direct -> build
      after build  lands in reviewing  code(+1) -> test     direct -> review
      after review lands in testing    code(+1) -> null     direct -> test

The current `+1` is wrong at EVERY step of the default workflow: approving
after plan runs review (build never runs), approving after build runs test
(review never runs), and after review it returns null, so the run is declared
ready-to-merge without test ever running.

`direct` — find the step whose stage === ws.stage and return ITS agent, which
is what lib/workflow.js already does — is correct at every step.

Evidence that `direct` is the intended convention: every agent moves the ticket
TO the stage the next agent works in. bobby-plan ends `move {ID} build`,
bobby-build ends `move {ID} review`, bobby-review ends `move {ID} test`. So
workspace.stage means "the stage the ticket is now in" — the stage whose agent
runs next. CC could not recall the intent; the code answers it.

test/lib/dashboard/orchestrator-pipeline.test.js asserts the +1 form and is
therefore asserting the bug. Its real intent was per-workspace PIPELINE
SELECTION (that a 'quick' workspace uses the quick workflow), which is
orthogonal and must be preserved when the assertions are corrected.

NOTE: fixing this alone is not enough — see TKT-048. Agents hardcode their exit
stage, so `direct` still returns null mid-run on any workflow but `default`.
Land them together or `quick` stays broken either way.

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
