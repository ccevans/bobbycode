# Plan — TKT-068: Converge feat/bobby-app and feat/workspace-projects

> This is a **git branch-convergence task**, not a feature build. No product
> code is designed here — the work is a single, carefully resolved merge that
> lands both the studio (repo targeting, decisions, pro board) and the latest
> app (orchestrator with `actions.js` + `main-checkout-lock.js`, full API) on one
> trunk. The merge analysis below was done against the real branches on
> 2026-08-12 and re-verified in a throwaway worktree during planning.

## Facts established during planning (do not re-derive)

- Merge base: `1f6e712` ("dogfood — bobbycode is now a Bobby project").
- `feat/bobby-app` @ `47af329` — 26 commits ahead. The app: newer orchestrator
  (`_promptContext`, `_runInMainCheckout`, `_launch`, `main-checkout-lock.js`),
  full API routes, a real `security` stage, `app` command name. **No studio code
  — no `lib/skills.js`.**
- `feat/workspace-projects` @ `4e57436` — 32 commits ahead. The studio:
  `lib/skills.js` (`repoTargetingClause`), `lib/config.js` `resolveRepoPath`,
  `lib/decisions.js`, the pro board, the design + define pipelines, `freewill`.
  **Its orchestrator does not resolve repos** (repo targeting lives in
  `lib/skills.js`, not the orchestrator).
- A `git merge feat/bobby-app` **into** `feat/workspace-projects` produces
  **exactly 11 conflicts** — verified twice this session.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|------------|-----------|-----------|-------------|-------|
| A | Merge `feat/bobby-app` **INTO** `feat/workspace-projects` (studio is HEAD) | 5 | 4 | 5 | 5 | **38** |
| B | Merge `feat/workspace-projects` INTO `feat/bobby-app` (app is HEAD) | 4 | 3 | 4 | 5 | 31 |
| C | Rebase one branch onto the other | 2 | 2 | 3 | 5 | 21 |

**Decision: Approach A.** `feat/workspace-projects` has the larger surface (32 vs
26 commits, the studio helpers, the pro board, design + define pipelines), so it
keeps the greater share of files unconflicted and stays the natural trunk going
forward. Same 11 conflicts either direction, but with the studio as HEAD the
"keep both / union" resolutions read as additions onto the richer tree. Rebase
(C) rewrites 26–32 commits of shared history across active worktrees — high risk,
no benefit. Not escalated: A wins by 7.

## Merge mechanics (exact, ordered)

Work on `feat/workspace-projects` in `/Users/ccevans/Repos/bobby/repos/bobbycode`.
Do **not** create a feature branch — the convergence lands on the studio trunk
itself.

1. Confirm clean start: `git status --short` shows only expected `.bobby/tickets/`
   churn. Stash or commit any unrelated working-tree changes first.
2. `git merge --no-ff feat/bobby-app` — expect the 11 conflicts below.
3. Resolve **mechanical four first** (they are noise; clearing them shrinks the
   conflict list to the 7 that matter), **then the 7 JS files**.
4. After each file: `git add <file>`. Do not `git commit` until every conflict is
   resolved AND the Verification Gate passes.
5. Commit with a message naming the convergence and the 11 files.

## Per-file resolution intent (one line each)

**Mechanical (resolve first):**

| File | Resolution |
|------|-----------|
| `.bobby/tickets/.counter` | Take the **max**: `69` (studio 69 vs app 14). |
| `.bobby/decisions.yaml` | **Union** — one valid bare top-level YAML list; keep the studio header/schema comment and every `- id:` entry from **both** sides, no duplicate ids. |
| `.bobby/tickets/TKT-061.../ticket.md` | **Keep both** (add/add) — combine so no line from either side is lost. |
| `CHANGELOG.md` | **Union** — keep every entry from both sides under their headings; drop nothing. |

**JavaScript (the real work):**

| File | Resolution |
|------|-----------|
| `bin/bobby.js` | **Union the `EVERYDAY` help array**: keep studio's `blueprint`, adopt the app branch's `app` (the renamed dashboard command) — `['vet','audit','blueprint','brief','idea','ticket','sprint','run','app','remote']`. See note B1. |
| `lib/brief.js` | **Merge the shared maps** (`IN_FLIGHT_STAGES`, `STAGE_RANK`, `NEXT_AGENT`): keep studio's design/define entries AND splice in the app's `security` stage. Not keep-both — one object each. See note B2. |
| `lib/tickets.js` | **Merge `STAGE_ORDER`**: keep studio's full exported map (design + define stages) and add `security` at the correct rank; every one of the 18 merged STAGES must have a rank. See note B3. |
| `lib/dashboard/orchestrator.js` | **App side is authoritative** (`_promptContext` / `_launch` / `_runInMainCheckout` / lock). Then re-thread the one studio field `_promptContext` drops: `hasProduct`. See note B4. |
| `lib/workflow.js` | **Combine** — genuine parameter-position collision. `STAGE_MAP`: keep app's `security:'security'` + studio's `freewill:'building'`. `buildSingleAgentPrompt`: 7 params merging **both** `hasProduct` and `nextStage`. See note B5. |
| `test/lib/stages.test.js` | **Recompute, don't pick a side**: STAGES length assertion → **18** (studio said 17, app said 13; the merged array has 18). See note B6. |
| `test/lib/workflow.test.js` | **Keep both** describe blocks: studio's `define workflow` tests AND app's TKT-049 `built-in workflows structurally sound` tests. Additive. |

