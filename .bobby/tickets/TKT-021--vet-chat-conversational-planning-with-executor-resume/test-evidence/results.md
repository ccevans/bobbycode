# Test Evidence — TKT-021 (Vet chat: conversational planning with executor --resume)

**Date:** 2026-08-15
**Verdict:** PASS (4 of 4 ACs verified through the live running server)

## Method

Drove the **real running server** (`node bin/bobby.js app --port 7799`) via curl.
Because a real `claude` turn costs ~$3, a fake `claude` executable was placed
earlier on `PATH` (no source/config edits) so the live server spawned it for
every agent turn. This let me capture the **actual argv the running server
produced** and observe real chat state/persistence — genuine live behavior, not
code reading. Fake at `scratchpad/fakebin/claude`; spawn args logged per turn.
Scratch ticket **TKT-071** was created for the chats and fully cleaned up after
(worktree, branch, ticket dir, `.bobby/chats.json`, workspace record all removed).

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Conversation continued across turns via executor `--resume` | PASS | Turn 1 spawned with **no** `--resume`; server captured `session_id=fakesess-abc123` from turn 1's stream; **turn 2 spawned with `--resume fakesess-abc123`** (captured id). Commit turn also carried `--resume fakesess-abc123`. |
| 2 | Chat sessions persist and survive an app restart | PASS | Server 1 wrote `.bobby/chats.json` (3-entry history + captured session id). Killed it, started a **fresh process** on the same file → `GET /api/chats` returned the chat with all 3 history entries + `chatSessionId` intact. |
| 3 | Agent cannot write files in plan permission mode | PASS (wiring + no-write verified live; CLI enforcement is claude's contract) | Discussion turns spawned with **`--permission-mode plan`** (captured live from the running server), and the plan-mode turns wrote **no plan.md** to the ticket dir. |
| 4 | Resulting plan committed to the ticket in one action | PASS | `POST /api/chats/:id/commit` ran one turn with plan mode **dropped** (`--permission-mode bypassPermissions`) + `--resume`; with a writing agent, **plan.md landed in the main-rooted ticket dir** and API returned `idle`. |

## Endpoint contract (priority #1) — all live on the running server

| Test | Result |
|------|--------|
| `POST /api/chats` no ticketId | 400 `ticketId is required` |
| `POST /api/chats` `{ticketId:TKT-071}` | 200 `{chatId, ticketId, status:idle, chat}` |
| `GET /api/chats` | 200 `{chats:[...]}` |
| `GET /api/chats/:id` | 200 `{chat}` |
| `GET /api/chats/does-not-exist` | **404** (bad path) |
| `POST /api/chats/:id/message` no message | 400 `message is required` |
| `POST /api/chats/nope/message` | 404 `Chat nope not found` |
| `POST /api/chats/:id/commit` (no turns) | 400 `...has no turns to commit — send a message first.` |
| `POST /api/chats/nope/commit` | 404 |
| Chat routes with **no ChatManager wired** (minimal real-server harness, `chatManager:null`) | **501** `Conversational planning is not available on this host.` |

501 (route exists, host can't serve) is correctly distinct from 404 (bad path).

## Notes

- **Reviewer concern #3 CONFIRMED LIVE (not a blocker):** a commit turn whose agent
  wrote **nothing** still resolved `status:idle` and returned 200 with a
  "Committed the plan" history entry — no post-check that `plan.md`/`test-cases.md`
  actually landed. Matches the review flag; the AC ("can be committed in one
  action") is about running the write-capable turn, which works. Worth a v1
  follow-up: verify the files exist before reporting commit success.
- **Reviewer concern #2 (long-turn blocking) verified:** `POST /message` awaits the
  full turn — a 4s fake turn made the POST block ~4.2s then return 200 with the
  fully-updated chat. Contract holds locally; the real risk is proxy/client
  timeouts over the `bobby remote` tunnel (couldn't exercise the relay here).
- Chat worktrees are created under the configured `worktree_root`
  (`/Users/ccevans/Repos/bobby/worktrees/TKT-071-plan`); commit prompt names the
  **main-rooted absolute** plan.md path, so files land on the shared ticket board.

## Regression

Adjacent API routes on the same running server all healthy after the chat feature:
`/api/health` 200, `/api/workspaces` 200, `/api/tickets` 200, `/api/agents` 200.
No errors or stack traces in the server log across the whole session.

## Could not verify live (out of scope / cost)

- Real semantic multi-turn context via `--resume` (that the agent actually
  *remembers* prior turns) — requires a paid `claude` session; the `--resume`
  **plumbing** (id capture + threading) is verified. Reviewer unit-tested the rest.
- `bobby remote` relay timeout behavior for a long blocking POST — no relay in this env.
