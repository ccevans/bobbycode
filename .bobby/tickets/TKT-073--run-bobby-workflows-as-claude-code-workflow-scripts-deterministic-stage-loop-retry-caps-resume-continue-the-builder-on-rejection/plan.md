# TKT-073 Plan: Bobby workflows as Claude Code Workflow scripts, and continuing the builder on rejection

**Size:** L (Complex). It cuts across the target, init, run, sprint and config, and adds a generated-code runtime.
**Recommended workflow:** `default` (this repo: plan → build → review). It is not security-sensitive. Review earns its place because the generated runtime is new code that every saved workflow runs.
**Before you build:** this checkout has no `node_modules`. Run `npm install` first. Cite line numbers from origin/main `6e5a76f`. Every line number below was read there.

---

## 1. Approaches considered

All three meet the ACs. They differ only in where the stage loop (the FSM) lives.

| | A. Generator + one shared runtime file (selected) | B. Thin per-name wrapper nesting `workflow('bobby-core', args)` | C. Full EJS template per workflow |
|---|---|---|---|
| How | `lib/workflow-script.js` writes `.claude/workflows/bobby-<name>.js` = pure-literal `meta` + baked `STEPS` constants + the text of `templates/workflows/runtime.js` (plain JS, read with fs) | Each `bobby-<name>.js` passes its steps to one shared `bobby-core.js` | Logic and steps are interleaved in `.js.ejs` |
| Effort (x3) | 3 | 3 | 3 |
| Risk (x2) | 4: one runtime, unit-tested once against the generated source of every built-in | 2: nesting works one level only, so a user can never wrap a bobby workflow. Resume through a nested child is unproven | 3: the logic can only be tested through rendered output, and EJS tags inside JS are easy to break |
| Maintainability (x2) | 5: the runtime is readable JS in one file | 4 | 2 |
| Impact (x1) | 5 | 4: `/workflows` shows a "▸ bobby-core" group, not the named workflow | 5 |
| **Score** | **32** | **25** | **24** |

**Selected: A.** It wins by 7 points, so no escalation.

### Sub-decisions inside A, picked and recorded

1. **The stage snapshot travels in args, and every stage agent checks the stage itself.** Scripts have no fs access, so the script cannot read `ticket.md`. The CLI already reads each ticket when it prints the invocation, so `args.tickets[]` carries `{id, stage, blocked, blockedReason}`. Each stage agent's first instruction is `bobby ticket view <id>`. If the stage is not the one the agent expects, it returns `verdict: "mismatch"` with the real stage, and the script dispatches from that stage. This costs no extra agents. The rejected alternative was a preflight agent per ticket, which costs about 36k of harness tokens per ticket for a read.
2. **Tickets run in a sequential `for … of await` loop, not `pipeline()`.** This departs from the ticket's "per-ticket pipeline()" wording. All three entry points work tickets one at a time on one branch: today's prompts say "Process each ticket sequentially". `pipeline()` has no concurrency option and would run several tickets' build agents at once in one checkout. Worktree-per-ticket would make parallel runs safe, but it is out of scope (cross-session and isolation work). This is open question 1.
3. **Feature and sprint keep today's extra checks, in code.** After each ticket reaches `shipping`, an integration agent runs the suite and rejects on failure, which counts as a retry. A finalize agent runs only when every ticket ended `complete` or `done`. Today the model decides "if everything passes". Now code decides.
4. **No fallbacks.** These cases fail with an explicit error that names the fix:
   - an unknown `orchestration` value
   - `orchestration: workflow` on a non-claude target
   - a missing or stale script when running
   - an invalid workflow name for a filename
   - bad `args` inside the script

   `orchestration` unset means `prompt`. That is the ticket's mandated default, not a substitute.

---

## 2. Files to modify

