# Test Cases — TKT-068 (branch convergence)

> These verify the **merged tree** on `feat/workspace-projects` after
> `git merge feat/bobby-app` is resolved. Each maps to an acceptance criterion.
> "Read path" = the code/route survived; "Write path" = an actual run through the
> merged code produces the right behavior; "Error path" = the merge didn't leave
> the tree broken.

## TC1 — One branch carries both studio helpers and the latest app orchestrator
**AC:** One branch carries both the studio helpers and the latest app orchestrator.
**Precondition:** Merge resolved, not yet committed.
**Steps:**
1. `git -C /Users/ccevans/Repos/bobby/repos/bobbycode grep -l "repoTargetingClause" -- lib/skills.js`
2. `git grep -l "resolveRepoPath" -- lib/config.js`
3. `git grep -l "_promptContext\|_runInMainCheckout\|acquireMainCheckoutLock" -- lib/dashboard/orchestrator.js`
4. `ls lib/dashboard/main-checkout-lock.js lib/dashboard/actions.js`
**Expected:** All four resolve — studio helpers (skills/config) AND the app
orchestrator (`_promptContext`, main-checkout lock, actions) coexist in one tree.

## TC2 — Full API surface survives, no route regresses to 404 (read path)
**AC:** The full API surface survives the merge (no route regresses to 404).
**Precondition:** Merged tree; app booted via `node bin/bobby.js app` on its port.
**Steps:**
1. Confirm each route is registered in the merged server:
   `grep -rn "/api/tickets\|/api/config\|/api/ideas\|/api/events" lib/dashboard/ commands/`
2. Live-hit each (substitute the printed port):
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/api/tickets/TKT-068`
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/api/config`
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/api/ideas`
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/api/events` (SSE)
**Expected:** Every route is registered (step 1) AND returns a non-404 status
(step 2) — 200 with the expected JSON for tickets/config/ideas, a streaming/200
connection for events. A single `404` is a dropped route → fail.

## TC3 — `/api/tickets/:id` returns the real ticket (write/data path)
**AC:** Full API surface survives (behavioral, not just non-404).
**Precondition:** App booted on merged tree.
**Steps:**
1. `curl -s http://localhost:PORT/api/tickets/TKT-068 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.id, j.title?.slice(0,20))})"`
**Expected:** Response is JSON for TKT-068 with its real title — proves the
dynamic `:id` route resolves data, not just a stub 200.

## TC4 — Studio per-repo targeting is present and intact
**AC:** The studio's per-repo targeting is present in the merged tree.
**Precondition:** Merged tree.
**Steps:**
1. `node -e "import('/Users/ccevans/Repos/bobby/repos/bobbycode/lib/skills.js').then(m=>console.log(typeof m.repoTargetingClause))"`
2. `node -e "import('/Users/ccevans/Repos/bobby/repos/bobbycode/lib/config.js').then(m=>console.log(typeof m.resolveRepoPath))"`
3. `grep -rn "repoTargetingClause\|resolveRepoPath" lib/ | wc -l`
**Expected:** Both print `function`; call-site count is ≥ the pre-merge
`feat/workspace-projects` count (targeting still wired, not orphaned).

## TC5 — Merged stage maps are complete (regression guard for the map merges)
**AC:** npm test green (this specific invariant).
**Precondition:** Merged tree.
**Steps:**
1. `node -e "const {STAGES}=require('...')" ` equivalent via the test:
   run `npx jest test/lib/stages.test.js`
2. Confirm the STAGES-length assertion reads **18** and the
   "every stage has a STAGE_ORDER rank" test passes.
**Expected:** stages.test.js green; STAGES length is 18; `security` + all
`design-*`/`define-*` stages each have a `STAGE_ORDER` rank in `lib/tickets.js`.
An incomplete `STAGE_ORDER` merge fails the invariant test here — that is the
intended catch.

## TC6 — Workflow prompt builder combines both new params (write path)
**AC:** npm test green (buildSingleAgentPrompt behavior).
**Precondition:** Merged tree.
**Steps:**
1. `npx jest test/lib/workflow.test.js`
2. Confirm the merged `buildSingleAgentPrompt` accepts 7 args and both feature
   sets are exercised: the `hasProduct` product-context step AND the `nextStage`
   move instruction, with the `4. Follow the instructions` / `3. Follow the
   instructions` step-numbering assertions passing.
3. Confirm BOTH describe blocks run: `define workflow` and the TKT-049
   `built-in workflows are structurally sound`.
**Expected:** workflow.test.js green; STAGE_MAP has `security: 'security'` AND
`freewill: 'building'`; no duplicate-stage / self-handoff failure from the
TKT-049 guard.

## TC7 — Full suite is green (the gate)
**AC:** `npm test` green on the merged branch.
**Precondition:** All 11 conflicts resolved.
**Steps:**
1. `cd /Users/ccevans/Repos/bobby/repos/bobbycode && npm test`
**Expected:** Exit 0, no failures, no skipped-because-broken, no stray `.only`.
Do not commit until this is green.

## TC8 — App boots from studio root and reads the studio board (end-to-end)
**AC:** The app launched from the studio root reads the studio board.
**Precondition:** Merged tree, `git status` still shows the resolved-but-uncommitted merge.
**Steps:**
1. `node bin/bobby.js app` from `/Users/ccevans/Repos/bobby/repos/bobbycode`.
2. Open the printed URL; observe the board.
3. Confirm `bin/bobby.js`'s help lists the command (`node bin/bobby.js --help`
   shows `app`) and it launches without a "command not found".
**Expected:** App starts with no error; board renders and lists real studio
tickets (TKT-068 present), not an empty or single-repo view — the studio brain
and app body run from one trunk.

## TC9 — decisions.yaml stays valid YAML (error path)
**AC:** Merge doesn't leave the tree broken (supports npm test + bobby-review).
**Precondition:** `.bobby/decisions.yaml` union resolved.
**Steps:**
1. `node -e "const y=require('js-yaml');const fs=require('fs');const d=y.load(fs.readFileSync('.bobby/decisions.yaml','utf8'));console.log(Array.isArray(d), d.length)"`
2. `grep -n '<<<<<<<\|=======\|>>>>>>>' .bobby/decisions.yaml` (must be empty).
3. Check for duplicate ids: pipe the parsed `id`s through `sort | uniq -d`.
**Expected:** Parses as a bare top-level array; no conflict markers; no duplicate
ids. Both branches' decision entries are present.

## TC10 — Mechanical resolutions took the right value (error path)
**AC:** Clean, correct merge of the mechanical four.
**Precondition:** Mechanical four resolved.
**Steps:**
1. `cat .bobby/tickets/.counter` → must be `69`.
2. `grep -c '<<<<<<<' CHANGELOG.md .bobby/tickets/TKT-061*/ticket.md` → `0` each.
3. Spot-check CHANGELOG contains entries unique to each branch.
**Expected:** `.counter` is 69 (max, not 14); no residual conflict markers; no
CHANGELOG or TKT-061 content dropped from either side.
