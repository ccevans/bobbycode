## Review — TKT-022 (re-review, cycle 3)

### Verdict: Rejected

Cycle 2's blocker is **genuinely fixed**: `commands/app.js` now constructs `ProjectContext`, and
`bobby app` on a real studio answers `isStudio: true` with both project routes live. I verified
that against the shipped command, not the tests. Cycle 1's AC3 pin is also still sound — I
re-broke it myself and watched the suite go red.

It is rejected on two **new** defects, both in the same family as the previous two rounds: code
that is correct in isolation and wrong about its context. `ProjectContext` re-derives the active
project instead of consuming the one `readConfig` already resolved, and nothing re-scopes the
project *config* on a switch — only the paths.

- **B1 is a regression on the shipped startup path**, introduced by b823e54 itself:
  `bobby app --project beta` served **alpha's board** after the commit and beta's before it.
- **B2 is an AC2 failure**: creating a ticket after switching to beta writes `AL-001` — the boot
  project's prefix — onto beta's board.

Both are silent. Neither is caught by any test, including the new e2e suite.

---

### Files Reviewed

- `commands/app.js` — the fix. `ProjectContext` imported (:23), constructed (:117), passed to the
  Orchestrator (:122). Off-studio construction is genuinely inert: the constructor's non-studio
  branch does **zero** filesystem reads and cannot throw (`project-context.js:37-41,58-68` — it
  reads `config.project` and assigns nulls), so a single-project `bobby app`, a repo with no
  `studio` key, and a worktree cwd all add no I/O, no throw and no latency. Confirmed the
  fallback chain: `orchestrator.ticketsDir` (:135) is
  `(projectContext && projectContext.ticketsDir) || this._ticketsDir`, and off-studio
  `projectContext.ticketsDir` is `null`, so the resolved boot value wins — byte-identical to
  pre-b823e54. **The studio path is where it breaks (B1).**
- `lib/dashboard/project-context.js` — **source of both blockers.** Constructor :37-39 and the
  `_config` cascade :53-55.
- `commands/dashboard.js` (deleted) — **deletion is clean.** Diffed against `commands/app.js` at
  e1e932c: everything it did is present in `app.js` or was dead. Nothing references it —
  `registerDashboard`/`commands/dashboard` hit only `docs/` and ticket history, no dynamic
  `import()` by string enumerates `commands/` (the only dynamic import is
  `plugins.js:140`, for plugin packages), and `package.json` ships `commands/` as a directory
  with no per-file manifest. `bin/bobby.js` imports `registerApp` only. Alias verified live, not
  assumed: `bobby dashboard --help` prints `Usage: bobby app|dashboard`, and
  `node bin/bobby.js dashboard` on the studio prints the deprecation line and returns
  `isStudio: true` + a working `/api/projects`. One capability *difference* worth recording,
  though it is pre-existing and not caused by the deletion: the dead file's shutdown had a
  `shuttingDown` re-entrancy guard, `store.save()` and `sseHub.closeAll()`;
  `app.js:173-181` has none of the three. That code never ran, so nothing regressed — but the
  only copy of that pattern is now gone.
- `lib/dashboard/server.js` — `sessionsBoardDir()` (:223) and the `/api/sessions` routes
  (:922,:931). Correct, and off-studio it is a quiet **improvement**: the old
  `path.join(repoRoot, config.sessions_dir)` ignored worktree resolution, the new
  `orchestrator.sessionsDir` falls back to `resolveSessionsDir`, which redirects to the main
  worktree per `tickets-resolve-to-main-worktree`. **But `config.ticket_prefix` at :328/:452 is
  still the boot config — that is B2.**
- `lib/dashboard/orchestrator.js` — `createRepoRun` now pins `ticketsDir` as well as `sessionsDir`
  (:312-320). Correct; `scopeToProject`'s `if (!ws.ticketId) return true` short-circuits before
  the pin is consulted, so repo runs are still never filtered.