| File | Change |
|---|---|
| `lib/workflow-script.js` | **NEW.** `resolveOrchestration`, `buildWorkflowScript`, `writeWorkflowScripts`, `assertWorkflowScriptCurrent`, `buildWorkflowArgs`, `formatWorkflowInvocation` |
| `templates/workflows/runtime.js` | **NEW.** The shared FSM body, as plain JS. `templates/**` is already eslint-ignored and already in package `files` |
| `lib/targets/claude-code.js` | `scaffoldExtras(rootDir, config = {})` calls `writeWorkflowScripts`. `extraPaths()` returns `['.claude/workflows']` |
| `commands/init.js` | Line 226: `target.scaffoldExtras(rootDir)` becomes `target.scaffoldExtras(rootDir, config)` |
| `lib/config.js` | `writeConfigCommented` (lines 202–433) emits `orchestration:` when set and a `workflows:` block when set, plus a commented hint. **Required:** see Risk R1 |
| `lib/workflow.js` | Export `resolveWorkflowName(name, ticketPipeline)`, used by `resolveWorkflow` at line 94. Export `nextStageName` (line 142). Extract and export `featureBranchName(epicId, title, gitConventions)` from lines 695–697. Add the `continueBuilder` option to `buildSubagentSteps` (203), `buildRetryDebugClause` (242), `buildOrchestrationPrompt` (246) and `buildSprintPrompt` (838). `buildPromptFor` (589–600) passes `continueBuilder` |
| `commands/run.js` | Orchestration gate before `buildPromptFor` (line 150), for `agent === 'workflow' \|\| agent === 'feature'` |
| `commands/sprint.js` | The same gate in `sprint run` (lines 241–275). Pass `continueBuilder` to `buildSprintPrompt` |
| `eslint.config.js` | Add `'.claude/workflows/**'` to `ignores`. The generated files use top-level `return` and the hook globals |
| `README.md` | "Run Modes" (about line 769): a short "Run as a Claude Code Workflow" subsection |
| `test/lib/workflow-script.test.js` | **NEW.** Generator, scaffold, runtime harness |
| `test/lib/workflow.test.js` | `continueBuilder` prompt tests |
| `test/lib/targets.test.js` | No scripts for cursor or cline. The claude-code `scaffoldExtras` no-op test still passes |
| `test/commands/run-orchestration.test.js` | **NEW.** CLI via `execSync(node bin/bobby.js …)` in a mkdtemp project, the same pattern as `test/commands/sprint.test.js:11` |

Not touched, on purpose:
- **`buildFeaturePrompt` rejection text.** Its Phase 2 runs agents **inline**: "d) Follow the instructions in agents/x.md", line 713. There is no builder subagent to continue, and the orchestrator already has its own context.
- **`buildBatchStagePrompt`.** It has no rejection loop.
- **The dashboard.** It calls `buildPromptFor`, which is unchanged, and the ticket puts it out of scope.
- **Cursor and Cline adapters.**

---

## 3. Step-by-step plan

### Step 1. Orchestration config: `lib/workflow-script.js`, part 1

- [ ] `export const ORCHESTRATION_MODES = ['prompt', 'workflow'];`
- [ ] `export function resolveOrchestration(config = {})`:
  - unset (`undefined`/`null`) returns `'prompt'`
  - a value not in `ORCHESTRATION_MODES` throws `Unknown orchestration '<v>' in .bobbyrc.yml. Valid: prompt, workflow`
  - `'workflow'` with `(config.target || 'claude-code') !== 'claude-code'` throws `orchestration: workflow needs target claude-code (target: <t>). Claude Code's Workflow tool runs the scripts; other targets keep the prompt.`
- [ ] `lib/config.js` `writeConfigCommented`:
  - when `config.orchestration` is set, emit a commented explanation followed by `orchestration: <value>`
  - when `config.workflows` (or legacy `pipelines`) is set, emit it the way `services` is emitted at lines 306–310 (`YAML.stringify({ workflows: … })`)
  - keep the existing commented `# workflows:` hint only when it is unset (line 329)
  - always emit this commented hint block, in the optional section near `parallel_isolation`:
    ```
    # How `bobby run workflow|feature|<name>` and `bobby sprint run` orchestrate (claude-code only)
    #   prompt   — print the prose orchestration prompt (default)
    #   workflow — print a saved Claude Code Workflow call; scripts in .claude/workflows/
    # orchestration: workflow
    ```

