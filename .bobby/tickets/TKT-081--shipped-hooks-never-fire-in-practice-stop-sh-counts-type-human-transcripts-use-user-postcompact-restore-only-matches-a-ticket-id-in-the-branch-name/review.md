## Review — TKT-081

### Verdict: Approved with Notes

### Files Reviewed
- `templates/hooks/stop.sh` — counts `type == 'user'` entries, skipping `isMeta` and tool_result-only content; reason JSON now built with `json.dumps` from an env var (no shell interpolation). Second-stop loop guard (`stop_hook_active`) intact; state file written before the block, so it cannot re-fire on the same count. Missing/invalid input falls through to `{}` (never blocks).
- `templates/hooks/postcompact-restore.sh` — branch ticket id matched with a boundary regex (`tkt-08` does not match `tkt-081`); progress.md wins over transcript; otherwise last `progress.md` / `.bobby/handoffs/*.md` that this session's own Write/Edit tool_use calls wrote. Always `exit 0`; nothing on stdout when nothing found. Quoting: python body is single-quoted with `\x27` escapes and no stray apostrophes.
- `commands/init.js` — `SHIPPED_HOOKS` now includes stop.sh/context-cap.sh/handoff-spawn.sh (refreshed on upgrade; chmod 755 applied to all). `migrateHookSettings` `ensure()` is exact-command idempotent (second call returns false), only appends, and leaves other keys untouched; bare `hooks/x.sh` commands still anchored first.
- `templates/CLAUDE.md.ejs` — hooks section updated; no person-specific wording.

### Code Concerns
- Non-blocking: a branch that names a ticket with no `progress.md` yet exits silently and never falls back to the transcript (postcompact-restore.sh, ticket loop `sys.exit(0)`). Acceptable per plan ("no guessing"), noting it.
- Non-blocking: both TKT-081 and TKT-082 appear in the branch name `bobby/tkt-081-082-...`; the restore picks the newest-mtime folder matching, i.e. only one of them. Only matters on this combined branch.
- Hygiene: `templates/settings.json.ejs` was left uncommitted by the build (see TKT-082); committed in this review.

### Decision Violations
- None.

### AC Verification
- [x] stop.sh counts real user turns and emits valid JSON — tests "blocks with valid JSON…" and "tool results and meta entries do not count".
- [x] restore works with no ticket id in the branch — three transcript tests incl. "branch ticket still wins".
- [x] old copies replaced on upgrade — "an old stop.sh is replaced on upgrade".
- [x] migrate idempotent — "migrate adds the context cap … once" (second call false).

### Test/Lint Output
- `NODE_OPTIONS=--experimental-vm-modules npm test -- test/lib/compaction-hooks.test.js`: 29 passed, 1 suite.
- `npx eslint commands/init.js`: 0 errors, 2 pre-existing warnings (writeConfig, TARGETS).

### Notes
- Behavior to expect: stop.sh now really fires (it never did), blocking once per 20 user turns.
