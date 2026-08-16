## Review — TKT-022 (re-review, cycle 5)

### Verdict: Rejected

B3, C1 and C2 are all genuinely fixed, and the `get config()` / `_configFor(ws)` split is the right
shape — I re-verified each rather than inheriting cycle 4's word. The getter conversion itself is
clean: **no external reader and no writer of `orchestrator.config` exists anywhere** in `lib/`,
`commands/`, `bin/` or `test/`, so the missing setter breaks nothing.

It is rejected on **two reads that were left LIVE and should have been pinned** — both in the same
family this ticket has now been rejected on four times, and both invisible to the full green suite:

> **D1** — `auto_approve_stages` is read from the project the user switched TO, so an alpha run's
> exit takes its auto-approve decision from beta's config. In one direction beta's config launches
> an agent alpha's config forbids; in the other alpha's configured automation silently stops.
>
> **D2** — `_pipelineFor`'s short-circuit returns the **boot-captured** `this.pipeline` for every
> workspace on the *default* workflow — which is nearly all of them — so `_configFor(ws)` there is
> almost dead code. A beta ticket advances through **alpha's** `default` workflow, and beta's own
> `security` stage is silently skipped.

Cycle 4 named `auto_approve_stages (:805)` in its own list of stale reads. Five reads on that list
were converted; this one was not.

---

### Files Reviewed

- **`lib/dashboard/orchestrator.js`** — the getter conversion, `_configFor`, `_activeProjectName`,
  the `project` pin, `_launch`'s env. Full audit below.
- **`lib/dashboard/project-context.js`** — `_resolveTo` now builds the config **before** assigning
  any state (C1). Correct: `configForProject` is the only call that can throw, and it is above all
  four assignments, so a throw leaves the context wholly on the old project. Covered by a real test
  that corrupts `.bobbyrc.yml` and asserts all of `projectName`, `ticketsDir`, `ticket_prefix` **and**
  that the failed switch was not persisted.
- **`lib/dashboard/server.js`** — `/api/config` (`project`/`stack`/`target`) and `/api/workflows`
  now read `activeConfig()`. Both correct; the self-contradiction cycle 3 and 4 rejected on is gone.
- **`lib/dashboard/state.js`** — `project` added to `newWorkspace`/`newRepoRun`. Correct.
- **`lib/dashboard/executor.js`** — env merge order verified for C2 (below).
- **`.bobby/decisions.yaml`** — decision hygiene verified; correct and honest.
- **`test/lib/dashboard/orchestrator-project-pin.test.js`, `orchestrator-pipeline.test.js`,
  `project-context.test.js`** — see Test Quality.

---

### Code Concerns

#### BLOCKER D1 — `auto_approve_stages` is read live on the exit path (AC3)

`orchestrator.js:866`, inside `_onExit`:

```js
const autoApproveStages = this.config?.dashboard?.auto_approve_stages || [];
```

`this.config` is now the **live** getter. `cascadeProject` (`lib/config.js:170`) deep-merges
`dashboard` per project, so `auto_approve_stages` is a per-project key. Every other decision in
`_onExit` was pinned — the stage re-read uses `_ticketsDirFor(ws)`, the session log uses
`_sessionsDirFor(ws)` — and then this one asks the project the user happens to be looking at whether
to launch another agent.

Proven both directions on a two-project studio (alpha and beta given **different**
`auto_approve_stages`), letting an alpha run exit after a switch to beta:

```
DIRECTION A  alpha: ['planning']   beta: []
             expected 2 launches (alpha's config), got 1   — alpha's automation silently stopped

DIRECTION B  alpha: []             beta: ['planning']
             expected 1 launch (alpha's config), got 2     — an agent launched that
                                                             alpha's config FORBIDS
```

Direction B is the serious one: `approve()` runs the next agent, spending tokens unattended on a
project whose config explicitly disables that. This is the failure the `approval-gate-before-next-agent`
decision exists to prevent, and it is reachable by doing the one thing switching is for.

**Fix — one line:**
```js
const autoApproveStages = this._configFor(ws)?.dashboard?.auto_approve_stages || [];
```
Verified: with that change both directions pass and the existing pin suite stays 9/9 green.

---

#### BLOCKER D2 — `_pipelineFor` short-circuits to the boot workflow for the default pipeline (AC2)

`orchestrator.js:1290-1293`:

```js
_pipelineFor(ws) {
  if (!ws || !ws.pipeline || ws.pipeline === this.pipelineName) return this.pipeline;   // <-- here
  try { return resolveWorkflow(this._configFor(ws), ws.pipeline); } catch { ... }
}
```