### Step 2. Workflow-name helpers: `lib/workflow.js`

- [ ] `export function resolveWorkflowName(name = 'default', ticketPipeline = null)` returns `(name !== 'default') ? name : (ticketPipeline || 'default')`. `resolveWorkflow` uses it at line 94, with no behaviour change.
- [ ] Export `nextStageName`, with its body unchanged.
- [ ] `export function featureBranchName(epicId, epicTitle, gitConventions = {})` returns exactly what lines 695–697 compute. `buildFeaturePrompt` calls it. The output string is unchanged.

### Step 3. Shared runtime: `templates/workflows/runtime.js`

Plain JS. No TypeScript. No `Date.now`, `Math.random` or `new Date(`. No `pipeline`/`parallel`. It relies on these constants, which the generator emits above it: `WORKFLOW_NAME`, `STEPS`, `EXEC_STEPS`, `PLAN_STEP`, `TERMINAL`. It ends with a top-level `return report`.

**Contract:**

```js
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    ticket:  { type: 'string' },
    stage:   { type: 'string', description: 'The Stage: line `bobby ticket view <id>` prints after your work' },
    verdict: { type: 'string', enum: ['advanced', 'rejected', 'blocked', 'mismatch', 'incomplete', 'passed', 'failed'] },
    reason:  { type: 'string', description: 'One line' },
  },
  required: ['ticket', 'stage', 'verdict', 'reason'],
};
```

**Args validation.** Throw `Error('<WORKFLOW_NAME>: <what> — run the invocation `bobby run …` printed')` unless all of these hold:
- `args` is an object
- `args.mode` is in `['tickets','feature','sprint']`
- `args.tickets` is a non-empty array of `{id: string, stage: string}`
- `args.maxRetries` is an integer ≥ 0
- `args.maxIterations` is an integer ≥ 1
- `readFirst` and `planReadFirst` are arrays of strings
- in feature or sprint mode, `args.finalize` is `{kind: 'epic'|'sprint', id}`

**FSM.** Write it as functions so the harness can read it.

- `let iterations = 0`. `call(prompt, opts)`:
  - throws `CapReached` if `iterations >= args.maxIterations`
  - otherwise does `iterations++` and returns `agent(prompt, { schema: RESULT_SCHEMA, ...opts })`
  - every agent call goes through `call`, so stage, debug, integration and finalize agents all count toward the cap
- `stagePrompt(t, step, { acceptBacklog })` is this exact text, with the conditional lines included only when they apply:
  ```
  You are <step.agent> working on ticket <id> (Bobby workflow "<WORKFLOW_NAME>").
  1. Run `bobby ticket view <id>`.
     - If the ticket is blocked, change nothing and return verdict "blocked" with the blocked reason.
     [acceptBacklog] - If its Stage: line is "backlog", run `bobby ticket move <id> <step.stage>` first.
     - If its Stage: line is not "<step.stage>", change nothing and return verdict "mismatch" with stage = the stage you saw.
  2. Claim: `bobby ticket assign <id> <step.agent>`.
  [readFirst non-empty] 3. Read these for context if they exist: <each path in backticks>.
  [stage === 'testing'] Before testing, curl the project's health check URLs; if they fail, start the dev server. Test the live app, not specs.
  [args.hasServices] Read the ticket's `services` field; if present, read `.bobbyrc.yml` services and run test/lint/build from each service's path.
  N. Follow your agent instructions end to end.
  N+1. When done, move: `bobby ticket move <id> <step.next>` — use exactly `<step.next>`, even if your agent file or skill names another stage. If you reject the work instead, move it the way your instructions say (`bobby ticket move <id> reject "<reason>"`).
  N+2. Verify `git status --short` shows no uncommitted source files.
  N+3. Run `bobby ticket view <id>` again and return: ticket, stage (its Stage: line now), verdict (advanced | rejected | blocked | incomplete), reason (one line).
  ```
