# Build — This Project's Learnings

**This file is yours.** Bobby seeds it once and never writes it again — not on
re-scaffold, not on upgrade. `bobby learn bobby-build "pattern" "description"` adds here.

Shipped anti-patterns live in `learnings.md` and are refreshed on upgrade.
Anything you write there will be lost; write it here instead. Where the two
disagree, **this file wins**.

## Anti-Patterns
<!-- bobby learn bobby-build "pattern" "description" to add entries -->

- **field-to-getter-breaks-object-assign**: Converting an Orchestrator instance field (ticketsDir/sessionsDir) to a getter so studio project-switch re-scopes it live breaks any test that seeds the fake via Object.assign(o, { ticketsDir }) — a getter-only property throws on assignment. Grep for '.ticketsDir =' / Object.assign onto orchestrators and switch them to the backing field (_ticketsDir). Also: server routes captured ticketsDir at boot as a const closure; make them read a boardDir() that prefers orchestrator.ticketsDir so a switch actually re-scopes tickets/brief/features.

- **prompt-path-glob-not-expanded** (PRO-029): Agent file-read tools do NOT expand shell globs. Slugged ticket folders mean `${ticketsDir}/${id}*/ticket.md` returns "File does not exist" on the agent's first read. Emit the EXACT resolved folder (`findTicket`→`dirname`, glob fallback) for known-id sites; use `bobby ticket view {ID}` for runtime-placeholder sites (resolves slug + board, cwd-independent — same resolution assign/move already use). Blast radius: test helpers that hard-code the `{id}*/ticket.md` glob regex (`resolveTicketPathFromPrompt`, `openFromPrompt`, `bareBoardReads`) silently break when a prompt switches to a resolved path — they must accept both forms. The plan's "existing tests unchanged" claim was wrong here: 6 pre-existing tests encoded the old glob and needed updating.

- **test-fixture-encodes-the-bug**: When a test seeds state somewhere production code cannot write, it proves nothing. The orchestrator FSM suite wrote ticket stages into the worktree's ticket.md — a git checkout frozen at fork time that no agent can touch — so the approve to next-agent chain was green in tests and dead in production for its whole life. Before trusting a passing test on a write-then-detect flow, ask which process performs that write in production and make the fixture write the same way (here: moveTicket on the resolved tickets dir, what bobby ticket move does).