`this.pipeline` is captured **once in the constructor** from the boot project's config
(`commands/app.js:119-123` passes `resolveWorkflow(config, 'default')`). `createWorkspace` stores
`pipeline: pipelineName || this.pipelineName`, so every workspace created without an explicit
workflow gets `'default'` — which equals `this.pipelineName` and takes the short-circuit. The
`_configFor(ws)` line below it is only ever reached for an explicitly-named non-default pipeline.

`cascadeProject` deep-merges `workflows` per project, so two projects routinely have different
`default` workflows — this repo's own `bobbycode-default-workflow-ends-at-review` decision is exactly
such an override. Proven, alpha `default: [plan, build, review]`, beta `default: [plan, build, review, security]`:

```
beta's OWN default workflow  : planning -> building -> reviewing -> security
_pipelineFor(beta workspace) : planning -> building -> reviewing          # alpha's

--- beta ticket reaches beta's 'security' stage ---
next agent per BETA's own workflow : bobby-security
next agent per _resolveNextAgent   : null
workspace status after approve()   : ready_to_merge   <-- beta's security stage SKIPPED
```

So a project that configures a security stage does not get one, and the workspace is marked ready to
merge instead. `_pipelineFor` also feeds `_promptContext`'s `workflow`, so the agent prompt describes
the wrong project's pipeline too.

This one is easy to miss because it *looks* fixed — `_configFor(ws)` is right there in the method.
The `/api/workflows` + `createWorkspace` half of B3 genuinely works: a **named** workflow (`betaflow`)
is listed, accepted and resolved correctly. Only the default one is wrong.

**Fix:** the short-circuit must not assume the boot pipeline is this workspace's. Resolve from the
workspace's own config whenever it is pinned to a project — e.g. drop
`|| ws.pipeline === this.pipelineName` from the short-circuit and let the `resolveWorkflow` branch
handle the default name too (its `catch` already degrades to `this.pipeline`), keeping the
short-circuit only for `!ws || !ws.pipeline`.

---

#### N1 (note) — two user-facing messages name the wrong project's value

`_notePermissionDenial` (`:757`) and `_noOpReason` (`:956`) both call
`resolvePermissionMode(this.config, …)` — live — to tell the user which posture is configured, while
the posture the run *actually used* came from `_configFor(ws)` (`:638`). After a switch the message
names the other project's value and tells the user to raise a key that already has the value it
claims is too low. Message-only, no behavioural effect, but they are the last two live reads in
run-scoped code and are cheap to convert with D1.

#### N2 (note) — the plugin seam hands extensions the boot config and boot board

`server.js:966-968`:
```js
plugin.register({ orchestrator, store, sseHub, config, repoRoot, ticketsDir, ... })
```
`config` and `ticketsDir` are the values captured at boot; `orchestrator` beside them is live. This
line was **not touched by this ticket** — it was correct when one server meant one project, and
TKT-022 is what made it stale. It matters because the App UI itself ships as a plugin
(`@bobbycode/pro-dashboard`, per `paid-code-never-ships-in-the-mit-package`), so a plugin that reads
either value renders the boot project after a switch. I cannot see that package from here, so I am
not counting it against the ACs. Either pass `activeConfig()`/`boardDir()` (they are already defined
above this block) or document that extensions must read `orchestrator.config`/`orchestrator.ticketsDir`.

#### N3 (note) — the shared concurrency budget: acceptable as shipped

Ruling as asked: **acceptable, and the decision describes it honestly.**
`concurrency-cap-refuses-per-orchestrator` states both halves plainly — the budget is shared across
projects, and the *value* is read off the active project's config while runs from another project
are still counted against it. That is an unusual combination but a defensible one (same machine, same
subscription), and the code comment at `:1320-1330` matches the decision word for word.

The gap is presentation, not correctness: `_assertConcurrencyHeadroom`'s refusal lists ticket ids
(`AL-001 build`) with no project label, so a user on beta is refused by three ids that are not on
their board and cannot tell why. One word per entry would fix it. Worth a follow-up ticket; not a
blocker and not in this ticket's ACs.

#### N4 (note) — empty-studio boot refusal: still out of scope

Agreed, third time. `studioBoardDir`/`resolveTicketsDir` belong to the resolution layer every command
shares, nothing in this ticket touched them, and the `--project` remedy the error message advertises
is verified working.

---

### The getter conversion — full audit (asked for explicitly)

**Readers/writers of `orchestrator.config` outside the class: none.** Grepped `lib/`, `commands/`,
`bin/`, `test/` for `orchestrator.config` / `orch*.config` → zero hits, and for any `.config =`
assignment → zero hits. Nothing assigns it, so the absent setter throws nowhere. The only
construction sites are `commands/app.js:119` and `commands/remote.js:75`, both passing
`readConfig(root)`.

**Every remaining `this.config` / constructor-captured value, ruled:**

