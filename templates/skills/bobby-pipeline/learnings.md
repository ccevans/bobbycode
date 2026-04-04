# Bobby Pipeline — Learnings

This file accumulates anti-patterns and best practices discovered during pipeline orchestration. Check this file before starting work on any ticket.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-pipeline "pattern" "description"` -->

### Ignoring uncommitted changes between stages (seed)
**Pattern:** Pipeline advances to the next agent without checking `git status`, causing the next agent to work on top of uncommitted changes or miss files the previous agent forgot to stage.
**Fix:** Always run `git status --short` after each agent completes. If uncommitted source files remain, stop and report rather than continuing.

## Best Practices
<!-- Document what works well -->
