## Review — TKT-022 (re-review, cycle 4)

### Verdict: Rejected

**Both cycle-3 blockers are genuinely fixed, and the `lib/config.js` refactor that fixed them is
clean** — I proved behavioural equivalence rather than reading for it (below). B1, B2, the AC3 pin
and the cycle-2 reachability fix all re-verified from scratch, live, on a real studio.

It is rejected on **B3**: the switch re-scopes the board and — as of this commit — the ticket
prefix, but it still does not re-scope **the orchestrator's config**, which is the boot project's.
The worst consequence is not cosmetic:

> After switching to beta, creating a workspace for a **beta** ticket cuts the git worktree from
> **alpha's repo**. The agent then edits the wrong project's codebase.

This is the same defect family as B2 — a per-project config value read from a boot-time
reference — and R3 named it in advance ("Same closure staleness applies to `config.workflows` and
`config.dashboard.*`"). The fix built the right seam (`activeConfig()`) and then applied it to two
call sites only, leaving the orchestrator and two API routes on the boot config.

---

### Files Reviewed

- **`lib/config.js`** — `readConfig` split into `readBaseConfig` + the studio branch;
  `applyProjectContext` delegates to a new `cascadeProject`; new exported
  `configForProject(studioRoot, project)`. **Blast radius: nil. Proven, not asserted.** I imported
  `lib/config.js` from a worktree at `efbf2cd` and from `HEAD` into one process and deep-compared
  `readConfig` output (recursive key-sorted serialization, so nested `dashboard`/`git_conventions`
  differences cannot hide) across 8 fixture shapes: non-studio minimal, non-studio with
  `tickets_dir`/`bobby_dir`/nested partial overrides, non-studio that happens to contain
  `.bobby/<x>/.bobbyrc.yml`, studio+active project, studio unselected (2 projects, no file), studio
  with a sole project, empty studio, and a studio whose project overrides `bobby_dir`/`tickets_dir`.
  Plus the `BOBBY_PROJECT=beta` case. **All identical.** Also confirmed the new function is not a
  second implementation: `configForProject(root,'beta')` deep-equals `readConfig(root)` with
  `BOBBY_PROJECT=beta`.
  - *Ordering/mutation/identity, specifically asked about:* unchanged. The derived dirs are still
    set before the cascade; `cascadeProject` mutates the object it is handed exactly as
    `applyProjectContext` did, and in both call paths that object is a **freshly built**
    `readBaseConfig` result that no other holder has a reference to — so the mutation of
    `repo_group`/`_studio` is not observable by anyone. Returned identity is also unchanged
    (`merged` itself for non-studio and for studio-with-no-project; a new object once a project
    cascades).
- **`lib/dashboard/project-context.js`** — constructor takes `config._project` first; `_resolveTo`
  calls `configForProject`. Both correct, and both proven live. One new failure mode introduced
  here — see Code Concerns C1.
- **`lib/dashboard/server.js`** — `activeConfig()` and its two `createTicket` call sites. Correct
  as far as it goes; **`/api/config` and `/api/workflows` were not converted and are wrong after a
  switch (B3).**
- **`commands/app.js` / `commands/remote.js`** — I grepped every `new ProjectContext` (2 in
  `commands/`, 11 in tests). Both production callers pass `readConfig(root)` output, so `_project`
  is always the correctly-resolved value; **no caller passes a config whose `_project` disagrees
  with its intent.** The test callers pass `{studio:'teststudio'}` with no `_project` on purpose,
  which is what keeps the file/first-project fallback covered. `commands/remote.js` has no
  separate multi-project mode to conflict with — its only `studio` reference is that comment.
- **`lib/dashboard/orchestrator.js`** — re-read for B3. `this.config` is assigned once in the
  constructor and **nothing re-points it**; `switchProject` moves only the context.
- **`test/e2e/app-studio-projects.test.js`, `test/lib/dashboard/project-context.test.js`** — see
  Test Quality.

### Code Concerns

**BLOCKER B3 — a switch re-scopes the board but not the orchestrator's config. A workspace created
after a switch is cut from the previous project's repo. (AC2)**

`cascadeProject` (`lib/config.js:161-181`) is explicit that these are per-project keys:
`project_repos` (`= pc.repos`), `ticket_prefix`, and the `git_conventions` / `dashboard` /
`workflows` deep merges. `Orchestrator.this.config` holds the **boot** project's cascade and is
never re-pointed, so every one of them is stale after a switch. `_resolveTargetRepo`
(`orchestrator.js:281-282`) reads `this.config.project_repos` to decide **which repo the code is
cut from**.

Reproduced live against the shipped command on a studio with a two-repo group
(`alpha → repos/appa`, `beta → repos/appb`), each repo carrying a `MARKER.txt` naming itself:

```
$ bobby app                                  # .bobby/active-project = alpha
POST /api/projects/select {"name":"beta"}  -> {"active":"beta"}
GET  /api/tickets                          -> ["beta work"]          # board moved, correct
POST /api/workspaces {ticketId:"BE-001"}   -> 201
     workspace.repoRoot   = …/studio/repos/appa                      # <-- ALPHA's repo
     workspace.worktreePath = …/repos/appa/wt/BE-001-plan
     MARKER.txt in the worktree: "this is appa"
     workspace.ticketsDir = …/.bobby/beta/tickets                    # pinned to beta, correctly
```

And the mirror image, which rules out any other cause — boot on beta, switch to alpha, create a
workspace for an **alpha** ticket:

```
$ bobby app --project beta
POST /api/projects/select {"name":"alpha"}
POST /api/workspaces {ticketId:"AL-001"}   -> workspace.repoRoot = …/studio/repos/appb
     MARKER.txt in the worktree: "this is appb"                      # <-- BETA's repo
```

So the record is pinned to the right *board* (AC3's fix) while pointing at the wrong *repo*. An
agent launched on it edits another project's code on a branch in another project's repository, and
`mergeToMain` would later merge it there. This is the wrong-repo class that `one-repo-per-ticket-v1`
and `_resolveTargetRepo`'s own doc comment exist to prevent, and it is silent — status 201, a
plausible-looking worktree path.

Two more instances of the same staleness, from the same runs:

```
                      after POST /api/projects/select {"name":"beta"}
GET /api/config    -> project: "alpha"   activeProject: "beta"   stack: "nextjs"   (beta is "go")
GET /api/workflows -> [... "alphaflow"]                          (beta declares "betaflow")
```

- **`/api/config` self-contradicts again.** `project: alpha` beside `activeProject: beta` is
  precisely the "the UI cannot render a consistent answer" defect R3 rejected on — fixed for the
  `--project` path (the new e2e test asserts `body.project === 'beta'` at boot, so the author
  treats this field as the active project's name) and still broken for the switch path. `stack` is
  wrong with it, and the route's own doc says the Feature view falls back to `project` when `repo`
  is null, so this mislabels the UI.
- **`/api/workflows` (`server.js:489-490`) offers the boot project's workflows.** On beta it lists
  `alphaflow` and omits `betaflow`; and since `createWorkspace` validates with
  `resolveWorkflow(this.config, pipelineName)` (`:199`), beta's own workflows are not merely
  unlisted, they are unusable until the server is restarted.

Also stale from `this.config`, not separately demonstrated but the same read:
`resolvePermissionMode` (`:455,:592,:696,:895`), `resolveExecutor` (`:576`),
`dashboard.model` (`:582`), `auto_approve_stages` (`:805`), `computeWorktreePlacement`'s
`git_conventions`/`worktree_root` (`:213`), and the whole `config:` object handed to
`buildPromptFor` (`:638` — carrying `stack`, `services`, `bobby_dir`, product dir and git
conventions into every agent prompt).

**Fix:** give the orchestrator the same live accessor the server got. `activeConfig()` already
exists and is the right shape — mirror it as `get config()` on `Orchestrator`
(`(this.projectContext && this.projectContext.config) || this._config`), rename the field to
`_config`, and let the existing `this.config` reads become that getter. Then convert
`/api/config` and `/api/workflows` to `activeConfig()`. **Watch the pinning interaction while you
do it:** a *running* workspace must keep resolving against the config of the project it was
launched on, exactly as `_ticketsDirFor` does for the board — so the per-run reads
(`resolvePermissionMode` at `:696`, `buildPromptFor` at `:638`, `resolveWorkflow` at `:1232`)
should read a config pinned on the record, not the live getter. Creation-time reads
(`_resolveTargetRepo`, `computeWorktreePlacement`, `resolveWorkflow` at `:199`) should read live.
Test it: boot alpha, switch beta, `POST /api/workspaces` for a beta ticket, assert
`workspace.repoRoot` is beta's repo; plus `/api/config.project === 'beta'` and `betaflow` in
`/api/workflows` after the switch.

---

**C1 (should-fix, a NEW failure mode from 8d469a2) — a failed switch leaves the context
inconsistent.** `_resolveTo` assigns `this._project = name` **before** calling `configForProject`,
which now reads `.bobbyrc.yml` off disk and therefore can throw (`YAML.parse` on a half-written or
malformed file; `readBaseConfig` also throws `Not a Bobby project` if it is gone). The old code
could not throw here — `readProjectConfig` (`lib/studio.js:126-129`) guards `existsSync`, and the
spread never touched the studio root file. Proven:

```
before switch : project=alpha  ticketsDir=alpha  prefix=AL
  (studio root .bobbyrc.yml made malformed while the server is up)
switchTo threw: Nested mappings are not allowed in compact mappings at line 1, column 9
after  switch : project=beta   ticketsDir=alpha  prefix=AL
>>> INCONSISTENT: projectName and the board it serves disagree
```

`switchTo` surfaces a 400 and the app looks fine, but `/api/config` now reports `activeProject:
beta` over alpha's board — the same contradiction class as B1/B3, reachable by editing your own
config while the app runs. Two-line fix: resolve into locals and commit all four fields at the end
of `_resolveTo`, or wrap the call and leave `_project` alone on failure.

**C2 (note) — `BOBBY_PROJECT` is inherited by every spawned agent.** `bin/bobby.js:112-113` turns
`--project` into `process.env.BOBBY_PROJECT`, and `cleanExecutorEnv` (`executor.js:40-48`) strips
only `CLAUDECODE`/`CLAUDE_CODE*`, so the child gets it. After `bobby app --project beta` +
a switch to alpha, an agent working an alpha run still has `BOBBY_PROJECT=beta`, so any bare
`bobby ticket move …` it runs (which is exactly what `lib/workflow.js:221,320,362` instructs)
resolves beta. I did not run an agent to confirm the end-to-end consequence — in a multi-repo
studio the worktree may not resolve as a Bobby project at all — so this is flagged, not counted
against the ACs. If you fix B3 by pinning a config per run, set `BOBBY_PROJECT` to that run's
project in the executor env at the same time.

**C3 (note) — still undocumented.** No CHANGELOG/README entry for studio switching, `/api/projects`,
`/api/projects/select`, or the `isStudio`/`activeProject` fields. Carried over from cycle 3; no AC
requires it.

### Decision Violations

**None.** Re-checked the entries the changed code touches rather than inheriting cycle 3's audit:
`decisions-log-has-one-writer` (the file was not touched by these commits),
`orchestrator-reads-tickets-from-the-workspaces-own-board` (unaffected by 8d469a2, and re-verified
adversarially — see AC3), `tickets-resolve-to-main-worktree`,
`prompts-name-the-tickets-dir-absolutely`, `worktree-per-workspace`,
`local-server-is-loopback-and-unauthenticated`, `paid-code-never-ships-in-the-mit-package` (API
surface only, no UI code).

**One decision has been made stale by this ticket and should be re-recorded (hygiene, not a
violation):** `concurrency-cap-refuses-per-server-process` says the cap is "per Orchestrator — one
per `bobby app`/`bobby dashboard` process serving one repo, **so per project per server process**".
With switching, one Orchestrator now spans projects and one cap covers all of them, so the "per
project" clause is false. Re-record with `--supersedes` — the same hygiene cycle 2 required for the
tickets-dir decisions.

### AC Verification

- [x] **AC1 — lists projects and switches between them: MET.** Verified live against the shipped
      command on a real studio (not a fixture server): `GET /api/config` → `isStudio: true`,
      `GET /api/projects` → `{projects:[alpha,beta], active:alpha}`, `POST /api/projects/select`
      moves `GET /api/tickets` from `["alpha work"]` to `["beta work"]`. **B1 is fixed and I
      re-proved it both ways:** `bobby app --project beta` on a studio whose `active-project` file
      says `alpha` serves beta's board, beta's stack and beta's workflows, and leaves the file
      saying `alpha`. The escape hatch R3 flagged also works now — on a studio with **no**
      `.bobby/active-project`, plain `bobby app` exits 1 with
      `Select a project: … or pass --project`, and `bobby app --project beta` then serves beta.
- [ ] **AC2 — switching re-scopes tickets, workspaces and the brief: FAILS on B3.** Tickets and the
      brief re-scope (`boardDir()`), and the **ticket prefix now re-scopes too** — verified live,
      `BE-002` on beta after booting alpha, landing on beta's board and not alpha's, with no leak
      of alpha's keys. But **workspaces do not fully re-scope**: a workspace created after a switch
      is cut from the previous project's repo, and `/api/config` + `/api/workflows` still answer for
      the boot project.
- [x] **AC3 — a running agent in A is not disturbed by switching to B: MET.** Re-verified
      independently, not inherited: in a throwaway worktree at HEAD I collapsed `_ticketsDirFor`/
      `_sessionsDirFor` to the live getters and ran the pin suite — **5 failed / 1 passed** (the
      survivor is the no-pin fallback, correct by design); restored — **6/6 green**.
- [ ] **AC4 — the selected project survives a reload: PARTIAL.** `setActiveProject` writes the file
      on every switch (verified on disk) and `/api/config.activeProject` reports it correctly, so a
      reload lands right. Marked partial only because the `project`/`stack` fields alongside it are
      the boot project's after a switch (B3), so a client reading the same response gets two
      different answers about where it is.

### Test/Lint Output
- Tests: **PASS** — 1269 passed, 46 skipped, 1315 total; 70 passed / 1 skipped of 71 suites, exit 0
  (`npm test`, 130s). Matches the builder's claim exactly.
- Lint: **PASS** — 0 errors, 37 warnings, all pre-existing `no-unused-vars` in test files.
- Adversarial (AC3 pin): **5 failed / 1 passed** un-pinned → **6 passed** restored.
- Config-equivalence harness (efbf2cd vs HEAD): **10/10 identical**, `ALL EQUIVALENT`.
- **B3 is invisible to the whole suite** — it is green with the bug present.

### Test Quality

The two new `project-context.test.js` cases are the right tests. The `_project`-precedence one
asserts the resolved project **and** the board path **and** that the persisted file was not
rewritten — it cannot pass on a context that merely accepted the value. The cascade one asserts
four things that each fail for a distinct reason (`ticket_prefix` = the cascade's own precedence
rule, `_project`, `area_only_alpha` **undefined** = the leak, `tickets_dir`), so it pins the
behaviour rather than the implementation. The new `--project` e2e describe starts the real command
with the real flag, which is the only thing that could have caught B1. The five harness fixes all
landed and are correct — the `'close'` listener genuinely un-deads the EADDRINUSE retry, the child
is killed on every rejection path (`fail()` at :111-114), test 4 now reads its own before-state,
and `BOBBY_NO_REGISTRY=1` + `BOBBY_PROJECT: ''` are in the spawn env.

**The author's red/green claim is overstated, and I checked it rather than taking it.** The ticket
says "reintroduce either half and 5 of the 18 go red, the other 13 stay green". Reverting each half
in a worktree at HEAD and running both files:

| reverted | red | which |
|---|---|---|
| B1 — constructor `_project` preference | **3** | both `--project` e2e tests + the precedence unit test |
| B2a — `activeConfig()` at the two createTicket sites | **1** | the post-switch prefix test |
| B2b — `configForProject` → the old spread | **2** | the post-switch prefix test + the no-leak test |

So it is 3 for one half and 2 for the other (their union is 5), not 5 for either. Every failure is
for the right reason and names the right thing; the coverage is real, the arithmetic in the
handoff is not. Also note `18` is the total number of tests in those two files, not 18 new
assertions.

Remaining gaps, all of them B3's blind spot: no test creates a **workspace** after a switch (which
is where the wrong-repo bug lives), no fixture in the suite gives the two projects **different
repos**, and no test asserts `/api/config.project` or `/api/workflows` **after** a switch — only
after a `--project` boot. Two of the three are one assertion each in the existing studio describe.

Minor, unchanged from cycle 3: `HOME` is still not overridden in the spawn env, so a developer
machine with Pro installed and licensed exercises a different server than CI
(`test/setup.js:4` notes studio tests override `HOME`); `path.resolve('bin/bobby.js')` (:25)
resolves against cwd; `output: () => out` (:120) and `startApp`'s `attempts` (:141) are still
unused; no per-test timeout override.

### Notes

- Everything cycle 3 asked for was done and done properly — the `lib/config.js` extraction in
  particular is the right shape, and sharing one `cascadeProject` between `readConfig` and
  `configForProject` is what stops the two drifting. B3 is not a defect in that work; it is the
  same seam not being carried the last two steps to the orchestrator.
- I still agree the **empty-studio boot refusal is out of scope**, and now with less hesitation
  than cycle 3: `studioBoardDir`/`resolveTicketsDir` were not touched by the refactor, the refusal
  belongs to the resolution layer every command shares, and the remedy its error message advertises
  (`--project`) is now verified working end to end.
- Everything on this branch outside TKT-022's files (lighthouse, chat, executor, worktree) belongs
  to other tickets on this integration branch and was not re-reviewed.
- Repro fixtures and the two review worktrees were removed; `git status` is clean and
  `git worktree list` shows only the main checkout.
