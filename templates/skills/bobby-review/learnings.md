# Bobby Review — Learnings

This file accumulates anti-patterns and best practices discovered during peer reviews.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-review "pattern" "description"` -->

### Reviewing the wrong diff (seed)
**Pattern:** Using `git diff` (working tree vs HEAD) instead of `git diff main...HEAD` (full branch diff). Since the build agent commits everything, `git diff` returns nothing — so the reviewer thinks nothing changed and rubber-stamps.
**Fix:** Always use `git diff main...HEAD` for the branch diff and `git log --oneline main..HEAD` for the commit list.

### Rubber-stamp approval (seed)
**Pattern:** Approving after only reading the diff hunks without reading the full files around the changes. Misses broken callers, incompatible interfaces, and context that makes the change incorrect.
**Fix:** For every changed file, read the full file — not just the diff. Understand the context before judging the change.

### Skipping caller verification (seed)
**Pattern:** A function signature or return type changes but the reviewer doesn't check whether existing callers still work. Breaks surface later as runtime errors.
**Fix:** For every modified function/component/API, grep for its callers and verify they're compatible with the new behavior.

### Approving without running tests (seed)
**Pattern:** Review agent approves code based on reading the diff alone, without actually running the test suite.
**Fix:** Always run tests and lint. Show the output. If tests can't run, mark the review as BLOCKED.

### Vague rejections (seed)
**Pattern:** Rejection comments like "code doesn't work" or "needs fixes" that give the build agent nothing actionable.
**Fix:** Every rejection must specify: which AC failed, what the expected behavior was, what actually happened, and where in the code to look.

## Best Practices
<!-- Document what works well -->

### Read full files, not just diffs (seed)
**Practice:** Reading the entire file around a change reveals whether the new code fits with existing patterns, uses the right internal APIs, and doesn't duplicate existing functionality.

### Grep for callers before approving (seed)
**Practice:** Running a quick grep for every modified function's name catches broken consumers that the diff alone won't reveal. Takes 30 seconds, prevents production bugs.
