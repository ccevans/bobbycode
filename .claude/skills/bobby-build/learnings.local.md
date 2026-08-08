# Build — This Project's Learnings

**This file is yours.** Bobby seeds it once and never writes it again — not on
re-scaffold, not on upgrade. `bobby learn bobby-build "pattern" "description"` adds here.

Shipped anti-patterns live in `learnings.md` and are refreshed on upgrade.
Anything you write there will be lost; write it here instead. Where the two
disagree, **this file wins**.

## Anti-Patterns
<!-- bobby learn bobby-build "pattern" "description" to add entries -->

- **test-fixture-encodes-the-bug**: When a test seeds state somewhere production code cannot write, it proves nothing. The orchestrator FSM suite wrote ticket stages into the worktree's ticket.md — a git checkout frozen at fork time that no agent can touch — so the approve to next-agent chain was green in tests and dead in production for its whole life. Before trusting a passing test on a write-then-detect flow, ask which process performs that write in production and make the fixture write the same way (here: moveTicket on the resolved tickets dir, what bobby ticket move does).