- `runTicket(t, steps, phaseTitle, { startStage, stopOutside })` returns `{ id, status, stage, rejections, reason }`.
  - **Preflight, no agent:**
    - snapshot `stage === 'done'` returns `done-on-entry`, plus a `log`
    - `blocked === true` or `stage === 'blocked'` returns `blocked` with `blockedReason`, plus a `log`
    - `stage === 'backlog'` means: run `steps[0]` with `acceptBacklog: true`
  - **Loop:**
    1. `stage === TERMINAL`:
       - In `feature`/`sprint` mode, run the integration agent once per arrival. Its prompt says: suite = `args.commands.test` if set, else "the project's full test suite". On pass, change nothing and return `passed` with stage `TERMINAL`. On fail, run `bobby ticket move <id> reject "integration: <first failure>"` and return `failed` with stage = the new Stage line.
       - Use `label: '<id> integration'` and no `agentType`.
       - If the agent returns null, the status is `agent-failed`. If it returns `failed`, apply the rejection handling below. Otherwise the status is `complete` (with `stage: TERMINAL`).
       - In `tickets` mode the status is just `complete`.
    2. `stage === 'done'` returns `done`.
    3. `step = steps.find(s => s.stage === stage)`:
       - With no step and `stopOutside` (the feature Plan phase), return `planned` with that stage.
       - With no step otherwise, `log` and return `outside-workflow`.
    4. Run `r = await call(stagePrompt(...), { agentType: step.agent, label: '<id> <step.agent>', phase: phaseTitle })`.
       - `r === null`: `log` and return `agent-failed`. No retry and no substitute.
       - `r.verdict === 'blocked'`: return `blocked`.
       - `r.stage === stage` (unchanged): return `stalled` with `r.reason`. This also catches a mismatch that reports the same stage, so the loop cannot spin.
       - `r.verdict === 'mismatch'`: `log` it and continue from `r.stage`. Do not count it as a rejection.
       - **Rejection** = `BUILD` exists, `r.stage === BUILD.stage` and the previous stage `!== BUILD.stage`. `BUILD` is the step whose stage is `building`. On a rejection:
         - `rejections++`
         - if `rejections > args.maxRetries`, `log` and return `max-retries`
         - if `rejections === 2`, run the debug agent once (`agentType: 'bobby-debug'`, prompt: "Follow your debug instructions on ticket <id>. The ticket stays in building — do not move it. Return the Stage line after.") before the next build. Null means `agent-failed`.
  - **Semantics, as tested:** with `maxRetries = 3`:
    - the 1st rejection leads to rebuild #2
    - the 2nd rejection leads to debug, then rebuild #3
    - the 3rd rejection leads to rebuild #4
    - the 4th rejection stops the ticket, at 4 builds in total
- **Main:**
  - `tickets`/`sprint`: `phase('Execute')`, then each ticket in order runs `runTicket(t, STEPS, 'Execute')`.
  - `feature`:
    - `phase('Plan')`: every ticket whose snapshot stage is `backlog`/`planning` runs `runTicket(t, [PLAN_STEP], 'Plan', { stopOutside: true })`. Plan context is `[...readFirst, ...planReadFirst]`.
    - `phase('Execute')`: every ticket runs `runTicket(t, EXEC_STEPS, 'Execute', { startStage })`. `startStage` is the Plan-phase result stage if the ticket was planned, else the snapshot stage.
    - A ticket whose Plan result is not `planned` keeps that status and skips Execute.
    - A ticket still in `backlog`/`planning` at Execute gets `not-planned`.
