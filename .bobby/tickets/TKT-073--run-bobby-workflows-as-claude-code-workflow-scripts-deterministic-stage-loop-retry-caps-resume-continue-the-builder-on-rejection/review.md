## Review — TKT-073 (round 2)

### Verdict: Approved with Notes

Round 2 reviews the delta `7e49223..8a1d34c` (`b610456` fixes, `8a1d34c` move). Every round-1 finding is fixed and tested. Round 1 is kept below for history.

### Files Reviewed (delta)
- `templates/workflows/runtime.js:180-190`: the integration step now decides by the stage after the call.
  - The ticket stays in `TERMINAL` and the verdict is not `passed`: one call, then a log line and `stalled`.
  - The ticket moved: it takes the `afterResult` path that stage agents use.
  - I re-ran my round-1 probes. Case A (failed, ticket not moved): **1 call**, `stalled`, finalize skipped with a log (it was 16 calls and `iteration-cap`). Case B (verdict `rejected`, stage `building`): it took the retry path and called `bobby-build`.
  - Other moves (to `done`, or to a mid-workflow stage) go through the normal dispatch. Any repeat cycle is bounded by `maxRetries`.
- `test/lib/workflow-script.test.js`: two new harness tests. They assert behaviour, not helpers:
  - C1 makes exactly 1 call and C2 still completes.
  - Exactly 1 rebuild, with `rejections: 1`.
  - Both would fail against the round-1 runtime.
- `lib/workflow.js:592,615`: `buildPromptFor` takes an optional `continueBuilder`.
  - `continueBuilder ?? (target === 'claude-code')` parses as intended, because `===` binds tighter than `??`.
  - When nobody passes it, the behaviour is unchanged.
- `lib/dashboard/orchestrator.js:719-724`: `_promptContext` passes `continueBuilder: false` when the executor resolves to `cursor-agent`.
  - It reads `config` from `_configFor(ws)`, so it is run-scoped. That complies with `run-scoped-reads-pin-to-the-workspaces-project`.
  - `resolveExecutor` is already imported (line 68). An unknown explicit executor uses the claude buildArgs, so leaving the continuation on for it is consistent.
- `test/lib/dashboard/orchestrator-continue-builder.test.js`: asserts the consumer, which is the built prompt.
  - The cursor-agent-on-claude-code case would fail if the executor clause were reverted.
- `lib/config.js:316,348`: an empty `workflows: {}` now gets the commented hint. Covered in `test/lib/config.test.js`.
- `README.md:824,828`: the Claude-Code-only wording is added, and so is `claude --resume <session-id>`. `formatWorkflowInvocation` also names it, and a test asserts that.
- `.bobby/decisions.yaml`: the new entry `one-prompt-door-two-doors` has `supersedes: one-prompt-door`, and the old entry has `invalidated: "2026-10-25"`. See Decision check.

### Code Concerns
- None blocking.
- Note: the live e2e was not re-run after the fix. The changed branch exists only in feature/sprint mode, and the round-1 e2e used tickets mode, so the harness tests are the only evidence for it.
- Note: the round-1 observation still stands. A claude-code `workflow`/`sprint` prompt with the flag off differs from main by design (AC4). I re-ran the byte comparison:
  - The 36 direct prompt-builder cases are identical with `continueBuilder` off.
  - Of the 256 `buildPromptFor` cases, only claude-code/unset-target `workflow` differs.

### Decision Violations
- None.
- `decisions-log-has-one-writer` vs the hand-set `invalidated`: this is consistent with the tooling.
  - The new entry has CLI round-trip shape, and `addDecision` validates that the `supersedes` target exists.
  - The CLI has no invalidate verb. `bobby decision add --supersedes` prints "set that entry's invalidated date if it is now retired" (`commands/decision.js:37`), so the hand edit is the sanctioned step.
  - TKT-022 retired `orchestrator-reads-tickets-from-the-shared-board` and others the same way.
  - `bobby decision list` filters `!d.invalidated` (`commands/decision.js:54`). It now shows `one-prompt-door-two-doors` and hides `one-prompt-door`, and the YAML parses.

### AC Verification
- [x] AC1: unchanged from round 1. Met.
- [x] AC2: the integration branch now has a no-progress guard and is stage-driven. All caps are enforced in code, and two new tests cover it.
- [x] AC3: unchanged from round 1. Flag on, flag off, and the error paths are covered by tests.
- [x] AC4: SendMessage continuation. Target-gated, and now also executor-gated on the dashboard.
- [x] AC5: unchanged from round 1. Met.
- [x] AC6: the live run with kill and same-session resume is unchanged and still valid for tickets mode.

