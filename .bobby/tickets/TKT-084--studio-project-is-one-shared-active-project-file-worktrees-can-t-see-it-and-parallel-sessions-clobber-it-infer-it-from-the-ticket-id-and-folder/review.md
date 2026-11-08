## Review — TKT-084

### Verdict: Blocked (decision needed: legacy `TKT-` IDs)

The code matches the plan and every AC as written, and the impacted tests and lint are green. It also breaks a command that works today in CC's real studio. Fixing that means changing the behaviour CC approved, so the builder can't settle it alone.

### Files Reviewed
- `lib/project-infer.js` (new). `ticketIdsFromCommand` reads only allowlisted args (`ticketIds`, `epicId`, `id`/`ids` under `ticket`/`worktree`, `retro id`, one-word `go`) plus the `--parent`/`--found-in` options. `inferProjectFromIds` builds prefix→projects through `configForProject`, so there is no second copy of the prefix precedence. Unknown, shared-prefix and mixed-project IDs all throw. Verified against commander 12 (`registeredArguments`/`processedArgs`) and every `<id>` command registration in `commands/`.
- `bin/bobby.js:119-140`. `--project` now always overwrites `BOBBY_PROJECT` and is always spliced out. The new `preAction` hook (line 129) runs after the registry hook, skips when the env is set, and exits 1 on an inference error. Edits stay inside the plan's shared-file limits: imports directly after line 48, the block at 111-120 and new lines after it, and lines 11-15 untouched for TKT-087.
- `lib/config.js:150-176`. Adds the cwd rung (`projectFromCwd`, realpath-guarded, ignores `..`) and reads the active-project file from the main worktree root. The `studioBoardDir` hint text is rewritten.
- `lib/studio.js:9,135-145`. `set`/`getActiveProject` use the main worktree root. Line 100 (TKT-086) is untouched.
- `commands/learn.js:90`: hint text only.
- `templates/CLAUDE.md.ejs:114-116`: a studio-only bullet after line 112, as the plan placed it.
- `test/lib/template.test.js` (outside the plan). It implements TC13 / AC6, which the plan's test list left without a home. It renders both the studio and non-studio versions and checks both the positive and negative strings. It is justified and in scope.
- Tests: `test/lib/project-infer.test.js`, `test/lib/studio.test.js`, `test/commands/studio.test.js`. They cover TC1-TC13. The CLI cases spawn the real `bin/bobby.js` with `BOBBY_PROJECT` deleted, a real git worktree for TC5/6, and assert board contents for TC3/TC4.

### Code Concerns

1. **BLOCKING: legacy `TKT-` IDs now fail in the real studio.** See `lib/project-infer.js:67` and `bin/bobby.js:129-140`. Every robinflow-studio board still holds tickets filed before its prefix was set: robinflow has 247 `TKT-` tickets (56 not done), listrobin 112 (46), robinoffer 76 (65), sam 11 (11), bobbycode-site 13 (5) and robin-ops 2. No project's configured prefix is `TKT`: the prefixes are BOB, BCS, CHU, GRV, LR, OPS, RCW, RF, RO and SAM. Reproduced read-only from `/Users/ccevans/Repos/bobby-code-studio` with `BOBBY_PROJECT` unset and active-project set to `robinflow`:
   - main-checkout CLI (f4b6e61, which does not include TKT-084): `bobby ticket view TKT-491` exits 0 and shows robinflow's TKT-491.
   - this branch: `Error: TKT-491: no project in this studio uses prefix TKT. Projects: ... — pass --project <name>`, exit 1.

   The same applies to `go TKT-x`, `run workflow TKT-x`, `ticket move TKT-x` and `ticket create --found-in TKT-x`. About 183 open tickets now need `--project` on every command, which is the friction this ticket exists to remove. 76 `TKT-` numbers also exist on more than one board, so no rule can resolve those without being told the project. The plan and ticket say "unknown prefix = explicit error", and the code does exactly that. The approved direction did not account for prefixes that live on boards but not in config. That makes this CC's call (see Notes), and under the no-fallbacks rule the builder may not decide it.

2. Note: `--project` can now escape the dashboard pin. `lib/dashboard/orchestrator.js:717-724` pins app-spawned runs through env `BOBBY_PROJECT` and calls it "the top of that precedence chain". No spawned command line carries `--project`: I grepped `lib/`, `commands/` and `templates/`. So no run that works today changes target. Before this change, `BOBBY_PROJECT=x bobby --project y …` failed with `error: unknown option '--project'`, which I verified on the main checkout. Now it targets `y`. An agent that types `--project <other>` inside a pinned run therefore leaves the pin. This follows from AC4 and is explicit, so it is acceptable. The orchestrator comment is now stale (the file is outside the plan, so it was not edited).

