## Review — TKT-022

### Verdict: Rejected

The feature is well-built and four of the five moving parts are correct. It is rejected on
**AC3**: a run started in project A is NOT undisturbed by switching to project B — its
*exit bookkeeping* reads the wrong project's board. TC-7 passes only because it asserts a
weaker property than AC3 states (it checks the process map right after the switch and never
lets the run exit on the other project). Details below, with a concrete fix.

### Files Reviewed
- `lib/dashboard/project-context.js` (NEW) — thin holder; studio vs off-studio resolution;
  `switchTo` validates against `listStudioProjects` and persists via `setActiveProject`.
  Off-studio it returns null dirs so the orchestrator falls back to constructor args. Correct.
- `lib/dashboard/orchestrator.js` — `ticketsDir`/`sessionsDir` converted to getters over
  `_ticketsDir`/`_sessionsDir` with `projectContext` taking precedence; `switchProject` +
  `_broadcastGlobal`. Getter conversion itself is clean (see caller audit). The **defect is
  that the getters are read live in the run-exit path**, which is not pinned to the run's project.
- `lib/dashboard/server.js` — `boardDir()`/`projectContext()` live accessors, `scopeToProject`,
  the two `/api/projects*` routes (400 off-studio), `/api/config` now carries `isStudio` +
  `activeProject`. All ticket/brief/feature routes now read `boardDir()`. Correct, one perf note.
- `commands/dashboard.js`, `commands/remote.js` — construct and thread `ProjectContext`. Correct.
- `test/lib/dashboard/orchestrator-pipeline.test.js` — the `wire()` fake now seeds `_ticketsDir`
  (the backing field) instead of the now-read-only `ticketsDir` getter. Necessary and correct.
- `test/lib/dashboard/project-context.test.js`, `project-api.test.js` — reviewed; good coverage
  of the happy paths and the off-studio 400s, but TC-7 under-tests AC3 (see below).

### Code Concerns

