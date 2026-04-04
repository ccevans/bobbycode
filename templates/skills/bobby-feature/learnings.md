# Bobby Feature — Learnings

This file accumulates anti-patterns and best practices discovered during feature orchestration. Check this file before starting work on any epic.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-feature "pattern" "description"` -->

### Skipping holistic review (seed)
**Pattern:** Feature agent plans tickets one-by-one without reviewing sibling plans, leading to contradictory approaches or duplicated utilities across tickets.
**Fix:** Always complete Phase 1 (holistic planning) for ALL tickets before starting Phase 2. Review feature-plan.md for consistency after all tickets are planned.

## Best Practices
<!-- Document what works well -->