- `lib/dashboard/state.js` — `newRepoRun` gains `ticketsDir` (null-defaulted). Purely additive.
- `test/e2e/app-studio-projects.test.js` (NEW) — see Test Quality.
- `.bobby/decisions.yaml` — the two-invalidate/one-add swap. See Decision Violations.

### Code Concerns

**BLOCKER B1 — `--project` / `BOBBY_PROJECT` is silently ignored; the app serves the wrong
project's board. Regression, introduced by b823e54.**

`bin/bobby.js:107-116` documents a global `--project <name>` that "selects the active project for
this one command without changing the studio default", implemented by setting `BOBBY_PROJECT`.
`readConfig` → `applyProjectContext` → `resolveActiveProject` honours the full precedence chain
(`lib/config.js:114-125`): explicit > `BOBBY_PROJECT` > `.bobby/active-project` > sole project.
The answer lands in `config._project`, and `resolveTicketsDir` uses it.

`ProjectContext` throws that away and re-derives from scratch (`project-context.js:37-39`):

```js
const initial = this._studio
  ? (getActiveProject(root) || listStudioProjects(root)[0] || null)
  : (this._studioConfig.project || null);
```

`getActiveProject` reads only the `.bobby/active-project` file (`lib/studio.js:135-138`) — it
never consults `BOBBY_PROJECT`. Because `orchestrator.ticketsDir` gives `projectContext`
precedence over the correctly-resolved `_ticketsDir`, the context's wrong answer wins.

Reproduced live on a real two-project studio (`.bobby/active-project` = `alpha`,
alpha holds `TK-001 alpha work`, beta holds `TK-900 beta work`):

```
# HEAD (after b823e54) — bobby app --project beta
/api/config   {"project":"beta","isStudio":true,"activeProject":"alpha"}
/api/tickets  TK-001 alpha work          <-- ALPHA. Wrong project.

# e1e932c (before b823e54) — same command, same fixture
/api/config   {"project":"beta","isStudio":false,"activeProject":null}
/api/tickets  TK-900 beta work           <-- correct
```

Two things are wrong at once. The board is the wrong project's, silently. And `/api/config`
contradicts itself — `project: "beta"` (what the header renders) beside
`activeProject: "alpha"` (what the picker selects and what the board actually is), so the UI
cannot even display a consistent answer. The startup banner also prints `Bobby — beta`.

`commands/remote.js:74` has the identical construction, so `bobby remote --project beta` has the
same defect.

**This also breaks the escape hatch for the known follow-up.** On a studio with no
`.bobby/active-project` and 2+ projects, `bobby app` exits 1 with
`Select a project: bobby project use <name> or pass --project. Projects: alpha, beta`. Following
that advice does not work:

```
# no .bobby/active-project at all, 2 projects — the remedy the error names
$ bobby app --project beta
/api/config   {"project":"beta","isStudio":true,"activeProject":"alpha"}
/api/tickets  TK-001 alpha work          <-- ALPHA again, via listStudioProjects()[0]
```

That state is reachable in normal use: `.bobby/active-project` is per-developer and gitignored,
and `commands/studio.js:74` only sets it for the *first* project created — so a fresh clone of a
two-project studio lands exactly here.

**Fix:** seed from the already-resolved answer and keep the existing chain as fallback —
`config` is already passed to the constructor:

```js
const initial = this._studio
  ? (this._studioConfig._project || getActiveProject(root) || listStudioProjects(root)[0] || null)
  : (this._studioConfig.project || null);
```

Apply to `commands/remote.js`'s path too (same class, same file). Then add an e2e case that
starts the real command with `--project beta` against a studio whose `active-project` is `alpha`
and asserts `/api/tickets` returns beta's ticket — the current suite cannot see this, because it
only ever runs without the flag.

---

**BLOCKER B2 — switching re-scopes the board but not the project's config, so tickets created
after a switch get the wrong prefix (AC2).**