- **CapReached.** Catch it at the top. The current ticket gets `iteration-cap`, every later ticket gets `not-started`, and a `log` reports `Stopped: <n>/<max> agent invocations used`.
- **Finalize** (`feature`/`sprint`) runs only if every ticket's status is in `['complete','done','done-on-entry']`. Otherwise `log('Finalize skipped: <id>=<status>, …')`.
  - It runs under `phase('Finalize')` with `label: 'finalize'` and no `agentType`.
  - The prompt says: run the suite (`args.commands.test`) and lint (`args.commands.lint`, if set). If both pass, run `bobby ticket move <epicId> ship` (epic) or `bobby sprint status <sprintId> done` (sprint) and return `passed`. Otherwise change nothing and return `failed`.
- **Return** `report = { workflow: WORKFLOW_NAME, mode, iterations, maxIterations, tickets: [...results], finalize: <result|null|'skipped'> }`.
  The complete set of ticket statuses: `complete`, `done`, `done-on-entry`, `blocked`, `max-retries`, `stalled`, `agent-failed`, `outside-workflow`, `not-planned`, `planned` (Plan phase only, never final), `iteration-cap`, `not-started`.

### Step 4. Generator: `lib/workflow-script.js`, part 2

- [ ] `export function buildWorkflowScript(name, steps)`:
  - `name` must match `/^[a-z0-9][a-z0-9-]*$/i`, else throw `Workflow name '<n>' can't be a script filename; use letters, digits and dashes`.
  - `steps` is the resolved `[{stage, agent}]`. For each step, `next = nextStageName(step.stage, steps)` (exported in Step 2). `TERMINAL` is the last step's `next`, which handles `define` → `planning`.
  - `EXEC_STEPS = steps.filter(s => s.stage !== 'planning')`.
  - `PLAN_STEP = { stage: 'planning', agent: 'bobby-plan', next: EXEC_STEPS[0]?.stage ?? TERMINAL }` (computed at generation).
  - Emit, in order:
    1. `export const meta = ${JSON.stringify(meta, null, 2)};`, where meta is `{ name: 'bobby-<name>', description: 'Bobby "<name>" workflow (<agents joined by " → ">): code-enforced stage loop, retry cap, debug on 2nd rejection', whenToUse: 'Printed by `bobby run workflow|feature|<name>` and `bobby sprint run` when .bobbyrc.yml has orchestration: workflow', phases: [{title:'Plan'},{title:'Execute'},{title:'Finalize'}] }`. JSON is a pure literal.
    2. `// Generated by bobby from workflow "<name>". Do not edit — \`bobby init --refresh\` rewrites it.`
    3. `const WORKFLOW_NAME = …; const STEPS = …; const EXEC_STEPS = …; const PLAN_STEP = …; const TERMINAL = …;`, all via `JSON.stringify`.
    4. The contents of `templates/workflows/runtime.js`, read with `fs`, resolving the path like `lib/template.js:8`.
  - Output is deterministic: same input, same bytes.
- [ ] `export function writeWorkflowScripts(rootDir, config = {})` returns `{ written: [], pruned: [] }`:
  - `mode = resolveOrchestration(config)`. It throws on bad config.
  - `names = mode === 'workflow' ? listWorkflows(config) : []`.
  - Each name writes `.claude/workflows/bobby-<name>.js` from `buildWorkflowScript(name, resolveWorkflow(config, name))`. Use `resolveWorkflow`, not `describeWorkflows`, so a bad user workflow throws loudly and the script equals what `bobby run` resolves.
  - Prune every `bobby-*.js` in `.claude/workflows/` that is not in the written set. Never touch non-`bobby-` files. When the flag is off this removes all `bobby-*.js`, so stale scripts don't linger.
- [ ] `export function assertWorkflowScriptCurrent(rootDir, config, name)`:
  - a missing file throws `Saved workflow .claude/workflows/bobby-<name>.js not found. Run \`bobby init --refresh\` to generate it (orchestration: workflow).`
  - content different from `buildWorkflowScript(name, resolveWorkflow(config, name))` throws `… is out of date with .bobbyrc.yml. Run \`bobby init --refresh\`.`