| site | read | correct? |
|---|---|---|
| `:240` `resolveWorkflow(this.config, pipelineName)` in `createWorkspace` | live | ✅ creation-time |
| `:254` `computeWorktreePlacement(…, this.config, …)` | live | ✅ creation-time (only caller is `:252`) |
| `:308-339` `_resolveTargetRepo` (`repo_group`, `project_repos`) | live | ✅ creation-time — **only reachable from `createWorkspace:245`**; no path reaches it for an existing workspace, so there is no unpinned case |
| `:500,:621,:638,:697,:1293` via `_configFor(ws)` | pinned | ✅ |
| `:757` `_notePermissionDenial` | live | ⚠️ N1, message-only |
| `:866` `auto_approve_stages` | live | ❌ **D1 — behavioural** |
| `:956` `_noOpReason` | live | ⚠️ N1, message-only |
| `:1332` `_maxConcurrent` | live | ✅ deliberate, decision-recorded (N3) |
| `this.pipeline` (constructor) | boot | ❌ **D2 — behavioural** |
| `this.repoRoot`, `this.lockFile` (constructor) | boot | ✅ both name the **studio root**, which is shared across projects — the main-checkout lock protects that directory whichever project you are in. Worktree runs pin `ws.repoRoot`/`ws.lockFile` from `_resolveTargetRepo`. *Theoretical only:* a project overriding `bobby_dir` would move `mainCheckoutLockPath`, giving two projects different locks on one checkout — not reachable by default, note only. |

### BOBBY_PROJECT into the agent (C2) — verified

- **Order is right.** `executor.js:334-338` builds `cleanExecutorEnv({ ...process.env, BOBBY_SESSION_ID, ...env })` — the caller's `env` is spread **last**, so `BOBBY_PROJECT` wins over an inherited one.
- **`cleanExecutorEnv` does not strip it** (`:40-48` removes only `CLAUDECODE` and `/^CLAUDE_CODE/`).
- **Correct for all three run kinds:** worktree runs and chat turns both reach `_launch` with a record from `createWorkspace` (pins `project`); repo runs come from `createRepoRun`, which pins it too (`:363`).
- **Cannot break a non-studio run.** `env: ws.project ? { BOBBY_PROJECT: ws.project } : {}` sets *nothing* when `ws.project` is null, so a parent-exported `BOBBY_PROJECT` is inherited exactly as it was before this commit — unchanged behaviour, not a new hazard. Same for pre-pin legacy records, consistent with the `_ticketsDirFor` fallback.

### Decision Violations

**None.** Re-checked against the changed code, not inherited. Hygiene on the two swaps is correct:
`a-run-is-pinned-to-the-board-it-started-on` and `concurrency-cap-refuses-per-server-process` are both
marked invalidated with a date, the replacements carry `supersedes`, and
`concurrency-cap-refuses-per-orchestrator` states the shared-budget consequence rather than hiding it.

Note for the fix: **D2 is arguably already covered** by
`orchestrator-reads-tickets-from-the-workspaces-own-board`'s principle ("the workspace's board vs the
moment's board") extended to config — no new decision needed, but if you record one, record it about
*run-scoped reads* generally rather than about workflows specifically.

### AC Verification

- [x] **AC1 — lists projects and switches: MET.** `commands/app.js:117-123` constructs `ProjectContext`
      and passes it to the Orchestrator (the cycle-2 fix, still in place; `bin/bobby.js` registers
      `registerApp` and `commands/app.js` carries `.alias('dashboard')`). B1's fix re-verified by
      reading: the constructor takes `this._studioConfig._project` first (`project-context.js:44-46`),
      with file/first-project only as fallback. Covered by e2e tests that spawn the real command.
