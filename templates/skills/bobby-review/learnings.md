# Bobby Review — Learnings

This file accumulates anti-patterns and best practices discovered during peer reviews.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-review "pattern" "description"` -->

### Approving without running tests (seed)
**Pattern:** Review agent approves code based on reading the diff alone, without actually running the test suite.
**Fix:** Always run tests and lint. Show the output. If tests can't run, mark the review as BLOCKED.

### Vague rejections (seed)
**Pattern:** Rejection comments like "code doesn't work" or "needs fixes" that give the build agent nothing actionable.
**Fix:** Every rejection must specify: which AC failed, what the expected behavior was, what actually happened, and where in the code to look.

## Best Practices
<!-- Document what works well -->