- [ ] `export function buildWorkflowArgs({ mode, tickets, workflow, maxRetries, maxIterations, readFirst = [], planReadFirst = [], finalize = null, commands = {}, hasServices = false })`:
  - Default `maxIterations` matches today's prompts exactly:
    - `tickets`: 20 (`buildOrchestrationPrompt` default, line 246)
    - `feature`: `tickets.length * workflow.length * 2` (line 693)
    - `sprint`: `Math.max(tickets.length * workflow.length * 2, 10)` (line 848)
  - Returns a plain JSON-safe object: `{ mode, tickets: [{id, stage, blocked, blockedReason}], maxRetries, maxIterations, readFirst, planReadFirst, finalize, commands: {test: commands.test || null, lint: commands.lint || null}, hasServices }`.
- [ ] `export function formatWorkflowInvocation({ name, args, branchGuard })` returns this text:
  ```
  Run this as the saved Claude Code workflow **bobby-<name>** (orchestration: workflow).

  0. Branch guard: <branchGuard>
  1. Call the Workflow tool with name `bobby-<name>` and exactly these args (a JSON object, not a string):
  ```json
  <JSON.stringify(args, null, 2)>
  ```
  2. If the run is interrupted, resume it: Workflow tool with scriptPath `.claude/workflows/bobby-<name>.js`, resumeFromRunId = the runId from step 1, and the SAME args. Completed agents return from cache.
  3. When it returns, report each ticket's status from the result. Do not re-run stages yourself.
  ```
  `branchGuard` strings:
  - tickets mode: today's line-270 text (`git branch --show-current`; if main/master, `git checkout -b <prefix>-<id0>`)
  - feature: the same with `featureBranchName(...)`
  - sprint: today's line-874 text with `sprint.branch`

### Step 5. Target and scaffold wiring

- [ ] `lib/targets/claude-code.js`:
  - `scaffoldExtras(rootDir, config = {}) { writeWorkflowScripts(rootDir, config); }`
  - `extraPaths() { return ['.claude/workflows']; }`
  - Keep `.claude/workflows` out of `paths()`.
- [ ] `commands/init.js:226` passes `config`. Cursor and Cline ignore the second argument, so non-claude targets never get scripts.
- [ ] `eslint.config.js`: add `'.claude/workflows/**'` to `ignores`.

### Step 6. CLI print path

- [ ] `commands/run.js`:
  - After `pipeline` (line 118) and `epicData` (line 148) are resolved, and before `buildPromptFor` (line 150), compute `const orchestration = (agent === 'workflow' || agent === 'feature') ? resolveOrchestration(config) : 'prompt';`. The existing `catch` at 211 prints and exits 1 on a throw.
  - When it is `'workflow'`:
    1. `const wfName = resolveWorkflowName(opts.workflow || 'default', ticketPipeline);` then `assertWorkflowScriptCurrent(root, config, wfName);`
    2. `workflow`: require ≥ 1 id and every `findTicket` to exist (the same errors as `buildPromptFor:590–595`). `tickets` = snapshot from `findTicket(...).data`. `readFirst = []`. `finalize = null`.
    3. `feature`:
       - `tickets` = `epicData.children` mapped to a snapshot
       - `readFirst = [<ticketsDir>/<epic dirname>/feature-plan.md]`
       - `planReadFirst` = each child's `<ticketsDir>/<dirname>/plan.md`
       - `finalize = {kind: 'epic', id: epicId}`
    4. Print the same header lines as today (label `Bobby Workflow — n ticket(s)` / `Bobby Feature — …`, plus a dim `saved workflow · .claude/workflows/bobby-<name>.js`). The feature worktree hint stays. Then `console.log(withSession(formatWorkflowInvocation(...), sessionId))` and `return`.
  - Do **not** append `repoTargetingClause`/`overlayPromptClause` to the invocation. They are prompt-path text, and the stage agents read their own agent files.
