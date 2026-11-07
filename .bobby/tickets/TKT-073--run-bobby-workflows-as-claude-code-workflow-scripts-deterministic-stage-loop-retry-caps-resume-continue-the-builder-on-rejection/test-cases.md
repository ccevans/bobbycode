# Test Cases: TKT-073

Unit tests live in `test/lib/workflow-script.test.js` (generator, scaffold, runtime harness from plan.md Step 9), `test/lib/workflow.test.js` and `test/lib/targets.test.js`. CLI tests live in `test/commands/run-orchestration.test.js`, which runs `node bin/bobby.js` in a mkdtemp project. TC-20 is the live run.

"Mock agent" means the harness `agentImpl`. It returns scripted `{ticket, stage, verdict, reason}` objects keyed by `opts.agentType` and call order.

---

## AC1: Scripts are written for every workflow, by init and refresh, as plain JS

### TC-01: Refresh writes one script per built-in and user workflow (write path)
**Preconditions:** A temp project from `scaffoldProject`, committed to git. `.bobbyrc.yml` gains `orchestration: workflow` and `workflows: { fast: [build, test] }`.
**Steps:**
1. Run `bobby init --refresh`.
2. List `.claude/workflows/`.
3. Read `.bobbyrc.yml`.
**Expected:**
- The listing is exactly `bobby-default.js`, `bobby-secure.js`, `bobby-quick.js`, `bobby-design.js`, `bobby-define.js`, `bobby-freewill.js` and `bobby-fast.js`.
- `.bobbyrc.yml` still contains `orchestration: workflow` and the `fast` workflow. This guards Risk R1.

### TC-02: Each script starts with a pure-literal meta and parses as plain JS
**Preconditions:** `buildWorkflowScript(name, resolveWorkflow({}, name))` has run for every built-in.
**Steps:**
1. Assert that the source starts with `export const meta = `.
2. Extract the meta object with the regex and `JSON.parse` it.
3. Compile the body through the `AsyncFunction` wrapper.
4. Grep the source.
**Expected:**
- `meta.name === 'bobby-<name>'`.
- `meta.description` is non-empty.
- Every `meta.phases` title is in `['Plan','Execute','Finalize']`.
- Compiling does not throw.
- The source contains no `Date.now`, `Math.random`, `new Date(`, `: string`, `interface ` or `require(`.
- Calling the function twice gives byte-identical output.

### TC-03: Turning the flag off, or removing a workflow, prunes stale scripts and keeps user scripts
**Preconditions:** TC-01 state, plus a user file `.claude/workflows/my-flow.js`.
**Steps:**
1. Remove `fast` from `.bobbyrc.yml` and refresh.
2. Remove `orchestration` and refresh.
**Expected:**
- After step 1, `bobby-fast.js` is gone and the other `bobby-*.js` remain.
- After step 2, no `bobby-*.js` remains.
- `my-flow.js` is untouched both times.

### TC-04: Bad config fails loudly (error path)
**Steps:**
1. Call `writeWorkflowScripts` with `orchestration: 'workflows'`.
2. Call it with `orchestration: workflow` and a workflow named `my flow!`.
**Expected:**
- Step 1 throws `Unknown orchestration 'workflows' … Valid: prompt, workflow`.
- Step 2 throws "can't be a script filename".
- No files are written in either case.

---

## AC2: Stage agents, schema, and the retry, debug and iteration caps live in script code

Every case runs the generated `bobby-default` source through the harness.

### TC-05: Happy path. Each stage runs as its own agent type with the result schema
**Preconditions:** `args` = tickets mode, `[{id:'TKT-1', stage:'planning'}]`, `maxRetries 3`, `maxIterations 20`. The mock advances each stage: plan returns building, build returns reviewing, review returns testing, test returns shipping.
**Steps:** Run the script.
**Expected:**
- `calls.map(c => c.opts.agentType)` equals `['bobby-plan','bobby-build','bobby-review','bobby-test']`.
- Every call has `opts.schema.required` equal to `['ticket','stage','verdict','reason']` and `type: 'object'`.
- The build prompt contains `bobby ticket move TKT-1 reviewing`.
- `result.tickets[0].status === 'complete'` and `result.iterations === 4`.

### TC-06: Debug runs on the 2nd rejection, before the 3rd build
**Preconditions:** The ticket starts in `building`. The mock review rejects (returns `building`) twice, then advances. Test advances.
**Expected:**
- The agentType order is build, review, build, review, **bobby-debug**, build, review, test.
- Debug runs exactly once.
- Status is `complete` and `rejections === 2`.

