## Review — TKT-022 (re-review, cycle 2)

### Verdict: Rejected

The AC3 blocker from cycle 1 is **genuinely fixed** — I reverted the pin and re-ran the new
suite to prove it (5 of 6 tests go red; evidence below). The fix is correct, complete, and
well-tested.

It is rejected on a different, pre-existing defect that cycle 1 missed: **the feature is not
wired into the command that actually serves the app.** `ProjectContext` was threaded into
`commands/dashboard.js` — which `bin/bobby.js` does not register and never has on this branch —
and into `commands/remote.js`. The real local server is `commands/app.js`, and it constructs its
Orchestrator without a `projectContext`. So on a real two-project studio, `bobby app` (and
`bobby dashboard`, which is an *alias* handled by `commands/app.js`) reports `isStudio: false`
and 400s both project routes. AC1, AC2 and AC4 are unreachable from the app.

---

### Files Reviewed

- `lib/dashboard/orchestrator.js` — the pin. `_ticketsDirFor(ws)`/`_sessionsDirFor(ws)` with a
  live-getter fallback; every per-workspace read converted (exit stage re-read :737, prompt ctx
  :628, existence check via `_requireWorkspaceTicket` :352/:500/:514, feature children :359/:1175,
  session init + exec-event dir threaded from `_launch` :550/:587, `readLatestSessionFile` :1184,
  `_recordTicketMerge` :1095, `_logSessionEvent` :1334). **Grepped every remaining
  `this.ticketsDir`/`this.sessionsDir` and judged each:** the three left are correct —
  `switchProject`'s broadcast payload (the UI's new board), `createWorkspace`'s pin source
  (:233-234, the board the ticket was just picked off), and `createWorkspace`'s own
  `_requireTicket(ticketId)` (:195, live — right, because a NEW ticket is chosen from the board
  the user is looking at; a pin does not exist yet).
- `lib/dashboard/state.js` — `newWorkspace` gains `ticketsDir`/`sessionsDir` (null-defaulted),
  `newRepoRun` gains `sessionsDir`. `WorkspaceStore` persists whole objects with no whitelist,
  schema or validation (`save()` → `Object.fromEntries`, `update()` → shallow merge), so the new
  fields round-trip and old records simply lack them. No serializer, differ or validator in the
  repo constrains the record shape; `/api/workspaces` returns records verbatim, so the addition
  is purely additive for consumers.
- `lib/dashboard/server.js` — `scopeToProject` rewritten. Pinned records answer by exact string
  equality, unpinned ones by a lazily-built `Set` of ids from one `listTickets(dir)` per request.
- `lib/dashboard/project-context.js`, `commands/remote.js` — unchanged since cycle 1, re-verified.
- `commands/app.js` — **the gap.** Lines 111-113 construct the Orchestrator with no
  `projectContext`; line 130 builds the server. No `ProjectContext` import anywhere in the file.
- `commands/dashboard.js` — has the correct wiring (:88, :101) and is **dead code**:
  `bin/bobby.js` imports `registerApp` (line 28) and never `registerDashboard`; `commands/app.js:67`
  claims `.alias('dashboard')`.
- `test/lib/dashboard/orchestrator-project-pin.test.js` (NEW) — see test quality below.
- `test/lib/dashboard/project-api.test.js` — new same-id-on-both-boards scoping test; the TC-7
  comment now honestly says what TC-7 does and does not cover.
- `.bobby/decisions.yaml` — new `a-run-is-pinned-to-the-board-it-started-on`.

### Code Concerns

**BLOCKER — the feature is wired into a command `bin/bobby.js` does not register (AC1/AC2/AC4).**

Live evidence, real CLI, real two-project studio (`.bobby/alpha`, `.bobby/beta`, `active-project`
= alpha), `node bin/bobby.js app --port 7791`:

```
GET  /api/config             {"project":"alpha", … ,"isStudio":false,"activeProject":null}
GET  /api/projects           400 {"error":"Project switching is not available — this is a
                                  single-project dashboard, not a studio."}
POST /api/projects/select    400 (same)
```

`node bin/bobby.js dashboard --port 7792` on the same studio prints
"`bobby dashboard` is now `bobby app` — same server, new UI" and returns the identical three responses,
because it is the same `commands/app.js` action. `ProjectContext` resolves fine when constructed
(`isStudio = true, projectName = alpha, ticketsDir = …/.bobby/alpha/tickets`) — it is simply never
constructed on this path. The one entrypoint that does construct it, `bobby remote`, is the tunnel.