**BLOCKER — the run-exit path is not pinned to the run's project (AC3 failure).**
`_onExit` re-reads the ticket stage with `findTicket(this.ticketsDir, ws.ticketId)`
(orchestrator.js:689) and `_onExecutorEvent`/`_logSessionEvent` write session logs via
`this.sessionsDir` (orchestrator.js:608, :1274). Those getters are LIVE — after a mid-run
`switchProject`, they resolve to the *newly selected* project's board, not the board the run
was launched against. A run takes minutes; switching to another project while it runs is the
exact scenario AC3 names. When A's agent exits while the UI is on B:
- `findTicket(B_board, 'AL-001')` returns **null** → `newStage = null` → `stageAdvanced = false`.
  A genuinely successful run (agent moved AL-001 to `reviewing` on A's board) is recorded as a
  no-op; the workspace never reaches `awaiting_approval`. The user's completed work looks failed.
- **Prefix-collision variant** (the exact hazard the plan's own Risk section calls out, and which
  Decision 2 mitigated for `/api/workspaces` but left unmitigated here): if B's board has a
  ticket with the same id, `findTicket` returns an *unrelated* ticket, its stage is compared to
  A's `ws.stage`, and the run can land on a wrong `nextStatus` — including `awaiting_approval`
  (line 719) or `ready_to_merge` (line 720). Worse, the auto-approve branch (lines 748-756) can
  then `approve()` and launch the next agent reading B's board for A's ticket. That is
  cross-project state corruption, silent.
- Session log split: `initSession` wrote the header to A's `sessions/`; post-switch exec events
  append to B's `sessions/<id>.jsonl`. A's session file is left missing its tail.

This also violates the *intent* of decision `orchestrator-reads-tickets-from-the-shared-board`
(a run's success is read from "that shared board" — meaning the run's own project's board, not
whatever the UI now shows).

**Fix:** pin the run's board at launch and use it through exit. Capture
`ticketsDir`/`sessionsDir` (or the project name) in `run()` at line ~510 and thread them into
`settle`/`_onExit`, `_onExecutorEvent`, and `_logSessionEvent`, instead of reading `this.*`
live in those methods. `switchProject` may keep moving the *UI/API* board (that part is correct);
only the in-flight run must stay bound to where it started. Then add a TC-7 assertion that
actually lets an alpha run EXIT after a switch to beta and asserts the stage/status was read
from alpha's board (and the collision case: same id on both boards must not cross over).

**Non-blocking — perf smell in `scopeToProject` (server.js:~236).**
`workspaces.filter((ws) => !ws.ticketId || !!findTicket(dir, ws.ticketId))` runs a
`fs.readdirSync` (findTicket) per workspace on every `GET /api/workspaces`, a frequently-polled
route — O(workspaces × dir entries) of synchronous fs per request. Prefer building a `Set` of
ids once via `listTickets(dir)` per request and testing membership. Not a blocker at current
scale; worth doing when the pin above is added.

### Decision Violations
- None as a literal `.bobby/decisions.yaml` `fact` violation (the code reads `this.ticketsDir`,
  which the TKT-051 decision names). But the *intent* of `orchestrator-reads-tickets-from-the-shared-board`
  is broken by the unpinned exit read — noted under the blocker above rather than as a formal violation.

### AC Verification
- [x] AC1 — lists projects & switches: `GET /api/projects`, `POST /api/projects/select` (TC-5, TC-6).
- [x] AC2 — re-scopes tickets/workspaces/brief: `boardDir()` on ticket/brief/feature routes,
      `scopeToProject` on workspaces (TC-8, workspace-scoping test). Verified board membership,
      not prefix — matches the plan's risk mitigation; repo runs pass through.
- [ ] **AC3 — running agent in A undisturbed by switch to B: FAILS.** Process/worktree untouched
      (true, TC-7), but the run's EXIT bookkeeping reads B's board and B's sessions dir. Silent
      mis-recording, and cross-project corruption under a shared prefix.
- [x] AC4 — selection survives reload: `setActiveProject` persistence + `/api/config.activeProject`
      (TC-9, persistence test).

### Test/Lint Output
- Tests: PASS — 1250 passed, 46 skipped, 68 suites (1 skipped), exit 0. `npm test`.
- Lint: PASS — 0 errors, 37 warnings (all pre-existing `no-unused-vars` in unrelated files;
  none in the TKT-022 files). `npm run lint`.
- Note: the green suite does not cover the AC3 failure — TC-7 asserts only the process map, not
  the exit path.

### Notes
- Getter caller audit (the flagged high-risk change): no source or test assigns
  `orchestrator.ticketsDir`/`.sessionsDir`. Grep for `\.ticketsDir\s*=` / `\.sessionsDir\s*=`
  across `lib`/`commands`/`test` is empty. The only Object.assign onto an orchestrator is in
  `orchestrator-pipeline.test.js`; line 11 sets neither dir, and line 77 was correctly moved to
  `_ticketsDir`. All 12 internal reads (`this.ticketsDir`/`this.sessionsDir`) go through the
  getters. The conversion is safe — the problem is purely *when* the exit path reads them.
- Off-studio inertness verified: `_resolveTo` sets both dirs to null off-studio, the getter
  falls back to the constructor value, `/api/projects*` 400 (TC-10/11), `scopeToProject` passes
  the list through unchanged. A single-project dashboard behaves exactly as before.
- TKT-021 integration intact: `ChatManager` calls `orchestrator.runChatTurn` and never touches
  the dirs directly, so the getter change is transparent to it. (It shares the same unpinned
  session-logging exposure, which the fix above also resolves.)
- PRO-027 studio worktree guard is untouched by this diff.
- The board paths ProjectContext produces are absolute and studio-rooted
  (`path.join(root, '.bobby', name, 'tickets')`), consistent with PRO-026/TKT-052.