- [ ] `commands/sprint.js` `run`: the same gate after `pipeline` (line 241), with:
  - `mode: 'sprint'`
  - `readFirst: [sprintPlanPath]`
  - `finalize: {kind: 'sprint', id: d.id}`
  - name `(d.workflow || d.pipeline) || 'default'`
  - `branchGuard` from `d.branch`

  When the flag is off, nothing changes.

### Step 7. Prompt path: continue the builder (claude-code only)

- [ ] `buildSubagentSteps(workflow, { ..., continueBuilder = false })`: when `continueBuilder` and `s.stage === 'building'`, append to that stage's launch line: ` Note the agent id the Agent tool returns for this subagent; a rejection continues THIS subagent.`
- [ ] `buildRetryDebugClause(maxRetries, agentsPath, { workflow, continueBuilder = false } = {})`:
  - Let `build = workflow?.find(s => s.stage === 'building')`. If `!continueBuilder || !build`, return **today's string byte-for-byte**.
  - Otherwise return this, with `next = nextStageName('building', workflow)`:
    ```
    If the stage went back to "building" (rejection), the work was rejected. Maximum retries: <N>.
         a) **Continue the original <build.agent> subagent** with SendMessage, addressed to the agent id you noted when you launched it for this ticket. Do not launch a fresh one. Message: "Ticket {TICKET_ID} was rejected. Run `bobby ticket view {TICKET_ID}` and read the newest entry under ## Comments for the reason. Fix it, move: `bobby ticket move {TICKET_ID} <next>`, then verify `git status --short` is clean."
         b) If SendMessage fails because that subagent is gone, or you have no agent id for it, say so in your final report, then launch a fresh <build.agent> subagent with the stage prompt above as an explicit, logged step. Never substitute silently.
         c) **On the 2nd retry failure**, launch a bobby-debug subagent (prompt: "Follow `<agentsPath>/bobby-debug.md` on ticket {TICKET_ID}") before the 3rd build attempt, then continue the builder as in (a).
    ```
- [ ] `buildOrchestrationPrompt(..., gitConventions = {}, { continueBuilder = false } = {})`: a new trailing options arg. `buildSprintPrompt` gets `continueBuilder = false` in its options object. Thread it into both fragments.
- [ ] `buildPromptFor` (line 597) passes `{ continueBuilder: (config.target || 'claude-code') === 'claude-code' }`. `commands/sprint.js` passes the same from `config.target`. SendMessage is a Claude Code tool, so Cursor and Cline prompts stay byte-identical.

### Step 8. Docs

- [ ] `README.md` "Run Modes": add a subsection "Run as a Claude Code Workflow (opt-in)". It covers:
  - `orchestration: workflow`
  - `bobby init --refresh` writes `.claude/workflows/bobby-<name>.js`
  - `bobby run workflow|feature` and `sprint run` print the call
  - resuming with `resumeFromRunId`
  - claude-code only
  - the prompt path stays the default

### Step 9. Tests (TDD: write each before its step)

See `test-cases.md`. Harness for runtime tests in `test/lib/workflow-script.test.js`:

```js
const AsyncFunction = (async () => {}).constructor;
function runScript(src, args, agentImpl) {
  const body = src.replace(/^export const meta =/m, 'const meta =');
  const calls = [], logs = [], phases = [];
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', body);
  const agent = async (prompt, opts) => { calls.push({ prompt, opts }); return agentImpl(prompt, opts, calls.length); };
  return fn(agent, null, null, t => phases.push(t), m => logs.push(m), args, { total: null }, null)
    .then(result => ({ result, calls, logs, phases }));
}
```

The `AsyncFunction` constructor throws `SyntaxError` on TypeScript syntax, and that is the "parses as plain JS" check. The meta check is a regex: `/^export const meta = (\{[\s\S]*?\n\});/`, then `JSON.parse` of group 1.

### Step 10. Live E2E (AC 6) with evidence in `test-evidence/`

