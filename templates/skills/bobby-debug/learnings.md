# Bobby Debug — Learnings

This file accumulates anti-patterns and best practices discovered during debugging. Check this file before starting work on any ticket.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-debug "pattern" "description"` -->

### Jumping to conclusions (seed)
**Pattern:** Debug agent proposes a fix after reading only the error message without tracing the actual execution path.
**Fix:** Always reproduce the issue first, then trace from symptom to root cause before proposing any fix.

## Best Practices
<!-- Document what works well -->