### TC-07: The retry cap stops the ticket (error path)
**Preconditions:** `maxRetries 3`. Review always returns `building`.
**Expected:**
- Exactly 4 `bobby-build` calls and 1 `bobby-debug` call.
- No 5th build.
- Status is `max-retries`.
- A `log` line names TKT-1 and the cap.

### TC-08: The max-iterations backstop stops the whole run
**Preconditions:** Two tickets, both in `planning`. `maxIterations 3`. Every stage advances.
**Expected:**
- Exactly 3 agent calls.
- TKT-1 has status `iteration-cap` and TKT-2 has status `not-started`.
- A log contains `3/3`.

### TC-09: Preflight with done, blocked and backlog snapshots
**Preconditions:** The tickets are `[{id:'A',stage:'done'}, {id:'B',stage:'reviewing',blocked:true,blockedReason:'waiting on API key'}, {id:'C',stage:'backlog'}]`.
**Expected:**
- A and B make no agent calls.
- A is `done-on-entry`. B is `blocked` with reason `waiting on API key`, and that reason is logged.
- C's first prompt goes to `bobby-plan` and contains `bobby ticket move C planning`.

### TC-10: A stale snapshot is corrected by the agent's mismatch report
**Preconditions:** The snapshot says `planning`. The mock `bobby-plan` returns `{verdict:'mismatch', stage:'reviewing'}`.
**Expected:**
- The next call is `bobby-review`.
- The mismatch is logged.
- `rejections` stays 0.

### TC-11: A dead or skipped agent stops that ticket with no substitute, and the next ticket still runs
**Preconditions:** Two tickets. The mock returns `null` for TKT-1's first call.
**Expected:**
- TKT-1 is `agent-failed`. No second agent runs for TKT-1.
- TKT-2 runs normally to `complete`.

### TC-12: Stalled and outside-workflow stages stop with a log
**Steps:**
1. The mock returns the same stage it was given, with verdict `incomplete`.
2. A ticket's snapshot stage is `security` on `bobby-default`.
**Expected:**
- Case 1 is `stalled` and makes no further calls for that ticket.
- Case 2 is `outside-workflow` with zero calls, and its log names the stage.

### TC-13: Invalid args throw an explicit error (error path)
**Steps:** Run with `args` set to:
1. `undefined`
2. `{mode:'x', …}`
3. `tickets: []`
4. `maxIterations: 0`
**Expected:** Each case rejects with an error starting `bobby-default:`, and no agent is called.

### TC-14: Feature mode plans every child first, checks integration after each, and finalizes
**Preconditions:**
- mode `feature`, finalize `{kind:'epic', id:'EP-1'}`, `commands.test: 'npm test'`
- children C1 (`backlog`) and C2 (`planning`)
- the mock advances everything
- the integration agent (no agentType, label `C1 integration`) returns `passed` for C1. For C2 it first returns `failed` with stage `building`, then `passed`
**Expected:**
- Both `bobby-plan` calls come before any `bobby-build` call.
- The plan prompts list the `planReadFirst` paths.
- After the first C2 integration call returns `failed`, C2 is rebuilt, and that counts as a rejection.
- Finalize runs once, and its prompt contains `npm test` and `bobby ticket move EP-1 ship`.
- With C2 instead forced to `max-retries`, finalize is **not** called and a log says `Finalize skipped`.

### TC-15: Sprint finalize and the define terminal stage
**Steps:**
1. Sprint mode with finalize `{kind:'sprint', id:'SPR-1'}`, all tickets reaching shipping.
2. A generated `bobby-define` script on a ticket in `define-brief`.
**Expected:**
- Case 1: the finalize prompt contains `bobby sprint status SPR-1 done`.
- Case 2: after `define-blueprint` returns `planning`, the status is `complete` with `stage: 'planning'` (`TERMINAL === 'planning'`) with no `bobby-plan` call.

---

## AC3: The CLI prints the saved-workflow call when the flag is on, and today's prompt when it is off

