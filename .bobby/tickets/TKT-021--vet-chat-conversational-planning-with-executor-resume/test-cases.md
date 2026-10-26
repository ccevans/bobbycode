# Test Cases — TKT-021: Vet chat — conversational planning with executor --resume

## TC-1: Executor passes --resume flag when set

**Precondition:** A mock spawn is injected into `runAgent`.
**Steps:**
1. Call `runAgent({ ..., resume: 'ses-abc123' })` with executor 'claude'.
2. Inspect the spawned args.
**Expected:** Args include `--resume` followed by `ses-abc123`.

## TC-2: Executor omits --resume when not set

**Precondition:** A mock spawn is injected into `runAgent`.
**Steps:**
1. Call `runAgent({ ... })` without the `resume` option.
2. Inspect the spawned args.
**Expected:** Args do NOT include `--resume`.

## TC-3: ChatManager startChat creates a workspace in plan mode

**Precondition:** Orchestrator with mock executor, ticket TKT-TEST exists.
**Steps:**
1. Call `chatManager.startChat('TKT-TEST')`.
2. Read the created workspace from the store.
**Expected:** Workspace has `chatMode: true`, `chatHistory: []`. The workspace
status is 'idle' and ready for the first message.

## TC-4: ChatManager sendMessage resumes the conversation

**Precondition:** A chat has been started (TC-3).
**Steps:**
1. Call `chatManager.sendMessage(chatId, 'What about using a queue?')`.
2. Wait for the executor to complete.
3. Read workspace from store.
**Expected:** `chatHistory` has one entry with the message summary.
The executor was called with `permissionMode: 'plan'`. After the first turn,
`ws.chatId` is set to the Claude session id captured from the stream.

## TC-5: ChatManager sendMessage uses --resume on subsequent turns

**Precondition:** A chat has completed at least one turn (TC-4).
**Steps:**
1. Call `chatManager.sendMessage(chatId, 'Good, now add error handling')`.
2. Inspect executor args.
**Expected:** The executor is called with `resume: ws.chatId` (the captured
Claude session id from the first turn).

## TC-6: ChatManager commitPlan writes files without plan restriction

**Precondition:** A chat with at least one turn (TC-4 or TC-5).
**Steps:**
1. Call `chatManager.commitPlan(chatId)`.
2. Inspect executor args.
**Expected:** The executor is called with `resume: ws.chatId` but WITHOUT
`permissionMode: 'plan'` (or with the default permission mode). The prompt
includes instructions to write plan.md and test-cases.md.

## TC-7: Chat sessions persist across restart

**Precondition:** A chat has been started and has messages.
**Steps:**
1. Save the ChatManager state (happens automatically on each operation).
2. Create a new ChatManager instance pointing at the same `.bobby/chats.json`.
3. Call `listChats()`.
**Expected:** The previously created chat appears with its history intact.

## TC-8: API — POST /api/chats starts a chat

**Precondition:** Server running with orchestrator.
**Steps:**
1. POST `/api/chats` with body `{ ticketId: 'TKT-TEST' }`.
**Expected:** 200 response with `{ chatId, ticketId, status }`.

## TC-9: API — POST /api/chats/:id/message sends a turn

**Precondition:** A chat exists (TC-8).
**Steps:**
1. POST `/api/chats/:id/message` with body `{ message: 'Use a simpler approach' }`.
**Expected:** 200 response. The chat's history grows by one entry.

## TC-10: API — POST /api/chats/:id/commit finalizes the plan

**Precondition:** A chat with messages (TC-9).
**Steps:**
1. POST `/api/chats/:id/commit`.
**Expected:** 200 response. The agent runs with write permissions and the
resulting plan.md can be committed to the ticket.

## TC-11: Error — sendMessage on a non-existent chat

**Steps:**
1. Call `chatManager.sendMessage('nonexistent', 'hello')`.
**Expected:** Throws with a message naming the chat id.

## TC-12: Error — commitPlan on a chat with no turns

**Precondition:** A chat that was just started, no messages sent.
**Steps:**
1. Call `chatManager.commitPlan(chatId)`.
**Expected:** Throws — there is nothing to commit.
