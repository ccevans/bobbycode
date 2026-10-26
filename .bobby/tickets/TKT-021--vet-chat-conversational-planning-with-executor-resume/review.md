## Review — TKT-021

### Verdict: Approved with Notes

Reviewed commit `f5238e3` against parent `d54da6c` on branch `integrate/app-studio`.

### Files Reviewed
- `lib/dashboard/executor.js` — `--resume` passthrough in the claude `buildArgs`, and new `claudeSessionIdFromEvent`. Verified the event shape it reads (`type:'stdout'`, `kind:'json'`, `data.session_id`) matches what `runAgent`/`parseLine` actually emit — `parseLine` returns `{kind:'json', data:<raw parsed JSON>}` and every claude stream-json event carries `session_id` at top level. It reads the CLI's real `session_id`, never bobby's `ses-`/`BOBBY_SESSION_ID`. `--resume` is only appended when `resume` is truthy, so non-chat runs are unchanged (TC-2).
- `lib/dashboard/orchestrator.js` — `runChatTurn` (plan/commit modes), prompt builders, and the `_launch` override plumbing. Traced the custom exit path in full (see Concern #1 analysis below).
- `lib/dashboard/chat.js` (NEW) — `ChatManager`: load/save (atomic tmp+rename, corrupt-file-tolerant), `startChat`/`sendMessage`/`commitPlan`/`getChat`/`listChats`, `_syncFromWorkspace` mirrors ws chat state onto the persisted record. chatId == workspaceId (no mapping layer).
- `lib/dashboard/server.js` — 5 chat routes wrapped in `withChat` (501 when no manager). POST for all mutations; 404 vs 400 disambiguation via `/not found/i` on the error message.
- `lib/dashboard/state.js` — `chatMode`/`chatId`/`chatHistory` added to `newWorkspace`, defaulted off (false/null/[]).
- `commands/app.js`, `commands/dashboard.js`, `commands/remote.js` — identical ChatManager wiring, filePath `<root>/.bobby/chats.json`, passed into `buildServer`.
- Test files (chat.test.js, chat-api.test.js, executor.test.js, state.test.js) — see Test Quality below.

### Code Concerns

**1. Custom exit handler — no state leak (verified, not a concern).**
`runChatTurn` bypasses `_onExit` deliberately (so a read-only plan turn isn't mislabeled a no-op by TKT-062). I compared the two cleanup paths line by line. `_onExit`'s top does `runningProcesses.delete` + `permissionDenials.delete`, and `_releaseRepoLock` only in the discarded-record branch. The custom `settle` in `_launch` replicates `runningProcesses.delete` + `permissionDenials.delete` before calling `onExit`. The only thing it does not do is `_releaseRepoLock` — and that is correct: chat workspaces are always worktree runs (`createWorkspace` → `createWorktree`), never `kind:'repo'`, so they never acquire the main-checkout lock. No registry, denial-counter, or lock leak.

**2. `sendMessage`/`commitPlan` hold the HTTP response open for the entire agent turn.** Unlike ordinary runs (fire-and-forget + SSE progress), the chat routes `await` the whole `runChatTurn` before responding — potentially minutes. Over the `bobby remote` tunnel this risks client/proxy timeouts, and the response body carries no streaming progress (only the `chat_turn_end` SSE does). Not a correctness bug; flag for the live tester to confirm a long turn survives the relay.

**3. `commitPlan` success is not verified against actual file writes.** The commit turn's custom exit correctly skips `producedNothing` detection (to avoid the no-op mislabel), but as a result a commit turn that wrote nothing (agent error) still resolves as `idle`/success. There's no post-check that `plan.md`/`test-cases.md` actually landed. Acceptable for v1 (the user can inspect the ticket), worth noting. The written plan is also left uncommitted in the main checkout working tree with no checkpoint — consistent with the shared-ticket-board model, but the next agent/human commits it via the normal flow.

**4. AC #3 (plan mode = read-only) is correctly wired but unprovable in unit tests.** The code passes `permissionMode:'plan'` on discussion turns; whether the agent genuinely cannot write is the claude CLI's contract. The plan flagged this as a risk to verify live. Tests assert the flag is passed (TC-4); the live tester should confirm no file writes occur during a discussion turn.

### Decision Violations
None. Checked against active decisions:
- `worktree-per-workspace` — chat writes `plan.md`/`test-cases.md` to the main-rooted ticket dir, not the worktree; this is the deliberately-shared ticket board (`tickets-resolve-to-main-worktree`), not code, so no violation. Prompts name the absolute main-rooted path per `prompts-name-the-tickets-dir-absolutely`.
- `concurrency-cap-refuses-per-server-process` — `runChatTurn` calls `_assertConcurrencyHeadroom()` and guards on `status==='running'` / `runningProcesses.has`.
- `relay-is-a-dumb-pipe` — chat routes are `/api/chats…`, GET/POST only, matching the tunnel allowlist. No new auth surface: same loopback/relay exposure as every other `/api` route (`local-server-is-loopback-and-unauthenticated`).
- `one-frontend-two-transports` — routes go through the same `request()` seam, uniform `{status, body}` shapes.

### AC Verification
- [x] **Continued across turns via `--resume`**: `claudeSessionIdFromEvent` captures the CLI session id off the first turn's stream; `runChatTurn` stores it as `ws.chatId` and threads `resume: ws.chatId` on subsequent turns. Verified real event shape + TC-5 (first turn `resume` undefined, second turn `resume === 'claude-xyz'`).
- [x] **Persist across restart**: `ChatManager` writes `.bobby/chats.json` (atomic) on every mutation and `load()`s on construct. TC-7 spins up a fresh manager on the same file and reads history intact.
- [x] **Cannot write in plan mode**: discussion turns launch with `permissionMode:'plan'` (TC-4 asserts it); enforcement is the CLI's job (see Concern #4).
- [x] **Commit in one action**: `commitPlan` → one turn with worktree permission mode (not `plan`) and a prompt to write `plan.md`+`test-cases.md`. TC-6 asserts the permission drop, `resume` continuity, and both filenames in the prompt.

### Test/Lint Output
- Tests: **PASS** — full suite `npm test`: 1233 passed, 46 skipped, 0 failed (66 of 67 suites; 1 suite skipped). Targeted TKT-021 files: 85 passed.
- Lint: **PASS** — 0 errors. 37 warnings repo-wide, all pre-existing/unrelated; the 2 in touched files (`orchestrator.js` unused `detectMainBranch` import, `server.js:75` unused `e` from commit `0f4cd3e2`) predate this commit.
- Test quality: strong. `chat.test.js` drives the REAL orchestrator on real git worktrees with a fake executor that records per-turn options and emits a session id — it genuinely exercises resume threading (TC-5), session-id capture (TC-4), persistence across a fresh manager (TC-7), the commit permission drop (TC-6), error paths (TC-11/12), and the "writes nothing but is idle, not no_op" bypass. Not non-null rubber-stamps.

### Notes
- For the tester (bobby-test): (a) verify a real multi-turn conversation resumes context via `--resume`; (b) confirm the agent genuinely cannot write files during a plan-mode turn (AC #3's real acceptance); (c) confirm a long turn does not time out over `bobby remote` given the blocking `await` on the POST.
- `startChat` allows multiple chats per ticket (each spends its own worktree) — appears intended, not flagged.