### TC-16: Flag on prints the invocation with args (read path)
**Preconditions:** A temp project with `orchestration: workflow`, refreshed, and `bobby ticket create -t "X"` giving TKT-001 in backlog.
**Steps:**
1. Run `bobby run workflow TKT-001`.
2. Run `bobby run quick TKT-001`.
3. Set up an epic with two children, then run `bobby run feature <epic>`.
4. Run `bobby sprint new "S" TKT-001`, then `bobby sprint run SPR-001`.
**Expected:**
- Output 1 contains `bobby-default`, a fenced JSON block whose parse gives `mode:'tickets'`, `tickets[0].id:'TKT-001'`, `tickets[0].stage:'backlog'` and `maxIterations:20`, `resumeFromRunId`, and `export BOBBY_SESSION_ID`. It does **not** contain `You are orchestrating`.
- Output 2 names `bobby-quick`.
- Output 3 names `bobby-default` with `mode:'feature'`, `finalize.id` equal to the epic id, and a `readFirst` path ending in `feature-plan.md`.
- Output 4 has `mode:'sprint'`, `readFirst[0]` ending in `sprint-plan.md`, and `finalize.kind:'sprint'`.

### TC-17: Flag off leaves the output unchanged (regression)
**Steps:** Run the same four commands with no `orchestration` key.
**Expected:**
- The output contains `You are orchestrating a Bobby workflow` (workflow), `You are running a Bobby feature workflow` and `You are running a Bobby sprint`, with no `Workflow tool` mention.
- The existing `test/lib/workflow.test.js`, `test/e2e/lifecycle.test.js` and `test/commands/sprint.test.js` suites pass unmodified.

### TC-18: A missing or stale script, a bad value, or a wrong target exits non-zero (error path)
**Steps:**
1. Set the flag on but skip the refresh, then run `bobby run workflow TKT-001`.
2. Refresh, then add `workflows: {default: [build, review]}` without refreshing, and run it again.
3. Set `orchestration: bogus`.
4. Use `target: cursor` with `orchestration: workflow`.
**Expected:**
- Step 1 exits non-zero with `not found. Run \`bobby init --refresh\``.
- Step 2 exits non-zero with `out of date`.
- Step 3 fails with `Unknown orchestration 'bogus'`.
- Step 4 fails with `needs target claude-code`.
- No prompt is printed in any of these cases.

---

## AC4: On rejection, the prompt path continues the original builder through SendMessage

### TC-19: The claude-code prompt continues the builder and logs a fresh launch explicitly
**Steps:**
1. Call `buildOrchestrationPrompt(['TKT-1'], DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, '.claude/agents', false, {}, { continueBuilder: true })`.
2. Call `buildSprintPrompt(...)` with `continueBuilder: true`.
3. Call both with the option omitted.
4. Call `buildPromptFor('workflow', …)` with `config.target: 'cursor'`.
**Expected:**
- Steps 1 and 2 contain all of:
  - `SendMessage`
  - `Note the agent id`
  - `Continue the original bobby-build subagent`
  - `bobby ticket move {TICKET_ID} reviewing`
  - `say so in your final report`
  - `fresh bobby-build subagent`
  - `.claude/agents/bobby-debug.md`
  - `2nd retry failure`
- Step 3 equals today's text exactly: it contains `Loop back and launch a bobby-build subagent again` and does not contain `SendMessage`.
- Step 4 does not contain `SendMessage`.
- A `define` workflow with `continueBuilder: true` has no building step, so its retry clause equals today's.

---

## AC5: Non-claude targets never get workflow scripts

### TC-20a: Cursor and Cline scaffolds with the flag on write no scripts
**Steps:** Call `scaffoldProject` with `target: 'cursor'` and then with `target: 'cline'`, each with `orchestration: 'workflow'`.
**Expected:**
- `.claude/workflows/` does not exist for either target.
- The claude-code `scaffoldExtras(tmpDir)` no-op test, called with no config, still passes and writes no files.

---

## AC6: One real end-to-end run, including a kill and a resume

### TC-20: A live headless run is killed mid-flight and resumes from cache
**Preconditions:**
- a scratch project with `orchestration: workflow` and `workflows: { e2e: [build, review] }`, refreshed
- TKT-001 "Add hello.txt containing hi" in `building`
- Claude Code with the Workflow tool installed
**Steps:** Follow plan.md Step 10:
1. `bobby run e2e TKT-001`.
2. Run it headless with `claude -p` in the background.
3. `kill <pid>` once the build agent's result appears in the journal.
4. Resume with `resumeFromRunId` and the same args.
**Expected:**
- In the resumed run's journal, the `bobby-build` call is a cache hit, not a second live build, and `bobby-review` runs live.
- `bobby ticket view TKT-001` shows `Stage: shipping`.
- `hello.txt` is committed.
- The final report shows `status: 'complete'`.
- Evidence is saved in `test-evidence/` (README.md, invocation.txt, run1/run2 excerpts, the journal lines).
