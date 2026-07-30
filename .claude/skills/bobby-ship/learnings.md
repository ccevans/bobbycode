# Bobby Ship — Learnings

## Anti-Patterns
<!-- bobby learn bobby-ship "pattern" "description" to add entries -->

### Shipping uncommitted work (seed)
**Pattern:** Ship agent creates PR while uncommitted source files exist, meaning the PR is incomplete.
**Fix:** Always run `git status --short` before pushing. If source files are uncommitted, return the ticket to build stage.
