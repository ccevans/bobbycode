# TKT-082 plan — ship the context-cap auto-handoff hooks

Built alongside TKT-081 on branch `bobby/tkt-081-082-session-hooks`.

## Files
- `templates/hooks/context-cap.sh` (new) — UserPromptSubmit. Reads the last assistant usage from `transcript_path`; past `BOBBY_CONTEXT_CAP` (default 250000) adds context telling the session to hand off. Interactive: write the handoff (ticket `progress.md`, else `.bobby/handoffs/<date>-<topic>.md`) and run `hooks/handoff-spawn.sh`. Headless (`CLAUDE_CODE_ENTRYPOINT=sdk*`): stop and write a handoff. Already handed off: say which session took over. Wording addresses "the user", not a named person.
- `templates/hooks/handoff-spawn.sh` (new) — starts `claude --bg --remote-control "<name> 2"` with the session's model and effort, records `~/.bobby/hook-state/<session-id>.handoff`, refuses a second handoff, a missing/stale handoff file, or a session with no title and no name argument.
- `templates/settings.json.ejs` — register `UserPromptSubmit` → context-cap.sh.
- `commands/init.js` — `SHIPPED_HOOKS` gains context-cap.sh, handoff-spawn.sh (and stop.sh for TKT-081); `migrateHookSettings` adds the UserPromptSubmit entry when missing.
- `templates/CLAUDE.md.ejs` — Hooks section lists the context cap.
- `test/lib/compaction-hooks.test.js` — tests below.

## Tests
- Scaffold writes both hooks executable and registers UserPromptSubmit; migrate adds it once (idempotent).
- context-cap: under the cap → no output; over → interactive message names handoff-spawn.sh; headless → stop message, no spawn; marker present → "already handed off".
- handoff-spawn: refuses without CLAUDE_CODE_SESSION_ID, with an empty handoff, and when the marker exists (no `claude` call made).
