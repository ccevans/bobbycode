---
id: TKT-022
title: 'Studio mode: switch projects from inside the app'
stage: building
type: feature
priority: medium
area: api
author: unknown
assigned: bobby-review
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-16'
---

## Description

`bobby app` serves the project it was launched in. The studio registry already
knows about every project on the machine (lib/studio.js), and `bobby remote
--studio` already serves them all over one tunnel — but the app itself cannot
switch.

Add a single mutable context and /api/projects/select so you can move between
projects without restarting the server.

## Acceptance Criteria

- [ ] The app lists registered projects and can switch between them
- [ ] Switching re-scopes tickets, workspaces and the brief to the new project
- [ ] A running agent in project A is not disturbed by switching to project B
- [ ] The selected project survives a page reload

## Comments
- [2026-08-16] system: REJECTED: AC1/AC2/AC4 fail on the shipped command: ProjectContext is wired into commands/dashboard.js, which bin/bobby.js does not register (it imports registerApp only; commands/app.js:67 carries .alias('dashboard')), and into commands/remote.js — but NOT into commands/app.js, which is the only local command that serves the app. Verified live on a real two-project studio: 'node bin/bobby.js app --port 7791' returns GET /api/config {isStudio:false, activeProject:null}, and GET /api/projects + POST /api/projects/select both 400 'not a studio'; 'node bin/bobby.js dashboard' prints 'now bobby app' and gives the identical three responses. ProjectContext itself resolves correctly when constructed (isStudio true, projectName alpha) — it is simply never constructed on that path. FIX: in commands/app.js mirror commands/dashboard.js:88/:101 — import ProjectContext, construct it with (root, config) before the Orchestrator, pass projectContext into the Orchestrator options; then prove it by starting the real command against a two-project studio and asserting /api/config carries isStudio+activeProject and that POST /api/projects/select re-scopes GET /api/tickets (a unit test that hand-wires its own orchestrator cannot catch this class — project-api.test.js is green today while the product is broken). Also decide the fate of commands/dashboard.js: it is unreachable, so delete it or the next feature gets wired there too. AC3 is NOW MET and verified adversarially — reverting the pin turns the new orchestrator-project-pin suite red 5 of 6, restoring it green 6 of 6; the pin fix, the scopeToProject rewrite and the new tests are all approved as-is. Should-fix while you are in there (not the blocker): /api/sessions (server.js:916,:926) computes sessionsDir from the BOOT config, so it is never re-scoped by a switch — use orchestrator.sessionsDir with the same fallback boardDir() uses; and createRepoRun pins sessionsDir but not ticketsDir, so a repo run started after a switch prompts against one board and logs to another. Decision hygiene: orchestrator-reads-tickets-from-the-shared-board still literally says the four reads go through this.ticketsDir, which is now false — re-record it with --supersedes so the list does not contradict itself. Full detail in review.md.
- [2026-08-15] system: AC3 blocker fixed: runs are pinned to their launch board; new orchestrator-project-pin suite exercises the exit after a switch
- [2026-08-15] user: Fixed the AC3 blocker. A workspace now PINS the board it was created on (ticketsDir/sessionsDir on the record, same pattern as TKT-069's repoRoot/lockFile), and every per-workspace read goes through _ticketsDirFor(ws)/_sessionsDirFor(ws): the exit stage re-read, prompt building (so an approve/reject relaunch after a switch is also pointed right), the existence check, feature children, session init + exec-event logging, readLatestSessionFile, and the mergedAt stamp. this.ticketsDir stays live for the UI's board and for picking a NEW ticket off it, so switchProject still re-scopes the UI exactly as before. scopeToProject now answers ownership from the pinned dir (exact, collision-proof) and only falls back to board membership for pre-pin records — via one listTickets Set per request instead of a findTicket readdir per workspace, which closes the non-blocking perf note too. New suite test/lib/dashboard/orchestrator-project-pin.test.js lets an alpha run actually EXIT while the UI sits on beta: stage/status read from alpha (5 of its 6 tests fail if the pin is removed), same-id-on-both-boards collision, auto-approve launching the next agent against alpha, session tail landing in alpha's sessions dir, createWorkspace pinning through real git, and the no-pin fallback. Decision recorded: a-run-is-pinned-to-the-board-it-started-on. Suite 1257 pass / 46 skipped, exit 0; lint 0 errors, 37 pre-existing warnings.
- [2026-08-15] system: REJECTED: AC3 fails: a run started in project A is disturbed by switching to B — its EXIT bookkeeping is not pinned to the launch project. In _onExit (lib/dashboard/orchestrator.js:689) findTicket(this.ticketsDir, ws.ticketId) reads the LIVE getter, so after a mid-run switchProject it resolves to project B's board, and _onExecutorEvent/_logSessionEvent (lines 608, 1274) log to B's sessions dir. Result: (1) A successful A-run whose agent moved its ticket is recorded as a no-op (findTicket on B's board returns null -> stageAdvanced false -> never reaches awaiting_approval); (2) prefix-collision variant (the exact hazard the plan's Risk section flags, mitigated for /api/workspaces but NOT here): findTicket returns an unrelated same-id ticket on B's board -> wrong nextStatus incl. awaiting_approval/ready_to_merge -> auto-approve (lines 748-756) can launch the next agent on the wrong board = silent cross-project corruption; (3) session log split across two dirs. TC-7 passes only because it asserts the process map immediately after the switch and never lets the run EXIT on B. FIX: pin ticketsDir+sessionsDir (or project name) at run() launch (~line 510) and thread them into settle/_onExit, _onExecutorEvent, _logSessionEvent instead of reading this.* live; switchProject may keep moving the UI/API board. Add a TC-7 assertion that lets an alpha run EXIT after switching to beta and asserts the stage/status was read from alpha's board, plus the same-id collision case. Non-blocking: scopeToProject (server.js ~236) calls findTicket (readdirSync) per workspace on every GET /api/workspaces poll — build a Set of ids via listTickets once per request instead. Everything else is correct: getter caller audit clean, off-studio inert, AC1/AC2/AC4 met, TKT-021 chat compatible, tests 1250 pass, lint 0 errors.
- [2026-08-15] bobby-build: Built: ProjectContext + orchestrator.switchProject + /api/projects[/select], /api/config isStudio/activeProject, live board re-scoping for tickets/brief/features/workspaces. 17 new tests (TC-1..12 + scoping/persistence). Full suite exit 0, lint 0 errors.