### Test/Lint Output
- Tests: `npm test`: 73 suites passed (1 skipped), **1317 passed**, 46 skipped, exit 0.
- Lint: `npm run lint`: 0 errors, 37 warnings (the same count as round 1), exit 0.

---

## Review — TKT-073 (round 1)

### Verdict: Rejected

One correctness bug in the new runtime: the integration-check branch has no no-progress guard, so it spins to the iteration cap. Everything else is solid. The fix is a few lines plus two harness tests.

### Files Reviewed
- `templates/workflows/runtime.js` — read in full. Traced every branch of `runTicket`, `afterResult`, the CAP catch and finalize. Probed edge cases with my own harness (same AsyncFunction wrapper as the tests).
- `lib/workflow-script.js` — generator, prune, staleness check, args, invocation text. Meta is `JSON.stringify` output, so it is a pure literal. Deterministic.
- `lib/workflow.js` — `resolveWorkflowName`, `nextStageName` export, `featureBranchName` extract, `continueBuilder` threading.
- `commands/run.js`, `commands/sprint.js` — orchestration gate and print path. Checked that `hint`, `pipeline`, `ticketPipeline`, `epicData`, `maxIterations`, `withSession` and `target` are in scope.
- `lib/config.js` — round-trip of `workflows`/`orchestration`, and the hint shown only when unset.
- `lib/targets/claude-code.js` and `commands/init.js` — `scaffoldExtras(rootDir, config)`. `extraPaths()` now feeds `lib/auto-sync.js:getBobbyPaths`, which is correct for generated files.
- `eslint.config.js`, `README.md`, tests (`workflow-script`, `run-orchestration`, `targets`, `workflow`), and test-evidence (journals, final-state, resume-prompt).

### Code Concerns