`server.js:328` builds new tickets with `prefix: (config && config.ticket_prefix) || 'TKT'`, where
`config` is the **boot** config captured in `buildServer`'s closure. `boardDir()` moves on a
switch; `config` never does. `ProjectContext` computes a per-project config and exposes it
(`get config()`, :100) — **nothing consumes it.** `Orchestrator` stores `projectContext` but has
no config getter; `server.js` never calls `pc.config`.

Reproduced live (alpha `ticket_prefix: AL`, beta `ticket_prefix: BE`, booted on alpha):

```
POST /api/projects/select {"name":"beta"}   -> {"active":"beta"}
POST /api/tickets {"title":"made while on beta"}
     created id = AL-001                     <-- alpha's prefix
$ ls .bobby/beta/tickets/
     AL-001--made-while-on-beta   TK-900--beta-work
```

The ticket lands on the correct board with the wrong identity, and beta's own counter will later
mint `BE-001` — so one board ends up carrying two prefixes. AC2 says switching re-scopes tickets
to the new project; a create that ignores the new project's prefix does not.

Same closure staleness applies to `config.workflows` (via `resolveWorkflow` at boot) and
`config.dashboard.*`, which the per-project cascade in `applyProjectContext` is explicitly built
to override. Prefix is the one I could demonstrate end-to-end.

**Related trap for whoever fixes this — `ProjectContext._config` cascade is wrong too.**
`_resolveTo` (:53-55) does `{ ...this._studioConfig, ...readProjectConfig(root, name) }`, but
`_studioConfig` is the config `readConfig` **already cascaded with the boot project's** values.
So the boot project's keys leak into every project switched to, for any key the target does not
explicitly override. Proven — alpha carries `area_only_alpha: yes`, beta does not declare it:

```
boot    : alpha | prefix AL | area_only_alpha yes
switched: beta  | prefix BE | area_only_alpha yes   <-- beta has no such key
```

So the obvious one-line fix ("make `server.js` read `pc.config.ticket_prefix`") is **not
sufficient** — it would swap a stale prefix for a leaky config. `_resolveTo` must cascade over the
*studio-level* config, not the boot-project-cascaded one. Fix both together, and cover with a test
that boots on alpha, switches to beta, creates a ticket, and asserts `BE-001`.

---

**Note — no user-facing documentation.** The `CHANGELOG.md`/`README.md` changes on this branch are
TKT-024's lighthouse work. Studio project-switching, `/api/projects`, `/api/projects/select` and
the `isStudio`/`activeProject` fields on `/api/config` are undocumented. No AC requires it; raising
it because `bobby remote` and the studio both got CHANGELOG entries when they landed.

### Decision Violations

**None.** The swap is correct and I checked it entry by entry rather than trusting the summary.

- `orchestrator-reads-tickets-from-the-shared-board` (TKT-051, invalidated) — every constraint is
  carried forward. "A worktree's own `.bobby/tickets` is never consulted" is restated verbatim as
  the new fact's first clause; the four reads it named are restated as `_ticketsDirFor(ws)`; the
  success rule ("exits 0 AND the stage ON THAT SHARED BOARD differs") survives as "ON ITS OWN
  BOARD". Its "main-worktree-rooted" adjective is dropped, but `tickets-resolve-to-main-worktree`
  and `prompts-name-the-tickets-dir-absolutely` are both still active and carry it. **Nothing
  unrecorded.**
- `a-run-is-pinned-to-the-board-it-started-on` (invalidated) — fully absorbed: the pin, the
  per-workspace accessors, "the live getter is only for the UI's board and picking a NEW ticket",
  and the unpinned-record fallback all appear in the new fact.
- `orchestrator-reads-tickets-from-the-workspaces-own-board` (new) — accurate against the code as
  it now stands. I checked each read it names: prompt building (:636), existence check (:1219),
  feature children (:367,:1183), exit stage re-read (:745), session init (:558) and logging
  (:1342), mergedAt (:1103) all go through `_ticketsDirFor`/`_sessionsDirFor`; `createWorkspace`'s
  ticket pick and the API's board use the live getters. Its evidence line correctly cites
  `createRepoRun`'s pin and `sessionsBoardDir`, both added in b823e54.