## Detailed notes for the non-trivial resolutions

### B1 — `bin/bobby.js`
The conflict is one line: the `EVERYDAY` help listing. Studio has
`blueprint` + `dashboard`; app renamed the command `dashboard → app` and dropped
`blueprint`. Union to keep `blueprint` and use `app` (the newer name). **Then
verify the command actually resolves** — the app branch backs it with a command
file (`commands/app.js`); confirm `node bin/bobby.js app` and, if the studio
still registers `dashboard`, that both names launch. AC "app launched from the
studio root reads the studio board" depends on this.

### B2 — `lib/brief.js`
Both sides edited the **same three constants** differently:
- `IN_FLIGHT_STAGES`: studio adds the four `design-*` stages; app adds `security`.
  Result must contain **both**:
  `['planning', ...DESIGN_STAGES, 'building', 'security', 'reviewing', 'testing', 'shipping']`.
- `STAGE_RANK`: keep studio's design ranks AND insert `security` between
  `building` and `reviewing` (further-along order: reviewing < security < building).
- `NEXT_AGENT`: keep studio's design-stage self-routing AND add
  `security: 'review'` (app).
Keep studio's `DESIGN_STAGES` / `DEFINE_STAGES` named consts and comments — they
are the richer base.

### B3 — `lib/tickets.js`
`STAGE_ORDER` is **exported** on the studio side specifically so the stages
invariant test (`test/lib/stages.test.js` "every stage has a STAGE_ORDER rank")
can enforce that every entry in `lib/stages.js` STAGES has a rank. The merged
STAGES has 18 stages including `security`. Take the studio's full map (design +
define present, `export` kept) and add `security` at the right rank between
`reviewing` and `building`, renumbering as needed. **This test is the guardrail
that will fail if the map merge is incomplete — let it.**

### B4 — `lib/dashboard/orchestrator.js`
The app branch refactored prompt-building into a `_promptContext(ws, {epicData})`
helper and split runs into `_runInWorktree` / `_runInMainCheckout` / `_launch`
with the main-checkout lock. **Keep the app structure wholesale** — it is the
newer orchestrator the ticket wants. The studio HEAD side built the prompt with
an inline options object that included two extra fields; of those, `_promptContext`
already supplies all but one:
- `hasServices`, `agentsPath`, `workflow`, `maxRetries`, `epicData`,
  `gitConventions` — already in `_promptContext`. ✅
- **`hasProduct`** (feature-map detection) — **missing from `_promptContext`**.
  `buildPromptFor` → `buildSingleAgentPrompt` consumes `hasProduct`
  (`lib/workflow.js:570,639,683`), so without it dashboard-launched agents
  silently lose the product-context step. **Add** to `_promptContext`:
  `hasProduct: fs.existsSync(path.join(this.repoRoot, this.config.bobby_dir || '.bobby', 'product', 'feature-map.md'))`.
- The studio also passed `ticketsDir: worktreeTicketsDir` / `ticketsRelDir`; the
  app's `_promptContext` uses `this.ticketsDir`/`ticketsPath`. Keep the app's
  choice (authoritative). Confirm `worktreeTicketsDir` has no other referent left
  dangling after taking the app side.

### B5 — `lib/workflow.js`
Two genuine overlaps plus one value conflict:
1. **`STAGE_MAP`** (line ~49): app has `security: 'security'`, studio has
   `security: 'reviewing'` and adds `freewill: 'building'`. `lib/stages.js`
   merged with a **real `security` stage**, and TKT-049 requires one step per
   stage, so **app's `security: 'security'` is authoritative**. **Also keep
   studio's `freewill: 'building'`.** Result: both.
2. **`buildSingleAgentPrompt` signature** — both sides added a 6th parameter at
   the same position: studio `hasProduct`, app `nextStage`. **Merge to 7 params**:
   `buildSingleAgentPrompt(agent, ticketId, ticketsDir = '.bobby/tickets', agentsPath = '.claude/agents', hasServices = false, hasProduct = false, nextStage = null)`.
   The body must emit **both** the `productHint` step (studio) and the `nextStage`
   `moveStep` (app), with **sequential step numbering** that accounts for both
   optional hints. The workflow.test.js assertions (`4. Follow the instructions`
   when hasProduct, `3.` when not) pin the numbering — make them pass.
3. **Call sites** (lines ~639, ~683): pass **both** new args —
   `buildSingleAgentPrompt(reg.agentName, ticketId, ticketsPath, agentsPath, hasServices, hasProduct, nextStageForAgent(reg.agentName, workflow))`.
   Use the app's in-scope variable name (`ticketsPath`), not studio's
   `ticketsRelDir`, unless `ticketsRelDir` is what the surrounding merged scope
   actually binds — verify before saving.