- [ ] **AC2 — switching re-scopes tickets, workspaces and the brief: FAILS on D2.** Tickets, brief,
      prefix, target repo, `/api/config` and `/api/workflows` all re-scope correctly now — B3 is
      genuinely fixed and the wrong-repo bug is gone (verified: the pin suite's two-repo test asserts
      the worktree's actual `MARKER.txt`, not a path string). But a workspace on the **default**
      workflow still advances through the boot project's pipeline.
- [ ] **AC3 — a running agent in A is not disturbed by switching to B: FAILS on D1.** The board pin,
      the session pin and `BOBBY_PROJECT` are all correct and verified. The auto-approve decision is
      not: switching to B changes whether A's run launches its next agent.
- [x] **AC4 — the selected project survives a reload: MET.** `setActiveProject` on every switch,
      `/api/config.activeProject` reports it, and `project`/`stack`/`target` beside it now agree
      (the cycle-4 "partial" is resolved).

### Test/Lint Output

- Tests: **PASS** — 1273 passed, 46 skipped, 1319 total; 70 passed / 1 skipped of 71 suites, exit 0
  (`npm test`, 113s). Matches the builder's claim exactly.
- Lint: **PASS** — 0 errors, 37 warnings, all pre-existing `no-unused-vars` in test files.
- **Both blockers are invisible to the whole suite** — it is green with D1 and D2 present.
- Adversarial (config pin): reverting `_configFor` to `this.config` → **exactly 1 test fails**,
  `a run reads its own project's config, while the UI reads the new one`. The author's claim
  ("fails exactly its own test and no others") is **accurate** — and that is the problem, see below.

### Test Quality

**The new tests are well-built.** The pin suite lets an alpha run genuinely EXIT while the UI sits on
beta, uses real boards, a real `ProjectContext`, a real store and the real `_onExit`, and fakes only
the CLI — which then does what a real agent does. The two-repo test asserts the worktree's actual
file contents rather than a path string. The C1 test asserts four independent things and that the
failed switch was not persisted. The `BOBBY_PROJECT` test captures the real spawn options.

**Both fixture edits are legitimate — I judged them independently:**

- `orchestrator-pipeline.test.js` (`config` → `_config`) is not merely legitimate, it is **required**:
  `config` is now an accessor with no setter, so `Object.assign(Object.create(Orchestrator.prototype),
  { config })` throws in strict mode (ESM). Seeding `_config` is exactly what the real constructor
  does (`:96`), so the fake models the object correctly.
- `wire()`/`makeStudio()` writing project settings to disk is also correct — in a studio the config
  genuinely comes from disk via `configForProject`, so a constructor-passed setting *should* be
  ignored. And that behaviour change is safe for real callers: both production sites pass
  `readConfig(root)`, which cycle 4 proved deep-equals `configForProject(root, activeProject)`.

**But the second edit created the blind spot that hid D1.** `makeStudio` writes `studioConfig` to the
**studio root** `.bobbyrc.yml`, which both projects inherit — so alpha and beta end up with *identical*
`dashboard.*`. No test in that file can distinguish a live read from a pinned one for any `dashboard`
key. The suite's own auto-approve test (`:200-217`) sets `auto_approve_stages: ['planning']` at the
root and passes whether the read is live or pinned; it stays green with D1 present. It is a genuine
test of the *board* pin, which is what it was written for — it just cannot see the config bug beside it.

**The deeper gap: `_configFor` has no consumer-level test at all.** Reverting the pin fails one test,
and that test asserts `o._configFor(ws).ticket_prefix` — the helper's own return value. Not one of its
five consumers (permission posture, executor, model, `_pipelineFor`, `_promptContext`) has a test that
would notice the pin disappearing. That is precisely why D1 and D2 survived: they are the two
run-scoped reads that were *not* routed through the helper, and nothing tests the behaviour either way.

**On the structural fix — yes, and it should block, in the narrow form.** The author is right that a
hand-wired fixture diverging from `createWorkspace` has now happened three times in this ticket.
But a full shared factory is a bigger refactor than this ticket should carry. What *should* land with
the fix is smaller and directly targeted:

1. Give `makeStudio` a per-project settings argument, so alpha and beta can differ in a `dashboard`
   key. Without it no regression test for D1 can be written at all.
2. Two behavioural tests: an alpha run exiting after a switch with the two projects disagreeing on
   `auto_approve_stages` (assert the launch count from **alpha's** config), and a beta workspace on
   the **default** workflow resolving beta's pipeline (assert the next agent, or that
   `approve()` does not jump to `ready_to_merge`).
3. Have `seed()` delegate to the real `createWorkspace` where the test does not specifically need a
   legacy/unpinned record — that is the divergence that bit the author twice.

Carried over from cycle 4, still true and still non-blocking: `HOME` is not overridden in the e2e
spawn env; `path.resolve('bin/bobby.js')` resolves against cwd; `output: () => out` and `attempts`
are unused.

### Notes

- Everything cycle 4 asked for was done, and the `get config()` / `_configFor(ws)` split is the right
  seam — the same live/pinned distinction the board already uses, applied to the config. D1 and D2 are
  not defects in that design; they are two reads the conversion did not reach, one of which cycle 4
  had already named.
- The pattern worth stating for whoever picks this up: **converting a field to a live getter is only
  half a fix — the other half is auditing every read of it, plus every value captured from it in the
  constructor.** `this.pipeline` (D2) is not a `this.config` read at all, which is why grepping for
  `this.config` did not surface it.
- Both blockers are one-to-three-line fixes. The test work is the larger part.
- Everything on this branch outside TKT-022's files (lighthouse, chat, executor, worktree) belongs to
  other tickets on this integration branch and was not re-reviewed.
- All repro/probe files removed; `git status` is clean and `lib/dashboard/orchestrator.js` is byte-identical to HEAD.