- `decisions-log-has-one-writer` — respected; schema intact, `supersedes`/`invalidated` keys
  present, appended not hand-edited. Cosmetic only: the two new entries lack the blank line
  between records that the rest of the file uses. Still valid YAML.
- Also checked and holding: `worktree-per-workspace`, `worktrees-fork-from-main`,
  `one-repo-per-ticket-v1`, `workspace-stage-is-the-stage-now-in`,
  `local-server-is-loopback-and-unauthenticated`, `paid-code-never-ships-in-the-mit-package`
  (the App UI stays in the Pro package; only API surface was added here).

One provenance nit: the new entry does not carry forward TKT-051's
`supersedes: stage-advance-is-the-success-signal` link, so the chain is only traceable through the
now-hidden invalidated record. Not a lost constraint.

### AC Verification

- [ ] **AC1 — "The app lists registered projects and can switch between them": FAILS on B1.**
      `GET /api/projects` and `POST /api/projects/select` are now genuinely reachable from
      `bobby app` (verified live — this half is fixed). But the project the app opens on is
      resolved wrongly whenever `--project`/`BOBBY_PROJECT` is used, and on a fresh studio the
      documented way in (`--project`) silently opens the wrong project.
      *Separately:* I judge the `exit 1` on a no-selection studio to be **legitimately out of
      scope** — it lives in `resolveTicketsDir`/`studioBoardDir`, predates this ticket, and
      affects every command, so loosening it is a resolution-semantics change well beyond
      TKT-022. It is a fair follow-up **once B1 is fixed**, because B1 is what makes its
      advertised remedy fail. I am not requiring the exit-1 fix here.
- [ ] **AC2 — "Switching re-scopes tickets, workspaces and the brief": FAILS on B2.**
      Paths re-scope correctly and I verified it end-to-end (`POST /api/projects/select` moved
      `/api/tickets` from alpha's board to beta's). Workspaces re-scope via `scopeToProject`;
      brief/features go through `boardDir()`. But the project *config* does not re-scope, so
      ticket creation after a switch uses the boot project's prefix.
- [x] **AC3 — "A running agent in project A is not disturbed by switching to project B": MET.**
      Re-verified independently rather than inherited. In a throwaway worktree at HEAD I replaced
      `_ticketsDirFor`/`_sessionsDirFor` with the live getters and ran the pin suite:
      **5 failed / 1 passed** (the survivor is the no-pin fallback case, correct by design) —
      e.g. `_ticketsDirFor` returned `…/.bobby/beta/tickets` where `…/.bobby/alpha/tickets` was
      expected. Restored: **6/6 green**. Real red/green, my own hands.
- [ ] **AC4 — "The selected project survives a page reload": PARTIAL.**
      `setActiveProject` writes `.bobby/active-project` on every switch (verified — the file
      changed to `beta` after a select), and `/api/config` returns `activeProject` for the client
      to restore. That works for a plain reload. It is wrong under B1: on a `--project`-launched
      app the value reported is not the project being served.

### Test/Lint Output
- Tests: **PASS** — 1263 passed, 46 skipped, 1309 total; 70 passed / 1 skipped of 71 suites,
  exit 0 (`npm test`). Matches the builder's claim.
- Lint: **PASS** — 0 errors, 37 warnings, all pre-existing `no-unused-vars` in test files.
- Adversarial (AC3): pin suite **5 failed / 1 passed** un-pinned → **6 passed** restored.
- **Both blockers are invisible to the whole suite** — it is green with B1 and B2 present.

### Test Quality

The new `test/e2e/app-studio-projects.test.js` is a real improvement — it spawns
`node bin/bobby.js app`, so it is the first test that could have caught cycle 2's blocker. The
studio describe genuinely does: remove `projectContext` from `commands/app.js:122` and its four
tests go red. Readiness is condition-based on the `Running at` line printed from inside
`server.listen`, so there is no start/first-request race, and the port is OS-assigned via a proper
`freePort` helper. `--no-open` is passed, git identity and `-b main` are pinned locally, and
`BOBBY_APP_DIR` is blanked. Test 3 (select re-scopes) is the strongest thing here: it asserts
ticket *titles* before and after, the persisted file, and the read-back — it would not pass a
200-only implementation.

