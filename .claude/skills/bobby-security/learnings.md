# Bobby Security — Learnings

This file accumulates anti-patterns and best practices discovered during security audits. Check this file before starting work.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-security "pattern" "description"` -->

### Flagging theoretical risks without context (seed)
**Pattern:** Security agent reports every possible vulnerability regardless of actual exposure (e.g., flagging SQL injection in code that only accepts internal enum values).
**Fix:** Assess actual exploitability. Report real attack vectors with severity, not a checklist of theoretical risks.

## Best Practices
<!-- Document what works well -->

