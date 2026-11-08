## Review — TKT-084 (round 2: unowned-prefix board lookup)

### Verdict: Approved with Notes

Round 1 blocked on legacy `TKT-` IDs. CC chose option 1 (plan.md "Decision (CC, 2026-11-07)"). Rework commit 158eeae implements it exactly. Branch `tkt-084-project-inference`, commits b5c04b9, 9240022 (auto-sync), 158eeae, reviewed against origin/main.

### Files Reviewed
- `lib/project-infer.js:55-91` (rework). When no project's config prefix owns an ID's prefix, it calls `findTicket(<studio>/.bobby/<p>/tickets, ID)` for every project. One holder means that project. Zero or several holders throw a named error ending `pass --project <name>`. A legacy ID that resolves joins the same `resolved` map as owned IDs, so mixed IDs (legacy plus owned, or legacy from two boards) still throw the cross-project error. There is no `return null` and no fallthrough on the unowned path. The function either returns a project or throws, so the bin hook never reaches the cwd or active-project rungs for an unowned prefix. Owned prefixes take the unchanged `owners` branch and never read a board.
  - The board path `.bobby/<p>/tickets` matches `studioBoardDir` (`lib/config.js:619`), and both resolve under the same `findProjectRoot()` root. Inside a studio git worktree (e.g. `worktrees/newsletter-v2-tickets`), lookup and the command use the same board.
  - `findTicket` matches `${id}--` exactly, so `TKT-49` cannot hit `TKT-491`. It needs a readable `ticket.md`. Archived tickets stay in place (`commands/archive.js:74` only sets `archived: true`), so they are found.
- `bin/bobby.js:115-140`, `lib/config.js:141-176,611-620`, `lib/studio.js:9,135-146`, `commands/learn.js:90`, `templates/CLAUDE.md.ejs:114-116`: unchanged since round 1. I re-read the full diff and stand by the round-1 notes on these files. `--project` and `BOBBY_PROJECT` still skip inference (`bin/bobby.js:130`).
- Tests changed in 158eeae:
  - `test/lib/project-infer.test.js`: one board, no board, several boards, no fallthrough to active-project, mixed legacy boards, owned prefix never reads boards.
  - `test/commands/studio.test.js`: TC9 now covers "not found on any board", plus TC9b (one board, real CLI) and TC9c (several boards errors, `--project` resolves).

### Real studio check (`/Users/ccevans/Repos/bobby-code-studio`, branch CLI, `BOBBY_PROJECT` unset, active-project = robinflow, read-only `ticket view`)
| Command / cwd | Result |
|---|---|
| `ticket view TKT-491` at the root | exit 0, robinflow's TKT-491 (failed in round 1) |
| `ticket view TKT-491` from `repos/listrobin-ui` and from `worktrees/RF-1334-api` | exit 0, robinflow |
| `ticket view TKT-010` | exit 1: `found on more than one project board (bobbycode-site, listrobin, robinoffer, sam) — pass --project <name>` |
| `ticket view TKT-010` from `worktrees/robinoffer/` | exit 1, same error. The cwd rung is not consulted, as decided |
| `ticket view TKT-99999` | exit 1: `not found on any project board (searched: bobby, …, sam) — pass --project <name>` |
| `--project robinoffer ticket view TKT-010` | exit 0, robinoffer's |
| `BOBBY_PROJECT=listrobin ticket view TKT-010` | exit 0, listrobin's |
| `BOBBY_PROJECT=listrobin --project robinoffer …` | exit 0, robinoffer's (`--project` beats env) |
| `ticket view RF-1334` / `RF-999999` | robinflow / "Ticket RF-999999 not found" (owned prefix unchanged, no board lookup) |