Issues, none of them the reason for rejection:

1. **Child-process leak on startup timeout.** `startAppOnce` rejects at :96 without killing the
   spawned child; `startApp` then either rethrows (:127) or spawns another (:120-123). A surviving
   child is a live HTTP server with ref'd stdio pipes in the jest worker → open-handle warnings, a
   worker that will not exit, and a stray server. Worse, when `beforeAll` throws the describe's
   `child` was never assigned, so `stopApp` no-ops (:147) while `rmSync(tmp)` (:165) deletes the
   studio out from under the orphan. Hoist the child and kill it on every rejection path.
2. **The EADDRINUSE retry is dead code.** :127 gates on `/already in use/i` matching the child's
   stderr, but the rejection fires on `child.on('exit')` (:106), which precedes stdio drain — and
   `commands/app.js:170` calls `process.exit(1)` immediately after writing, so the message can be
   truncated away entirely. A real port collision surfaces as `app exited early (code 1)` with an
   empty transcript and **no retry**. Listen on `'close'` instead; that also fixes the empty-output
   dead end for every other startup failure.
3. **The off-studio describe does not prove what its comment claims.** :212-214 says inertness is
   "a property of the shipped command", but every assertion at :241/:248 routes through
   `!pc || !pc.isStudio()` (`server.js:496,502,572`), which returns the identical answer when
   `projectContext` is **absent entirely**. Deleting the wiring leaves this describe green — it is
   a valid "off-studio behaviour unchanged" guard, not a wiring test. One assertion fixes it:
   `expect(cfg.body.activeProject).toBe('solo')`, since off-studio `pc.projectName` is
   `config.project` and would be `null` with no context. The value is already in the response.
   :248 also asserts status codes only; asserting the `noStudio` text would stop it passing on a
   400 thrown for an unrelated reason.
4. **Test 4 is order-dependent.** :208 asserts `activeProject === 'beta'`, which is state left by
   test 3. Under `-t`, `--randomize`, or after test 3 fails early it fails for the wrong reason.
   Capture `activeProject` before the request and assert it is unchanged.
5. **Not hermetic w.r.t. `HOME`.** `checkPro()` reads `$HOME/.bobby/licenses.yml` and
   `findExtension` probes `$HOME/.bobby/pro/...`. On a developer machine with Pro installed and
   licensed, `loadDashboardPlugins` imports it and registers third-party routes, and `appDir`
   becomes non-null — a materially different server than CI exercises. `test/setup.js:4` notes
   "Studio tests override HOME"; this suite does not. Set `HOME: tmp` (and blank `BOBBY_PROJECT`,
   which would otherwise perturb exactly the resolution B1 is about) in the spawn env.
6. **No per-test timeout override**, so jest's default 5000ms applies while suites run at
   cores-1 workers each spawning a child. 15000ms would cost nothing.
7. Minor: `path.resolve('bin/bobby.js')` (:25) resolves against `cwd`, not the test file;
   `output: () => out` (:101) and `startApp`'s `attempts` parameter (:118) are never used.

Coverage gap that matters most: **no test starts the command with `--project`**, and none creates
a ticket after a switch. Those are exactly B1 and B2.

### Notes

- The cycle-2 fixes I did not have to re-litigate: `/api/sessions` re-scoping and `createRepoRun`
  pinning `ticketsDir` are both correct and minimal.
- `commands/remote.js` carries the same `ProjectContext` construction, so B1 applies there too.
  Fix once in `project-context.js` and both paths are covered.
- Everything on this branch outside TKT-022's files (lighthouse, chat, executor, worktree) belongs
  to other tickets on this integration branch and was not re-reviewed.
- Repro fixtures used for B1/B2 were built in scratch and removed; the working tree is clean and
  no scratch worktrees remain.