3. Note: `bobby project use` inside a studio git worktree now changes the main checkout's default for every session. Before, it wrote a private gitignored file that nothing read. This is planned (step 4) and needed so the read and the write agree. It is worth knowing because it widens the "sessions clobber each other" surface for anyone still relying on the file rather than IDs or the cwd.

4. Note: `findMainWorktreeRoot` returns the git toplevel of the main worktree, not the studio root. A studio nested in a subdirectory of a git repo, opened from a linked worktree, would read and write `<toplevel>/.bobby/active-project`. `resolveTicketsDir` already assumes studio root = git toplevel, so this is pre-existing and not a blocker.

5. Note: `inferProjectFromIds` reads every project's config. One malformed project `.bobbyrc.yml` now fails every ID-named command in the studio, not just commands for that project. The error is explicit, which is acceptable.

6. `go utf-8` (one word) still counts as a ticket ID. Acceptable: `commands/go.js:48` already reads one ID-shaped word as a ticket and runs `run workflow UTF-8`, which ends in "not found". In a studio that error is now the prefix error. The command failed before and fails now, with a clearer message. Multi-word free text is never read (TC11 unit + CLI).

### Decision Violations
- None. `tickets-resolve-to-main-worktree` is not touched: studio boards still resolve under the root, as the plan says on purpose.

### AC Verification
- [x] AC1: the preAction hook plus `inferProjectFromIds`. TC1 (root) and TC2 (`repos/app`) pass. Fails for legacy `TKT-` IDs (Concern 1).
- [x] AC2: `resolveActiveProject` reads `findMainWorktreeRoot(rootDir)`. TC5 (lib + CLI, real `git worktree`) passes.
- [x] AC3: `projectFromCwd`. TC7 lib + CLI pass, and the cwd beats the file.
- [x] AC4: `--project` overwrite at bin:119-125 plus the env guard at bin:130. TC8 a/b/c pass.
- [x] AC5: unknown, shared-prefix and mixed errors name the projects. TC9 and TC10 pass.
- [x] AC6: the studio bullet in CLAUDE.md.ejs. No shipped template says `bobby project use` (grep). TC13 passes.
- [x] AC7: the precedence test is extended rung by rung, plus the worktree test.

### Test/Lint Output
- Impacted specs (`NODE_OPTIONS=--experimental-vm-modules npx jest`): `test/lib/project-infer.test.js test/lib/studio.test.js test/commands/studio.test.js test/lib/template.test.js test/lib/config.test.js test/commands/learn.test.js test/commands/go.test.js test/lib/registry.test.js test/lib/dashboard/orchestrator-project-pin.test.js test/lib/dashboard/project-context.test.js test/lib/dashboard/project-api.test.js test/lib/dashboard/project-header-routing.test.js`: 12 suites, 144 tests, all passed.
- `test/e2e/lifecycle.test.js` rerun alone: 23/23 passed. The builder's failure is the shared `<os.tmpdir()>/bobby-wt/TKT-001-*` path, filed as TKT-093.
- Lint: `npm run lint` gives 0 errors and 38 pre-existing warnings. `eslint` on the changed files alone is clean.

### Notes
- **Decision needed (CC):** how should an ID whose prefix no project's config owns (the legacy `TKT-`) resolve?
  1. **Look it up on the boards (recommended).** If exactly one board holds that exact ID, use that project. If none or several do, raise an explicit error naming them. This is a fact lookup, not a guess. It fixes about 283 of the 359 distinct legacy IDs, and the 76 that collide get an error that names the boards.
  2. **Fall through to the old rungs** (cwd, then the active-project file) for prefixes no config owns. This is pre-TKT-084 behaviour for legacy IDs, but it is a fallback, so it needs CC's approval.
  3. **Keep it as built.** Legacy IDs need `--project`.
- Filed: TKT-093: test/e2e/lifecycle 'reclaims its worktree' uses the shared `<os.tmpdir()>/bobby-wt/TKT-001-*` path, so parallel suite runs collide.
- The builder's note stands: the studio-owned `robinflow-campaign-launch` skill still says `bobby project use`. It is outside this repo and was not edited.
