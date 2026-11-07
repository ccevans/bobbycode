## Review — TKT-082

### Verdict: Rejected

### Files Reviewed
- `templates/hooks/context-cap.sh` — reads last assistant usage from the transcript; JSON output via `json.dumps`; exits 0 silently under cap; bad input exits 1 (non-blocking for UserPromptSubmit, never exit 2). Cannot loop: no Stop interaction, one injected message per prompt.
- `templates/hooks/handoff-spawn.sh` — once-per-session marker, handoff freshness check, name/model/cwd from transcript, `claude --bg --remote-control` (flags exist in the installed CLI). Generic wording, matches the studio original with the person-specific names replaced.
- `templates/settings.json.ejs` — UserPromptSubmit registration. This was NOT in the commit (see 2).
- `commands/init.js`, `templates/CLAUDE.md.ejs`, `test/lib/compaction-hooks.test.js` — read in full.

### Code Concerns (blocking)
1. **Stale usage right after a compaction triggers a false handoff.** `context-cap.sh:24-31` takes the last assistant usage in the transcript and never resets on compaction. After a `/compact` the transcript holds the pre-compact assistant turn (e.g. 400k), then the compact-summary user entry (`isCompactSummary: true`), then the next prompt; the real context is about 75k, but the hook reads 400k and tells the session to hand off and spawn a successor. Repro (scratchpad `compact.jsonl`: assistant 400k, `isCompactSummary` user entry, new user prompt) printed "CONTEXT CAP ... about 400k tokens ... Hand off now". In local transcripts one of 12 compactions had real user prompts between the summary and the first post-compact assistant turn. Our own CLAUDE.md advises compacting past ~400k, so this is the common path, not an edge. Fix: in the loop, `if d.get("isCompactSummary"): last = 0` (and add a test: usage over cap, then a compact summary, then under-cap or no usage, expects no output).
2. **`templates/settings.json.ejs` change was left uncommitted** (working tree only). At commit 1dc0949 a fresh `bobby init` does not register context-cap.sh and the test "context-cap and handoff-spawn ship executable, with UserPromptSubmit registered" only passes with the dirty file. I committed the file in this review (change is the plan's intended one), but the build agent should not leave source files dirty.

### Code Concerns (non-blocking)
- `handoff-spawn.sh:34`: `set -euo pipefail` plus `ls ... 2>/dev/null | head -1` means a missing transcript makes the assignment fail and the script exits 1 silently; the "no transcript found" message at line 35-37 is dead. Repro: run with an unknown `CLAUDE_CODE_SESSION_ID`, exit=1, no output. Add `|| true` to that pipeline. Also ignores `CLAUDE_CONFIG_DIR`.
- `context-cap.sh`: a non-numeric `BOBBY_CONTEXT_CAP` or an unreadable `transcript_path` prints a Python traceback and exits 1 (hook-error noise, not a block). Acceptable under "no fallbacks", but a one-line message would be kinder.
- `context-cap.sh` reads the whole transcript on every prompt; fine today, could read the tail only.

### Decision Violations
- None.

### AC Verification
- [x] Hook fires over cap and tells interactive sessions to hand off via spawn script; headless only stops — tests cover both.
- [x] At most once per session — marker file, tested ("a second time", "after a handoff it points at the successor").
- [x] No person-specific wording in scaffolded files — grepped templates/hooks, settings, CLAUDE.md diff; test asserts no `CC`.
- [x] Registered in settings and migrated idempotently — OK once settings.json.ejs is committed.
- [ ] Never fires falsely — fails on the post-compaction case (1).

### Test/Lint Output
- `npm test -- test/lib/compaction-hooks.test.js`: 29 passed. (Passes only with the uncommitted settings.json.ejs.)
- `npx eslint commands/init.js`: 0 errors, 2 pre-existing warnings.

### Notes
- TKT-081 is approved separately; this rejection is independent of it.

---

## Re-review — commit 1ad1fbf

### Verdict: Approved

- `context-cap.sh`: usage is reset to 0 on `subtype == "compact_boundary"` or `isCompactSummary`. My earlier repro (400k assistant turn, compact summary, new prompt) now prints nothing and exits 0. A post-compaction assistant turn still sets the size normally.
- `handoff-spawn.sh`: nullglob array replaces `ls | head`; an unknown session id now exits 1 with "no transcript found for session <id>". Multiple matches take the first, as before.
- Tests: two new tests cover both fixes. `npm test -- test/lib/compaction-hooks.test.js`: 31 passed (1 suite).
- The earlier non-blocking notes (traceback on a bad `BOBBY_CONTEXT_CAP`, whole-transcript read) are unchanged and still non-blocking. No scope creep in the commit.
