# Bobby Freewill — Learnings

This file accumulates anti-patterns discovered while running tickets on freewill. Check it
before starting work.

Freewill is short by design, so this file is where its corrections belong — a learning is a
specific thing that went wrong, not a new procedure. If an entry here starts reading like a
process, the ticket it came from probably belonged in the default workflow instead.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-freewill "pattern" "description"` -->

### Freedom read as scope (seed)
**Pattern:** "Few instructions" gets read as "few constraints", and the agent tidies
neighbouring code, renames things, or upgrades a dependency it noticed on the way.
**Fix:** The instructions are short; the scope is not loose. `git diff --stat` before every
commit — every file must tie to the ticket in one sentence. File the rest as its own ticket.

### Self-review performed as a formality (seed)
**Pattern:** The agent writes "reviewed my own diff, looks good" and ships. It is the one
stage freewill removed, so a rubber-stamp version of it removes the stage entirely.
**Fix:** Name what you actually checked — the callers, the uncovered case, the assumption you
tested. A self-review that reports nothing specific found nothing.

### Shipping without the output (seed)
**Pattern:** Because no reviewer is coming, the agent asserts that tests and lint pass rather
than pasting the run. Downstream there is nobody left to catch it.
**Fix:** Paste the real output. Fewer stages means the evidence matters more, not less.

## Best Practices
<!-- Document what works well -->

### Say the approach in one line before taking it (seed)
**Pattern:** Freewill picks its own method, which means nobody else knows what it picked.
**Fix:** Open with one line — "test-first here because the bug is reproducible from the API"
— then proceed. It costs a sentence and makes the work reviewable after the fact.
