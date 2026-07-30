# Bobby Performance — Learnings

This file accumulates anti-patterns and best practices discovered during performance work. Check this file before starting work.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-performance "pattern" "description"` -->

### Optimizing without a baseline (seed)
**Pattern:** Performance agent suggests optimizations without first measuring current performance, making it impossible to verify improvements.
**Fix:** Always capture baseline metrics before proposing changes. Report before/after numbers in the findings.

## Best Practices
<!-- Document what works well -->

