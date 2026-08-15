# Test — This Project's Learnings

**This file is yours.** Bobby seeds it once and never writes it again — not on
re-scaffold, not on upgrade. `bobby learn bobby-test "pattern" "description"` adds here.

Shipped anti-patterns live in `learnings.md` and are refreshed on upgrade.
Anything you write there will be lost; write it here instead. Where the two
disagree, **this file wins**.

## Anti-Patterns
<!-- bobby learn bobby-test "pattern" "description" to add entries -->

- **path-shim-fake-executor-for-agent-turns**: To live-test dashboard features that spawn agent CLIs (chat turns, runs) without paying ~$3/real claude turn, put a fake 'claude' executable earlier on PATH before launching 'bobby app'. resolveExecutor spawns bare 'claude' via PATH, so the running server uses your fake. Have the fake append its argv to a log (capture --permission-mode/--resume the server actually passed), emit a stream-json line with session_id (so session capture + --resume threading exercise for real), and optionally write the plan files named in the commit prompt. This verifies wiring/state/persistence through the genuinely-running server without reading source and without cost.
