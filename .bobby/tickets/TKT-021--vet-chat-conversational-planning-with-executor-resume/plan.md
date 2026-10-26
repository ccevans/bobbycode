# Plan — TKT-021: Vet chat — conversational planning with executor --resume

## Problem

Planning happens in one shot: the orchestrator spawns `claude -p <prompt>`,
the agent writes `plan.md`, exits, and there is no way to intervene. If a user
disagrees with an assumption the planner made, the only recourse is to reject
the whole plan and re-run. There is no conversational loop.

The Claude CLI already supports `--resume <sessionId>` which continues a prior
conversation with full context preserved. The orchestrator never passes it.

## Goal

Add conversational planning: a ChatManager that holds sessions, a `plan`
permission mode on the executor so the agent cannot write files while the user
is still discussing, and `--resume` passthrough so subsequent turns pick up
where the last one left off. Chat sessions persist in `.bobby/chats.json` and
survive an app restart.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|:-:|:-:|:-:|:-:|:-:|
| A | ChatManager in lib/dashboard/, `--resume` on executor, `plan` permissionMode, `.bobby/chats.json` | 4 | 4 | 4 | 5 | **37** |
| B | Store full prompt+response pairs in workspace state and replay them as context in the prompt (no --resume) | 3 | 3 | 2 | 4 | 27 |
| C | Use a separate interactive terminal session instead of the dashboard executor | 2 | 2 | 2 | 3 | 19 |

**Selected: A.** `--resume` is a first-class Claude CLI feature that handles
context restoration, token management, and conversation state — reimplementing
that in the prompt (B) is fragile and expensive. A separate terminal session (C)
bypasses the dashboard entirely and doesn't work over the relay.

## Design decisions

### Decision 1 — Chat is a workspace mode, not a new entity type

A chat session IS a workspace in `plan` mode with `--resume` enabled. No new
top-level store. The workspace record gains: `chatId` (the Claude session id
used for `--resume`), `chatMode: true`, and `chatHistory` (array of
`{role, summary, at}` entries for the UI timeline). The ChatManager wraps the
orchestrator's existing run loop.

### Decision 2 — `plan` permission mode means read-only

The executor already supports `permissionMode` passthrough. For chat turns,
set `permissionMode: 'plan'` which tells Claude CLI to disallow file writes.
The agent can read code, discuss, propose — but cannot write `plan.md` until
the user says "commit the plan", at which point a final run drops the
permission restriction.

### Decision 3 — Commit action is a separate run

When the user says "commit the plan," the orchestrator runs one more turn
with `--resume` + normal `permissionMode` (no plan restriction). This turn's
prompt says "Write the plan we agreed on to plan.md and test-cases.md." The
agent has full context from the conversation and writes the files.

## Files to modify

- `lib/dashboard/chat.js` (NEW) — ChatManager class: `startChat(ticketId)`,
  `sendMessage(chatId, message)`, `commitPlan(chatId)`, `listChats()`.
  Wraps orchestrator workspace creation + runAgent with chat-specific options.
- `lib/dashboard/executor.js` — Add `resume` option to `runAgent()` and
  `buildArgs()` for both executor flavors. Pass `--resume <sessionId>` when set.
- `lib/dashboard/state.js` — Add `chatId`, `chatMode`, `chatHistory` fields to
  `newWorkspace()` (all default null/false/[]).
- `lib/dashboard/orchestrator.js` — Add `runChat(workspaceId, { message })` method
  that calls `runAgent` with `resume` + `plan` permissionMode. Add
  `commitChat(workspaceId)` that runs one final `--resume` turn without plan mode.
- `lib/dashboard/server.js` — New routes: `POST /api/chats` (start),
  `POST /api/chats/:id/message` (send), `POST /api/chats/:id/commit` (commit plan),
  `GET /api/chats` (list), `GET /api/chats/:id` (get).
- `.bobby/chats.json` — Persisted by ChatManager, parallel to `workspaces.json`.
  Contains chat metadata + message summaries (not full conversation — that's in
  the Claude session).
- `test/lib/chat.test.js` (NEW) — Unit tests for ChatManager.
- `test/lib/executor.test.js` — Add tests for `--resume` flag passthrough.

## Step-by-step plan

- [ ] Add `resume` option to `runAgent()` in `executor.js`: when set, inject
      `--resume <sessionId>` into the CLI args (for claude; cursor-agent equivalent
      if available, else skip).
- [ ] Add `chatId`, `chatMode`, `chatHistory` to `newWorkspace()` in `state.js`.
- [ ] Create `lib/dashboard/chat.js` with ChatManager:
      - `startChat(ticketId)` → creates workspace with `chatMode: true`,
        `permissionMode: 'plan'`. Returns chatId.
      - `sendMessage(chatId, message)` → calls `orchestrator.runAgent()` with
        `resume: ws.chatId` (after first turn, which sets it from the session id)
        and `permissionMode: 'plan'`. Appends to `chatHistory`.
      - `commitPlan(chatId)` → one final `runAgent` with `resume` but WITHOUT
        plan mode restriction. Prompt: "Write the agreed plan."
      - `getChat(chatId)` / `listChats()` — read from store.
- [ ] Add `runChat()` and `commitChat()` convenience methods on orchestrator (thin
      wrappers that set the right options and delegate to `runAgent`).
- [ ] Wire API routes in `server.js`: POST /api/chats, POST /api/chats/:id/message,
      POST /api/chats/:id/commit, GET /api/chats, GET /api/chats/:id.
- [ ] Persist chat metadata to `.bobby/chats.json` (ChatManager handles load/save,
      same pattern as WorkspaceStore).
- [ ] Tests: executor `--resume` passthrough, ChatManager startChat/sendMessage/
      commitPlan lifecycle, API route integration.
- [ ] Verify: `npm test` + `npm run lint` green.

## Risk areas

- **Claude session id format**: The executor currently generates bobby session ids
  (`ses-YYYYMMDD-HHmmss`). `--resume` needs the CLAUDE session id, which is
  returned in the stream output. ChatManager must capture it from the first run's
  stream events and store it on the workspace.
- **cursor-agent --resume**: cursor-agent may not support `--resume`. Gate the
  feature: if the executor is not claude-flavored, skip `--resume` and fall back
  to full-prompt replay (degraded but functional).
- **Permission mode enforcement**: `plan` mode is a Claude CLI concept. Verify it
  actually prevents file writes in the current CLI version before relying on it.
- **Chat length / context**: Long conversations will hit context limits. This is
  Claude CLI's problem to solve (it handles compaction), but test with multi-turn
  conversations to verify graceful behavior.

## Dependencies

- TKT-068 (converged trunk) — satisfied
- TKT-069 (target repo resolution) — satisfied; chat workspaces use the same
  repo resolution path

## Feature Context (parent TKT-020)

- **Depends on:** Executor and workspace infrastructure (both present on trunk).
- **Provides:** `--resume` executor support (used by any future interactive agent mode),
  ChatManager pattern (reusable for other conversational workflows), `plan` permission
  mode precedent.
- **Deviations:** None from feature-plan.

## Complexity

**Medium** — new ChatManager module + executor flag + API routes. No architectural
change; builds on existing workspace/executor patterns.