This is exactly the ticket's own premise left standing: "`bobby app` serves the project it was
launched in … but the app itself cannot switch." The plan's "Files to modify" listed
`commands/dashboard.js` and `commands/remote.js`; nobody checked whether `commands/dashboard.js`
is still reachable. It is not.

**Fix:** in `commands/app.js`, mirror `commands/dashboard.js:88`/`:101` — import `ProjectContext`,
`const projectContext = new ProjectContext(root, config);` before the Orchestrator, and pass
`projectContext` into it. Then prove it the way I disproved it: start the real command on a
two-project studio and assert `GET /api/config` carries `isStudio: true` + `activeProject`, and
that `POST /api/projects/select` re-scopes `GET /api/tickets`. A unit test that builds a server
from a hand-wired orchestrator cannot catch this class — the existing `project-api.test.js` passes
today while the shipped command is broken. Also decide what to do about `commands/dashboard.js`:
delete it, or the next feature gets wired into it too.

**Should fix — `/api/sessions` is not re-scoped by a switch.** `server.js:916/:926` compute
`path.join(repoRoot, config.sessions_dir)` from the **boot** config. In a studio `config.sessions_dir`
is `.bobby/<boot project>/sessions`, so after switching to beta the session list and session
detail still read alpha's. AC2 names tickets/workspaces/brief, so this is outside the AC letter,
but it is the same class of bug as the one just fixed and it is one line (`orchestrator.sessionsDir`,
falling back as `boardDir()` does). Note the per-workspace log tail is fine — `readLatestSessionFile`
is pinned.

**Note — repo runs pin sessions but not the board.** `createRepoRun` pins `sessionsDir` only, so a
repo run created on alpha and *started* after a switch builds its prompt (`_promptContext` →
`_ticketsDirFor(ws)` → null → live) against beta's board while logging to alpha's sessions dir.
A repo run has no ticket so the blast radius is small, but the two halves disagree; pin
`ticketsDir` on `newRepoRun` too for consistency.

**Note — `scopeToProject` equality is sound, with one narrow hole.** Both sides originate in
`ProjectContext._resolveTo` (`path.join(root, '.bobby', name, 'tickets')`), the guard requires
`pc.isStudio() && pc.projectName`, and the getter therefore returns the context value on both the
pin write and the `boardDir()` read — identical strings by construction, no normalization needed.
The hole: a workspace created while the context had **no** project selected pins the constructor
fallback (`resolveTicketsDir(root, config)`), which will never equal a later `pc.ticketsDir`, so
that record becomes permanently invisible in the list. Reaching it requires a studio whose
`active-project` is unset *and* a ticket findable on the studio-root board — `bobby app` already
refuses to start in that state ("Select a project"), so it is currently unreachable. Worth a guard
if the startup refusal ever relaxes.

