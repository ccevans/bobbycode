# Bobby Plan — Learnings

## Anti-Patterns
<!-- bobby learn bobby-plan "pattern" "description" to add entries -->

## Structure-only test cases (seed)

When planning test cases for UI features, don't only test that elements exist in their default state. Always include at least one test case that exercises the write path: change value → save → verify persistence. Structure-only tests (checking CSS variables exist, checking elements render) miss broken save endpoints and non-functional data flows.
