# Bobby Plan — Learnings

## Anti-Patterns
<!-- bobby learn bobby-plan "pattern" "description" to add entries -->

## Structure-only test cases (2026-03-23)

In the agent dashboard brand colors epic (TKT-139–143), all test cases verified that CSS variables and classes existed in their default state. No test case changed a value and verified the result. This let a broken save endpoint (double Bearer token) and a non-functional data flow ship to "shipping" across 5 tickets. Always write at least one test case that exercises the write path: change value → save → verify persistence.
