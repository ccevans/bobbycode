# Bobby Build — Learnings

This file accumulates anti-patterns and best practices discovered during development. Check this file before starting work on any ticket.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-build "pattern" "description"` -->

### Uncommitted changes (seed)
**Pattern:** Build agent finishes work but forgets to `git add` and `git commit`, leaving uncommitted changes that block the ship agent.
**Fix:** Always run `git status --short` after committing. If any source files remain, stage and commit them.

### Hard-coding test values (seed)
**Pattern:** Build agent writes code that only works for the specific values in test cases (e.g., checking `if name == "John"` instead of implementing general logic).
**Fix:** Implement the actual algorithm. Tests verify correctness; they don't define the solution.

## Best Practices
<!-- Document what works well -->
