# TKT-081 plan — make the shipped stop and post-compact hooks fire

Built alongside TKT-082 on branch `bobby/tkt-081-082-session-hooks`.

## Files
- `templates/hooks/stop.sh` — count human prompts as `type == "user"` entries whose content is a string or holds no `tool_result` block (tool results are also `user`). Pass the block reason to python through the environment: the old inline `'$reason'` broke on the apostrophe in "doesn't", so the hook could not have fired even with a correct count.
- `templates/hooks/postcompact-restore.sh` — keep the branch match first. When no ticket matches, read `transcript_path` from stdin and hand back the last `progress.md` or `.bobby/handoffs/*.md` this session wrote with Write/Edit, if it still exists.
- `commands/init.js` — `stop.sh` joins `SHIPPED_HOOKS` so existing projects get the fix on upgrade.
- `templates/CLAUDE.md.ejs` — Hooks section describes the restore hook (PreCompact text is stale: it no longer prompts).
- `test/lib/compaction-hooks.test.js` — tests below.

## Tests
- stop.sh blocks after BOBBY_SAVE_INTERVAL real prompts (tool results not counted) with valid JSON; under the interval → `{}`.
- postcompact-restore with a non-ticket branch restores the progress.md / handoff the transcript shows this session wrote; nothing written → no output; branch match still wins.