1. In the scratchpad, never in this repo's board:
   - `node <repo>/bin/bobby.js init`
   - set `orchestration: workflow` and `workflows: { e2e: [build, review] }`
   - `bobby init --refresh`
   - `bobby ticket create -t "Add hello.txt containing hi"`, then `bobby ticket move TKT-001 build`
2. `bobby run e2e TKT-001 > invocation.txt`.
3. Headless: `claude -p "<contents of invocation.txt>" --permission-mode bypassPermissions --output-format stream-json --verbose > run1.jsonl`, run in the background and recorded with its PID. The prompt *is* the user's explicit request for that named workflow. Once the first `bobby-build` agent's result appears in the run journal (`~/.claude/projects/<proj>/…/journal.jsonl`), stop that PID with `kill <pid>` (SIGTERM, our own process, never `kill -9`). Note the runId from the stream or journal.
4. Resume: `claude -p "Resume the Workflow: scriptPath .claude/workflows/bobby-e2e.js, resumeFromRunId <runId>, args <same JSON>" … > run2.jsonl`.
5. Evidence:
   - `invocation.txt`
   - both jsonl excerpts
   - the journal lines showing the build agent served from cache on resume
   - the final `bobby ticket view TKT-001` (Stage: shipping)
   - the final report object
6. Write `test-evidence/README.md` with commands, runId, timings, and the token cost seen in the stream.

If resume by `scriptPath` doesn't take for a saved script, record what does work. Change `formatWorkflowInvocation` step 2 to match, and say so in progress.md. Do not leave both forms in.

---

## 4. Risk areas

- **R1. A refresh eats `.bobbyrc.yml` keys on this branch.** `scaffoldProject` calls `writeConfigCommented` unconditionally (`commands/init.js:87`), and that function emits neither `orchestration` nor `workflows`. So today `bobby init --refresh` (which `bobby upgrade` runs) drops both. The scripts would be written from the in-memory config, but the next `bobby run` would see the flag off. The fix "BOB-123: a refresh must not eat the user's .bobbyrc.yml" (`5ac0271`, `{ writeConfig: false }` on refresh) exists on `origin/integrate/app-studio` and is **not** an ancestor of `origin/main`. Step 1 makes both keys round-trip, and is compatible with BOB-123 if it merges later. A test asserts that refresh keeps them.
- **R2. A stale snapshot in args.** Each agent's live stage check, plus `mismatch`/`stalled`, covers this. A ticket snapshotted as blocked but since unblocked is skipped and logged, never silently.
- **R3. Determinism for resume.** The runtime has no clock or randomness, and prompts are pure functions of args and constants. Same args means a 100% cache hit. The printed resume line insists on the same args.
- **R4. `agentType` resolution.** `bobby-*` agents must exist in `.claude/agents/`. They do for every `STAGE_MAP` step (`commands/init.js:150`). `bobby-debug` is scaffolded.
- **R5. Integration and finalize agents use the default subagent**, so they inherit the session model. That is acceptable: they run commands.
- **R6. Prompt-path regressions.** The new behaviour is gated behind `continueBuilder` (default `false`) and the flag. The old strings stay byte-identical when off, and tests pin that.
- **R7. The E2E spends real tokens** (two short headless runs on a trivial ticket). Keep the workflow at `[build, review]`.

## 5. Dependencies

- `npm install` in this checkout. `node_modules` is absent.
- Claude Code with the Workflow tool on the machine, for Step 10 only.
- No ticket dependencies. BOB-123 is related but not required, because Step 1 covers it.

## 6. Open questions for CC (non-blocking; recommended picks already applied)

1. **Sequential vs parallel tickets.** The plan runs tickets one at a time, matching today's prompts and the shared branch. Running them in parallel needs a worktree per ticket and a merge step, which would be its own ticket. Recommended: keep sequential.
2. **The live E2E runs headless** (`claude -p` in a scratch project, about two short runs). Recommended: the builder runs it. The alternative is CC triggering it in an interactive session.