**MEDIUM: the integration check loops until the iteration cap when the agent returns `failed` but does not move the ticket** (`templates/workflows/runtime.js:172-189`).
In feature or sprint mode, `ir.verdict === 'failed'` with `ir.stage === TERMINAL` makes `afterResult` return null (that isn't a rejection), then `stage = ir.stage` (still `shipping`), then `continue`, and the integration agent runs again. Each pass is a full test-suite agent. Reproduced: one ticket, `maxIterations 16`, gives **16 integration calls**, status `iteration-cap`, and every later ticket becomes `not-started`. The stage-agent path has the guard this branch lacks (`r.stage === stage` returns `stalled`, line 214). The plan says that guard exists "so the loop cannot spin". It does not cover this branch.

**LOW (same block, same fix): the integration result is classified by verdict, not by stage** (`runtime.js:180-184`).
An integration agent that runs `bobby ticket move … reject` but returns verdict `rejected` (a value in the schema enum) instead of `failed` stops the ticket as `stalled` in `building`. A real rejection should take the retry path. Reproduced: 1 call, `stalled`, stage `building`. The rest of the runtime is stage-driven. This branch should be too.

Suggested fix (one shape):
```js
if (ir.stage === TERMINAL) {
  if (ir.verdict === 'passed') return finish('complete', TERMINAL, ir.reason);
  log(`${t.id}: integration returned "${ir.verdict}" but left the ticket in "${TERMINAL}", stopped`);
  return finish('stalled', TERMINAL, ir.reason);
}
// stage moved: a rejection (or other move): same path as a stage agent
const out = await afterResult(ir, stage); if (out) return out; stage = ir.stage; continue;
```
Add harness tests for both cases: `failed` + unmoved gives `stalled` after 1 call, and `rejected` + `building` gives a rebuild counted as a rejection.

**LOW: README prompt-path paragraph** (`README.md:828`). It says a rejection "sends the original builder a SendMessage". That holds only for the claude-code target. Cursor and Cline keep the fresh launch. Say so.

**LOW: `writeConfigCommented` with `workflows: {}`** (`lib/config.js:315` and `:347`). An empty object emits neither the block nor the commented hint. Cosmetic.

**INFO (verified, as the builder flagged):**
- **`iterations` counts cached calls on resume.** This is correct and required. The cap decision has to replay identically or the call sequence diverges from the cached prefix. The evidence report shows `iterations 2 of 20` after a resume.
- **A non-passed/failed integration result stops as `stalled`.** This is acceptable once the MEDIUM fix lands. Today it is also the path that hides the LOW case above.
- **The `orchestration` hint appears only when the key is unset.** Confirmed at `lib/config.js:357`. When set, the key is written with a two-line explanation at `:324-329`.
- **Resume caches only in the same session.** This is accurate. In `journal-attempt1-run2-new-session.jsonl` the build key `fdbd995e…` (the same key as run 1, so the prompts are deterministic) has a second `started` with a new agent id. In `journal-attempt2-same-session.jsonl` the build key has one `started` and one `result` across both runs. README and `formatWorkflowInvocation` both say "same session". Suggestion: name the mechanism (`claude --resume <session-id>`), because "this same Claude Code session" is ambiguous once the original process has died.
- **Workflow tool constraints hold.** I checked them against the Workflow authoring reference:
  - meta is a pure literal with `name`, `description`, `whenToUse` and `phases`. The phase titles match the `phase()` calls.
  - `agent()` opts used: `schema`, `agentType`, `label`, `phase`. All are documented.
  - Null returns are handled on every call.
  - The runtime has no `Date`, `Math.random`, `require`, `import`, `process` or `fs` (grepped).
  - The AsyncFunction compile in the tests proves it is plain JS.
  - The top-level `return` ran live in the e2e.
- **Flag off: are prompts byte-identical?** I compared main's `lib/` (extracted to scratch) with this branch:
  - **36/36** direct `buildOrchestrationPrompt`, `buildSprintPrompt` and `buildFeaturePrompt` cases (6 built-ins × services on/off) are byte-identical with `continueBuilder` off.
  - **256** `buildPromptFor` cases (every VALID_AGENT × 4 target values × with/without ids) give exactly **2 diffs**: `workflow` on `claude-code` and on unset target. That is the intended AC4 change, and `sprint run` on claude-code changes the same way. So "every existing prompt is byte-identical with the flag off" is true for Cursor, Cline and every non-workflow agent. It is not true for the claude-code workflow and sprint prompts, by design.
  - Side effect the plan missed: plan.md §2 says the dashboard "calls buildPromptFor, which is unchanged". Dashboard `workflow` runs (`orchestrator.js:422`) on claude-code now also get the SendMessage clause. Clause (b) bounds the risk if SendMessage is unavailable under `claude -p`, but no test or evidence covers it.

### Decision Violations
- None blocking.
- Tension with `one-prompt-door`: agent prompts are now also built in `templates/workflows/runtime.js` (`stagePrompt`, `debugPrompt`, `integrationPrompt`, `finalizePrompt`) and `formatWorkflowInvocation`. This is unavoidable, because scripts have no fs and can't call `buildPromptFor`. `buildSprintPrompt` in `sprint.js` is precedent. Recommend recording an amendment, e.g. "the saved-workflow runtime is the second, code-side prompt door", so future reviews don't flag it.
- `forward-stage-comes-from-the-workflow-not-the-agent-file` is honoured (`step.next` injected, with "use exactly").
- `prompts-name-the-tickets-dir-absolutely` is honoured (`readFirst` paths come from the resolved `ticketsDir`/`sprintsDir`; stage prompts use `bobby ticket view`).

### AC Verification
- [x] AC1: `writeWorkflowScripts` via `scaffoldExtras(rootDir, config)`. The tests cover refresh, pruning, user files kept, and round-trip of both keys (R1).
- [ ] AC2: Partly met. Schema, agentType per stage, retry cap, debug on the 2nd rejection and the iteration cap are all in code and tested. But the integration branch of the same loop can spin (MEDIUM above), so the caps are enforced only as a backstop there.
- [x] AC3: `run-orchestration.test.js` covers flag on (workflow, named, feature, sprint), flag off, and the four error paths. Existing suites are unmodified apart from imports.
- [x] AC4: `buildRetryDebugClause` and `buildSubagentSteps` with `continueBuilder`. Target-gated in `buildPromptFor` and `sprint.js`. Tested.
- [x] AC5: The cursor/cline scaffold test with the flag writes no `.claude/workflows`.
- [x] AC6: The live run is real. The kill and same-session resume show a cache hit in the journal. The cross-session miss is honestly recorded.

### Test/Lint Output
- Tests: `npm test`: 72 suites passed (1 skipped), **1311 passed**, 46 skipped, exit 0.
- Lint: `npm run lint`: 0 errors, 37 warnings, exit 0. The warnings in changed files (`DEFAULT_WORKFLOW` unused in run.js, `ticketsDir` args in workflow.js) predate this branch.

### Notes
- Harness probe script used: rebuild it from `test/lib/workflow-script.test.js` `runScript`. Case A: `{mode:'feature', tickets:[{id:'C1',stage:'shipping'}], maxIterations:16}`, with the integration agent returning `{stage:'shipping', verdict:'failed'}`.
- Local `main` is 3 ticket-only commits ahead of `origin/main`. There is no source drift.
