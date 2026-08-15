---
id: TKT-049
title: The built-in 'secure' workflow cannot get past its security stage
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

`lib/workflow.js` STAGE_MAP maps BOTH `security` and `review` to the same
stage:

    const STAGE_MAP = {
      ... review: 'reviewing', ... security: 'reviewing', ...
    };

So the built-in `secure` workflow (plan, build, security, review, test)
resolves to five steps where two share the stage `reviewing`.

The orchestrator's FSM is keyed on stage. `resolveNextAgent` does
`workflow.find(s => s.stage === currentStage)` — with two steps on `reviewing`
it always finds the FIRST, which is security. And security's own handoff stage
is computed as `reviewing`, the stage it already occupies.

Result: `secure` reaches the security stage and cannot leave it.
`bobby-review` never runs. The run either stalls at security or, on approval,
re-runs security forever.

THE SHARP EDGE: with `dashboard.auto_approve_stages: ['reviewing']` this
becomes an UNATTENDED INFINITE LOOP spending real tokens. The new concurrency
cap (TKT-015) does not bound it — the loop is sequential, one agent at a time,
so it never trips a concurrency limit. Anyone running `secure` with auto-
approve on could burn their subscription overnight.

Found while fixing TKT-047/048. Those two fixed the off-by-one and the
hardcoded exit stages, which is why `secure` now REACHES security at all — it
previously never got there. The collision is older and independent.

It is currently pinned by a test named for it in
test/lib/dashboard/orchestrator-fsm.test.js, with a comment explaining the
mechanism, so this reads as a documented boundary rather than a silent gap.
Fixing this ticket should flip that test loudly.

THE FIX IS A SCHEMA CHANGE, which is why it was not done inline: `security`
needs its own stage in lib/stages.js, which means touching STAGES, the stage
colours, the TRANSITIONS table, and anything that renders a stage (the CLI
board, the app's pipeline, the brief). `design-build` and `design-check` share
stages with `building`/`reviewing` the same way and should be audited in the
same pass.

## Acceptance Criteria

- [ ] `security` has its own stage; no two steps in a built-in workflow share one
- [ ] A `secure` ticket runs plan -> build -> security -> review -> test end to end
- [ ] The pinning test in orchestrator-fsm.test.js is inverted to assert the fix
- [ ] design-build / design-check stage collisions audited in the same pass
- [ ] Stage rendering (CLI board, app pipeline, brief) handles the new stage
- [ ] A regression test proves auto_approve_stages cannot loop a stage onto itself

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
