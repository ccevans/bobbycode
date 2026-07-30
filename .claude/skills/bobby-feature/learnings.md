# Bobby Feature — Learnings

This file accumulates anti-patterns and best practices discovered during feature orchestration. Check this file before starting work on any epic.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-feature "pattern" "description"` -->

### Skipping holistic review (seed)
**Pattern:** Feature agent plans tickets one-by-one without reviewing sibling plans, leading to contradictory approaches or duplicated utilities across tickets.
**Fix:** Always complete Phase 1 (holistic planning) for ALL tickets before starting Phase 2. Review feature-plan.md for consistency after all tickets are planned.

## Integration Checks

### pre-build-integration-audit
**Pre-build integration audit for epic children**: After planning all children, before building the first: grep the backend routes file for every endpoint in sibling plans (verify HTTP methods match), check shared display/transform helpers for new API fields, and verify test fixtures include new schema fields. Catches cross-ticket integration bugs before they cost a full build/review/test rejection cycle.

## Best Practices
<!-- Document what works well -->