### B6 — `test/lib/stages.test.js`
Neither side's number is right after the merge. The resolved `lib/stages.js`
STAGES array has **18** entries (backlog, 5 define-*, planning, 4 design-*,
building, security, reviewing, testing, shipping, done, blocked). Set the
`STAGES has N entries` assertion to **18** — verified programmatically during
planning. Keep whichever describe wording is clearer; only the count is
load-bearing.

## Files to modify (all resolved in-place during the merge)

Mechanical: `.bobby/tickets/.counter`, `.bobby/decisions.yaml`,
`.bobby/tickets/TKT-061.../ticket.md`, `CHANGELOG.md`.
JS: `bin/bobby.js`, `lib/brief.js`, `lib/tickets.js`,
`lib/dashboard/orchestrator.js`, `lib/workflow.js`, `test/lib/stages.test.js`,
`test/lib/workflow.test.js`.

No new files. No source changes beyond conflict resolution and the two
recomputed test assertions (STAGES=18) that the merge forces.

## Verification Gate (maps 1:1 to the ACs — all must pass before commit)

Run from `/Users/ccevans/Repos/bobby/repos/bobbycode` on the merged, un-committed
tree.

1. **Full API surface — no route regresses to 404** (AC: "full API surface
   survives"). Boot the app (`node bin/bobby.js app`, note the port) and hit each
   route the app branch owns; each must return non-404 (200 or a documented
   4xx/JSON, never a 404 "route not found"):
   - `GET /api/tickets/:id` — e.g. `/api/tickets/TKT-068` → 200 with ticket JSON.
   - `GET /api/config` → 200 with config JSON.
   - `GET /api/ideas` → 200 (array, possibly empty).
   - `GET /api/events` (SSE) → connects, streams (200 / event-stream), not 404.
   Cross-check by grepping the merged server for each route's registration so a
   route present on only one branch is proven still wired. Any 404 = merge dropped
   a route = fail.

2. **Studio per-repo targeting survives** (AC: "per-repo targeting is present").
   - `lib/skills.js` exists and still exports `repoTargetingClause`.
   - `lib/config.js` still exports `resolveRepoPath`.
   - `grep -rn "repoTargetingClause\|resolveRepoPath" lib/` returns the same
     call sites present on `feat/workspace-projects` pre-merge.

3. **`npm test` is the gate** (AC: "npm test green"). Full suite green — no
   skips, no `.only`. Specifically watch: `test/lib/stages.test.js` (STAGES=18 +
   every-stage-has-a-rank invariant), `test/lib/workflow.test.js` (both the
   `define workflow` block and the TKT-049 structural block, plus the
   `buildSingleAgentPrompt` step-numbering assertions). A red suite blocks the
   commit — do not `--` around it.

4. **App boots and the studio board resolves** (AC: "app launched from the studio
   root reads the studio board"). `node bin/bobby.js app` starts without error
   from the studio root; the board/dashboard loads and lists real studio tickets
   (TKT-068 among them), not an empty or single-repo view. Confirms the app body
   and the studio brain are on one trunk.

Only after 1–4 pass: `git commit`, then `git status --short` clean.

## Risk areas

- **Silent route loss.** A route registered on only one branch can vanish if the
  server-wiring file conflicts and one side is taken wholesale. Verification step
  1 (grep every route registration + live hit) is the specific guard.
- **Incomplete map merges** (`STAGE_ORDER`, `STAGE_RANK`, `NEXT_AGENT`,
  `IN_FLIGHT_STAGES`). Taking one side loses the other's stages. The stages
  invariant test catches a missing `STAGE_ORDER` rank; there is no equivalent
  guard for `STAGE_RANK`/`NEXT_AGENT`/`IN_FLIGHT_STAGES`, so eyeball those three
  against the 18-stage list.
- **`buildSingleAgentPrompt` step numbering.** Merging two optional hints
  (`hasProduct`, `nextStage`) into one numbered sequence is where an off-by-one
  hides. The workflow.test.js assertions pin it — trust them.
- **Command rename `dashboard → app`.** If the merged help lists `app` but no
  command file backs it (or vice-versa), AC 4 fails at boot. Verify the command
  registration, not just the help array.
- **`decisions.yaml` YAML validity.** A union that leaves a stray conflict marker
  or duplicate id makes the file unparseable and can break `bobby-review`. Parse
  it after resolving (`node -e "require('js-yaml')..."` or run any `bobby` command
  that loads it).

## Dependencies

- All target branches already exist locally; `feat/bobby-app` and
  `feat/workspace-projects` are both checked out as worktrees (do not disturb the
  `bobby-app` worktree during the merge).
- Gates TKT-069 — that ticket builds "the app works on all repos" on this single
  trunk and cannot start until this lands.

## Complexity

**Complex** — cross-cutting merge touching the orchestrator, the workflow FSM,
shared stage maps, and the API surface; correctness depends on semantic
combination, not mechanical acceptance of either side.