**Collision census** (script over every board's `TKT-*` dirs):
- 359 distinct legacy IDs, of which 76 sit on more than one board (TKT-001..TKT-076; 63 of them are listrobin+robinoffer only).
- 182 distinct IDs have at least one non-done copy, and 106 of those resolve automatically.
- Open legacy tickets that now need `--project`, per board: robinoffer 65/65, sam 11/11, bobbycode-site 5/5, chuvaldevans 1/1, listrobin 19/46. All 79 open robinflow legacy tickets resolve on their own, because none collide.
- Does this make common commands unusable? No. Every colliding ticket was last updated on or before 2026-09-08 (robinoffer 09-08, listrobin 09-18, sam 07-05, bobbycode-site 04-12), and each now carries its own prefix for new work. The error names the boards and the fix.
- The real regression against main is narrow. Before, a user whose active-project was robinoffer could type `TKT-010` bare. Now they need `--project`. That is the behaviour CC chose ("several → explicit error, no fallthrough").

### Code Concerns
1. Note (filed as TKT-096): `bobby run` prompts export only `BOBBY_SESSION_ID`, not the resolved project. Take a batch run whose project comes from active-project, on a board with colliding legacy IDs. Its agents' own `bobby ticket move TKT-0xx …` now exits 1 with the "pass --project" error. Agents can recover, because the error names the boards and the prompt names the tickets dir absolutely. Pinning `BOBBY_PROJECT` in the prompt would remove the friction and harden runs against `project use` from other sessions. Low priority today, since those tickets are dormant.
2. Note: the shipped CLAUDE.md bullet (`templates/CLAUDE.md.ejs:115`) says "Pass `--project <name>` only to a command that names no ticket". Since the rework, that is not quite true for a legacy ID on several boards. It is non-blocking because the error itself says to pass `--project`. A future edit could add "…or when the error asks for it".
3. Note: if a studio project has no `ticket_prefix`, `configForProject` defaults it to `TKT` (`lib/config.js:214`). That project then owns `TKT`, and legacy IDs skip the board lookup and route to it. This does not occur in the real studio: all 10 projects have explicit prefixes (BOB, BCS, CHU, GRV, LR, OPS, RCW, RF, RO, SAM). Worth knowing if a prefix-less project is ever added.
4. Note: lower-case `tkt-491` infers robinflow (the lookup upper-cases it), but `ticket view` itself is case-sensitive and reports "Ticket tkt-491 not found". This is the same on main, where it is pre-existing (it also applies to `rf-1334`). It is not a regression.
5. Round-1 notes 2–6 still apply unchanged: `--project` can leave a dashboard pin, `project use` in a worktree writes the main file, `findMainWorktreeRoot` uses the git toplevel, one bad project config fails every ID-named command, and one-word `go utf-8`.

### Decision Violations
- None. `tickets-resolve-to-main-worktree`: the studio board still resolves under the invoking root, and the board lookup uses that same root, as plan step 3 intends. `decisions-log-has-one-writer`: not touched.

### AC Verification
- [x] AC1: owned prefixes resolve as in round 1 (TC1, TC2, real RF-1334). Legacy IDs now resolve through the board lookup when one board holds them (TC9b, real TKT-491 from root, repos/ and worktrees/). Colliding legacy IDs give the CC-decided explicit error.
- [x] AC2: main-worktree active-project (TC5), unchanged.
- [x] AC3: cwd under `worktrees/<project>/` (TC7), unchanged. For unowned prefixes it is intentionally not consulted (decision).
- [x] AC4: `--project` > env > inference (TC8, TC9c, real-studio rows above).
- [x] AC5: an unknown prefix on no board errors naming the boards searched; a prefix on several boards errors naming them; shared prefix and mixed projects error as before (TC9, TC9c, TC10, unit tests).
- [x] AC6: template bullet (TC13). See Concern 2 for the wording.
- [x] AC7: precedence rungs unit-tested, plus the new unowned-prefix cases.

### Test/Lint Output
- Impacted specs (`NODE_OPTIONS=--experimental-vm-modules npx jest`): `test/lib/project-infer.test.js test/lib/studio.test.js test/commands/studio.test.js test/lib/template.test.js test/lib/config.test.js test/commands/learn.test.js test/commands/go.test.js test/lib/registry.test.js test/lib/tickets.test.js test/lib/dashboard/orchestrator-project-pin.test.js test/lib/dashboard/project-context.test.js test/lib/dashboard/project-api.test.js test/lib/dashboard/project-header-routing.test.js`. Result: 13 suites, 242 tests, all passed.
- `test/e2e` (all suites, which drive the real `bin/bobby.js`, run on their own): 7 suites passed and 1 skipped (as configured); 67 tests passed, 47 skipped. `lifecycle.test.js` passed in this run.
- Lint: `npm run lint` gives 0 errors and 38 warnings, all pre-existing. `eslint` on every changed file gives 0 problems.

### Notes
- Filed: TKT-096. Studio `bobby run` prompts should export the resolved `BOBBY_PROJECT`, so batch-run agents don't hit the colliding-legacy-ID error.
- Still outstanding from round 1, outside this repo: the studio-owned `robinflow-campaign-launch` skill still says `bobby project use`.