**Note — decision hygiene.** The new decision's `why` argues it does not weaken
`orchestrator-reads-tickets-from-the-shared-board`, which I accept in spirit (the pinned dir *is*
a main-rooted shared board). But that older decision's `fact` still literally says prompt building,
the existence check, feature children and the stage re-read on exit go through `this.ticketsDir` —
which is now false for all four. A future reviewer reading only `bobby decision list` sees a direct
contradiction, and the stale one reads as license to un-pin. Re-record the TKT-051 decision with
`--supersedes orchestrator-reads-tickets-from-the-shared-board`, keeping its still-true clause
(a worktree's own `.bobby/tickets` is never consulted) and restating the reads as `_ticketsDirFor(ws)`.

### Decision Violations
- None. Checked against all active decisions. `worktree-per-workspace`,
  `tickets-resolve-to-main-worktree`, `prompts-name-the-tickets-dir-absolutely` (the prompt still
  names an absolute main-rooted board — now the workspace's own),
  `one-repo-per-ticket-v1` (the pin follows the same record-it-at-creation pattern),
  `workspace-stage-is-the-stage-now-in`, `repo-runs-have-no-worktree-…`,
  `decisions-log-has-one-writer` (the new entry was added via `bobby decision add` — `supersedes`
  and `invalidated` keys present, schema intact) all hold. The
  `orchestrator-reads-tickets-from-the-shared-board` tension is a stale-record issue, noted above,
  not a violation by this code.

### AC Verification

- [ ] **AC1 — "The app lists registered projects and can switch between them": FAILS.**
      `GET /api/projects` and `POST /api/projects/select` exist and are correct, but under
      `bobby app` — the only local command that serves the App UI — both return 400 because no
      `ProjectContext` is constructed. Verified live against a real studio.
- [ ] **AC2 — "Switching re-scopes tickets, workspaces and the brief": FAILS on the same wiring.**
      The mechanism is right (`boardDir()` on every ticket/brief/feature route, `scopeToProject`
      on workspaces, now pin-exact) and is proven by `project-api.test.js`, but there is no
      switching to re-scope from under `bobby app`. (Sessions routes are not re-scoped at all —
      see Should fix.)
- [x] **AC3 — "A running agent in project A is not disturbed by switching to project B": NOW MET.**
      The exit path, the session log, prompt building, the existence check, feature children and
      the `mergedAt` stamp all read `ws.ticketsDir`/`ws.sessionsDir`, pinned at `createWorkspace`.
      Verified adversarially, not by reading: I replaced `_ticketsDirFor`/`_sessionsDirFor` with the
      live getters and restored `_onExecutorEvent`'s `this.sessionsDir`, and the new suite went
      **5 failed / 1 passed** — the alpha run's stage read beta's board, auto-approve launched the
      next agent at `…/.bobby/beta/tickets`, and the session tail vanished from alpha's log. The
      one test that stayed green is the no-pin fallback case, which is correct by design. Restored
      the file and re-ran: 6/6 green. That is a real red/green, not a claim.
- [ ] **AC4 — "The selected project survives a page reload": FAILS on the same wiring.**
      `setActiveProject` persistence is correct and `/api/config` carries `activeProject` — but
      under `bobby app` it is `null` with `isStudio: false`, so the client has nothing to restore.

### Test/Lint Output
- Tests: **PASS** — 1257 passed, 46 skipped, 69 of 70 suites (1 skipped), exit 0 (`npm test`).
- Lint: **PASS** — 0 errors, 37 warnings, all pre-existing `no-unused-vars` (two are in
  `lib/dashboard/orchestrator.js` / `lib/dashboard/server.js` but predate this ticket).
- Red/green on the pin: `NODE_OPTIONS='--experimental-vm-modules' npx jest
  test/lib/dashboard/orchestrator-project-pin.test.js` → 5 failed / 1 passed with the pin reverted,
  6 passed restored.

### Test Quality

The new suite is the strongest thing in this diff, and it fixes the specific weakness that let
cycle 1's bug through (an assertion taken *right after* the switch, never letting the run exit):

- Every test lets the alpha run **actually exit** while the context sits on beta.
- The fakes are faithful where it matters: real boards on disk, real `ProjectContext`, real
  `WorkspaceStore`, real `_onExit`, real `createTicket`/`moveTicket`. Only the CLI is faked, and
  the fake *obeys its prompt* — it parses the absolute ticket path out of the generated prompt and
  performs the move there, so "the prompt pointed at the wrong board" surfaces as a real
  mis-landed move rather than an assertion on a string.
- The collision test constructs a genuine same-id collision and asserts it (`expect(beta.id).toBe(ticketId)`)
  before relying on it, and pins beta's copy at `shipping` so a wrong read would produce
  `ready_to_merge` — a distinct wrong value, not just a missing one.
- The auto-approve test goes one step further than the record and asserts *where the next agent
  was pointed*, which is the actual corruption.
- Sad paths present: legacy record with no pin, off-studio fallback, missing-id case (the original
  symptom).

Gaps worth knowing: the worktrees are plain directories, so `commitCheckpoint`/`headSha` fail soft
and the `producedNothing` interaction with a pinned board is never exercised; and no test covers
the wiring of the shipped command, which is precisely why the blocker survived two cycles.

### Notes
- Callers audited for the two signature changes: `_requireTicket(ticketId, ticketsDir = this.ticketsDir)`
  has exactly two call sites (`createWorkspace:195`, `_requireWorkspaceTicket:1211`) and no test
  references it; `_recordTicketMerge(ws, mergedAt)` has one call site (`:1063`) and no test
  references. `ChatManager` (TKT-021) creates its workspace through `orchestrator.createWorkspace`,
  so chat runs are pinned for free and `_buildChatMessagePrompt`/`_buildChatCommitPrompt` read the
  pinned board.
- The cycle-1 perf note is genuinely closed: `scopeToProject` no longer does a `findTicket` readdir
  per workspace per poll; the `listTickets` Set is built once per request and only when an unpinned
  record is actually encountered.
- Everything in this diff outside TKT-022's files (lighthouse, chat, executor, worktree) belongs to
  other tickets on this integration branch and was not re-reviewed here.
