## Review — TKT-022 (re-review, cycle 6)

### Verdict: Approved with Notes

D1 and D2 — the two run-scoped reads cycle 5 rejected on — are genuinely fixed, and I
adversarially verified each rather than inheriting the builder's claim: **reverting D1 fails
exactly its own test and no other; reverting D2 fails exactly its own test and no other**
(evidence below). B3, C1, C2, AC1/AC4, the getter conversion and decision hygiene were
re-verified from source, not carried over. Full suite green, lint clean.

The remaining items (N1–N5) are notes, not blockers — one is a defensible-but-improvable error
fallback, one a stale test comment, three carried forward from cycle 5. None fails an AC.

---

### Files Reviewed

- **`lib/dashboard/orchestrator.js`** — the D1/D2 fix (commit `8efd1cb`), plus a full re-audit of
  every constructor-captured field derived from config, and every caller of `_pipelineFor` /
  `this.pipeline`. Restored byte-identical to HEAD after the adversarial reverts (`git diff` empty).
- **`lib/dashboard/project-context.js`** — `_resolveTo` (C1) re-read: config resolved **before** any
  of the four fields is assigned; `switchTo` persists (`setActiveProject`) only after `_resolveTo`
  returns, so a throw leaves the context wholly on the old project and unpersisted.
- **`lib/dashboard/executor.js`** — C2 env merge order re-verified.
- **`lib/dashboard/server.js`** — core App UI routes (`/api/config`, `/api/tickets`,
  `/api/workflows`, `/api/projects`) all read `activeConfig()`/`boardDir()` (live); the plugin
  `register` payload (`:966`) hands boot `config`/`ticketsDir` beside a live `orchestrator`.
- **`lib/workflow.js`** — `resolveWorkflow(config, 'default')` verified un-throwable (the D2 catch).
- **`test/lib/dashboard/orchestrator-project-pin.test.js`** — the new `createWorkspace`-based
  fixture and the two new behavioural tests.

---

### Code Concerns

#### D1 — auto_approve_stages on the exit path: FIXED and verified

`orchestrator.js:870` now reads `this._configFor(ws)?.dashboard?.auto_approve_stages`. `_configFor`
resolves the run's pinned project (`ws.project`), so the exit's auto-approve decision follows the
run's own project, not the UI's.

Adversarial: reverting line 870 to `this.config` →

```
✕ auto-approve after a switch follows the RUN's project, not the UI's
10 passed, 1 failed   (only the D1 test)
```

The sibling test `auto-approve … against the run's own board` stays green on the revert — correct,
because it sets `auto_approve_stages` at the shared studio root (both projects identical), so it
tests the BOARD pin, not the config pin. The new D1 test is the only one that can see the config bug,
and it does.

#### D2 — `_pipelineFor` short-circuit: FIXED and verified

`orchestrator.js:1306-1314` no longer special-cases `ws.pipeline === this.pipelineName`. It resolves
`resolveWorkflow(this._configFor(ws), (ws && ws.pipeline) || this.pipelineName)`, so a workspace on
the `default` pipeline resolves **its own project's** `default`, not the boot project's.

- The catch is safe: `resolveWorkflow(config, 'default')` cannot throw — `lib/workflow.js:101` guards
  only *non-default* names; a missing or malformed `default` degrades to `DEFAULT_WORKFLOW` (`:99`,`:104`).
- **No raw `this.pipeline` read survives** — grep shows only the constructor assignment (`:107`) and a
  doc comment (`:1298`). Both `_pipelineFor` callers (`_promptContext:703`, `_resolveNextAgent:1398`)
  are run-scoped and want the per-project answer; the fix does not hand the server default to anything
  that needed it, nor the per-project answer to anything that needed the default.
- Null / contextless `ws`: `name = this.pipelineName`, `config = _configFor(null) = this.config` (boot
  off-studio), so it returns the boot default — same as the old `this.pipeline`. Off-studio inert.

Adversarial: restoring the short-circuit →

```
✕ a run advances through its OWN project's workflow after a switch
10 passed, 1 failed   (only the D2 test)
```

#### Constructor-captured derivatives of config — full re-audit (the cycle's core question)

| constructor field | initialiser | per-project? | run-scoped read after a switch | verdict |
|---|---|---|---|---|
| `this.pipeline` | `resolveWorkflow(bootConfig,'default')` | yes (`workflows` cascades) | only via `_pipelineFor` now | **fixed (D2)** |
| `this.pipelineName` | `'default'` (a NAME) | no — resolution is per-project, the name is not | stored on the record, re-resolved by `_pipelineFor` | ✅ |
| `this.lockFile` | `mainCheckoutLockPath(repoRoot, config)` | only via `bobby_dir` | repo runs use it; merges use `ws.lockFile || this.lockFile` | ✅ (see N5) |
| `this.repoRoot` | passed in (studio root) | no — shared container | merges pin `ws.repoRoot`; worktree runs pin `ws.repoRoot`; repo runs use studio root **by design** | ✅ |
| `this.agentsPath` | `.claude/agents` | no — agents live at the studio | prompt building | ✅ |
| `this._config` | boot config | — | fallback only | ✅ |

On the specific question asked — **can a repo run started after a switch get the wrong `lockFile`?**
No. A repo run does **not** call `_resolveTargetRepo`; it always targets `this.repoRoot` (the studio
root) and `this.lockFile` (that directory's lock), regardless of the active project. That is
project-agnostic by construction (TKT-069: repo runs have no target-repo resolution), so a switch
cannot make it *wrong* — it is the same answer switch-or-no-switch, and it locks exactly the directory
a repo run edits (`worktreePath: this.repoRoot`, `:455`). Worktree runs and merges, which DO vary by
project, both pin `ws.repoRoot`/`ws.lockFile` from `_resolveTargetRepo` at creation. No new
inconsistency is introduced.

#### N1 (note) — `_configFor`'s error fallback returns the LIVE config

`_configFor` (`:158-170`) catches a throw from `configForProject(root, ws.project)` and returns
`this.config` (**live**, post-switch). The more defensible run-scoped fallback is `this._config`
(**boot** — immutable, and in the common boot==run-project case exactly right); the live value
reintroduces the precise live/pinned coupling this ticket exists to remove.

Why it is a note and not a blocker: an ordinary switch **never reaches the catch** — when the run's
project still exists, line 163 `configForProject(root, 'alpha')` succeeds and returns alpha's config
correctly. The catch fires only if the run's own project is renamed/removed/corrupted *mid-run*, an
orthogonal failure to "switching to B disturbs A." So AC3 for the switch itself is fully met. For the
auto-approve read specifically, the safest fallback would actually be `[]` (treat an unreadable run
config as *no* auto-approve) rather than any other project's config.

#### N2 (note) — the new test's header comment is now stale

`orchestrator-project-pin.test.js:16-18` says "The worktrees are plain directories: git ops fail soft
(checkpointError) and `headSha` returns null." That was true of the old hand-built fixture. `seed()`
now goes through the real `createWorkspace`, which cuts **real** git worktrees from the studio-root
repo, so `commitCheckpoint`/`headSha` actually execute. Immaterial to every assertion — each exit test
advances the stage, and `_producedNothing` short-circuits on `stageAdvanced` (`:944`) before it ever
reads `headSha` — but the comment misdescribes the mechanism it documents.

#### N3 (note, carried from R5) — two user-facing messages still read live config

`_notePermissionDenial` (`:757`) and `_noOpReason` (`:960`) build their text from
`resolvePermissionMode(this.config, …)` while the posture the run *used* came from `_configFor(ws)`.
After a switch they name the other project's value. Message-only.

#### N4 (note, carried) — plugin seam / TKT-071

`plugin.register` (`:966`) hands extensions boot `config`/`ticketsDir` beside a live `orchestrator`.
Correctly filed as **TKT-071**, and genuinely separable from this ticket's ACs (see AC2 below).

#### N5 (note, theoretical) — `bobby_dir` override would move the lock path

If a project overrode `bobby_dir`, two projects would compute different `mainCheckoutLockPath` for the
one physical studio checkout, defeating the mutual exclusion. Not default-reachable; note only.

---

### Decision Violations

**None.** Re-checked the changed code against `bobby decision list`. Hygiene on the two prior TKT-022
swaps is correct (`orchestrator-reads-tickets-from-the-workspaces-own-board` and
`concurrency-cap-refuses-per-orchestrator`, both carrying `supersedes`).

**New decision recorded:** `run-scoped-reads-pin-to-the-workspaces-project` — codifies that every
post-launch read (board AND config, including constructor-captured derivatives like `this.pipeline`)
resolves against the workspace's pinned project via `_ticketsDirFor`/`_configFor`, never the live
getter. This class of defect recurred across all six review rounds; the decision turns "is this read
run-scoped?" into the standing review question.

---

### AC Verification

- [x] **AC1 — lists projects and switches: MET.** `commands/app.js` constructs `ProjectContext` and
      passes it to the Orchestrator; `/api/projects` + `/api/projects/select` are live. Covered by the
      e2e suite that spawns the real command.
- [x] **AC2 — switching re-scopes tickets, workspaces and the brief: MET.** Tickets, brief, prefix,
      target repo, `/api/config` and `/api/workflows` re-scope (B3 fixed — the two-repo test asserts
      the worktree's real `MARKER.txt`), and now the **workflow** a default-pipeline workspace advances
      through comes from its own project (D2). The plugin-seam staleness (N4/TKT-071) touches only
      plugin-registered `/api/pro/*` routes; the App UI's own board/config/workflows come from core
      **live** routes, so the shipped UI shows the correct project after a switch. Not an AC gap.
- [x] **AC3 — a running agent in A is not disturbed by switching to B: MET.** Board pin, session pin,
      `BOBBY_PROJECT`, permission/executor/model, and now `auto_approve_stages` (D1) all resolve
      against the run's pinned project. Verified by the exit-after-switch tests.
- [x] **AC4 — the selected project survives a reload: MET.** `setActiveProject` on every switch;
      `/api/config.activeProject` reports it and `project`/`stack`/`target` agree.

---

### Test/Lint Output

- Tests: **PASS** — 1275 passed, 46 skipped, 1321 total; 70 passed / 1 skipped of 71 suites, exit 0
  (`npm test`, 112s). Matches the builder's claim.
- Lint: **PASS** — 0 errors, 37 warnings (all pre-existing `no-unused-vars` in test files).
- Pin suite: 11/11 green.
- **Adversarial, re-run this cycle:** revert D1 → 1 failure, the D1 test only. Revert D2 → 1 failure,
  the D2 test only. The builder's "reverting either fix fails exactly its own test" is accurate.

### Test Quality

The new fixture is a real improvement: `makeStudio` takes per-project config and deep-merges
`dashboard`, so alpha/beta can hold *different* settings — the distinction the single-root fixture
could not express, which is what hid D1. `seed()` delegates to the real `createWorkspace` against a
git-backed studio, closing the hand-wired-record divergence that bit the author three times. The two
new tests assert **consumer behaviour** (which agent launches; whether `approve()` reaches
`ready_to_merge`), not a helper's return value — which is exactly the gap cycle 5 identified.

Leak check: real worktrees are cut under `tmp/studio/wt`; `afterEach` does
`fs.rmSync(tmp, { recursive: true, force: true })`, so an assertion throwing mid-test cannot orphan a
worktree or temp dir outside `tmp`. Good.

Only nit: the stale header comment (N2).

### Notes

- Everything cycle 5 asked for landed, and the adversarial reverts confirm the fixes are load-bearing
  and precisely scoped.
- The pattern for whoever maintains this: after forcing a field to a live getter, audit (a) every read
  of it, classified live-vs-pinned by *when* it runs, and (b) every constructor field *derived* from
  it — `this.pipeline` carried no `this.config` reference, which is why the grep missed it. Now
  captured in `learnings.local.md` and the new decision.
- Off-branch files (lighthouse, chat, executor, worktree) belong to other tickets on this integration
  branch and were not re-reviewed.
- `git status` clean; `lib/dashboard/orchestrator.js` byte-identical to HEAD after the reverts.
