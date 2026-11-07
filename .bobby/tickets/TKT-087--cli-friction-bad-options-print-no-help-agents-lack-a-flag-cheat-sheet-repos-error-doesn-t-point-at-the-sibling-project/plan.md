# TKT-087 plan — help after a bad option, a flag cheat sheet, a `--project` hint for sibling projects

Planned against origin/main `8cc1ddb`. Size: **s**.

## Approaches considered

| # | Approach | Effort (x3) | Risk (x2) | Maint. (x2) | Impact (x1) | Score |
|---|---|---|---|---|---|---|
| A | `.showHelpAfterError()` on the root `program` before any subcommand is registered (commander 12 copies it to every `.command()` child via `copyInheritedSettings`), a static cheat-sheet section in `CLAUDE.md.ejs` guarded by a drift test against the real commander options, and a split of the rejected-repos error into project hints + unknown repos | 5 | 4 | 4 | 3 | 34 |
| B | The same, but generate the cheat sheet from commander metadata at scaffold time | 2 | 3 | 4 | 3 | 23 |
| C | Call `showHelpAfterError()` on each subcommand by walking `program.commands` recursively after registration | 4 | 4 | 3 | 3 | 31 |

**Selected: A.** The inherit-at-creation path is commander's intended mechanism. `node_modules/commander/lib/command.js:98` copies `_showHelpAfterError` in `copyInheritedSettings`, and `.command()` calls it at line 164. Every Bobby subcommand is created with `.command()` (there is no `addCommand` in `commands/` or `lib/`), so one call covers the tree. The setting has to come **before** the `register*` calls. Today's `showSuggestionAfterError()` at line 137 runs after them, which is why setting help there would only affect the root. The drift test gives B's safety without B's generator.

## Files to modify

- `bin/bobby.js` (142 lines) — add `.showHelpAfterError()` to the `program` chain at lines 11–15.
- `templates/CLAUDE.md.ejs` — a new `## Ticket command flags` section between the end of `## Stay in the ticket` (line 127) and `## Workflows` (line 129).
- `commands/create.js` (90 lines) — the studio repos validation block (lines 37–45) and the `../lib/config.js` import on line 3 (add `listStudioProjects`).
- Tests: `test/commands/create.test.js` (studio cases), `test/commands/cli-help.test.js` (new), `test/lib/template.test.js` (cheat-sheet render + drift).

## Shared files (parallel build — keep edits additive and in these exact spots)

- `bin/bobby.js` — also edited by **TKT-084** (lines 111–120, a new hook inserted after line 120, and a new import after line 48). TKT-087 touches **only lines 11–15** (the `program` chain). Leave line 137 (`showSuggestionAfterError`) as is: it is redundant but harmless, and editing it is not needed.
- `templates/CLAUDE.md.ejs` — also edited by **TKT-084**, which inserts a studio bullet after line 112 inside `## Working Style`. TKT-087 inserts its section **after line 127** (the last `## Stay in the ticket` bullet, the "scope check" one) and before the blank line + `## Workflows`. Nothing else.
- `commands/create.js` — also edited by **TKT-083**, which adds an import line after line 7 and a guard line before line 52. TKT-087 changes **only line 3** and **lines 37–45**. Do not touch lines 4–36 or 46+.
- **Dependency check (TKT-084):** the `--project` hint needs only `listStudioProjects(root)`, which already exists in `lib/config.js:133`. It does not need 084's project listing or prefix inference. No ordering constraint. `--project <name>` already works today via `bin/bobby.js:111–120`.

## Step-by-step plan

### 1. `bin/bobby.js`

- [ ] Change the chain to:
  ```js
  program
    .name('bobby')
    .description('…')
    .enablePositionalOptions()
    // Before any subcommand is registered: commander copies this setting into
    // every .command() child at creation, so a bad option on ANY subcommand
    // prints that subcommand's help after the error (TKT-087).
    .showHelpAfterError()
    .version(pkg.version);
  ```
- [ ] Verify by hand: `node bin/bobby.js ticket create --bogus -t x` → stderr `error: unknown option '--bogus'` followed by `Usage: bobby ticket create [options]`, and exit 1. `node bin/bobby.js ticket move` (missing arg) → the error plus the move help.
- [ ] Check that the natural-language front door is unaffected: `bobby "add a thing"` still routes to `do`. Root help output (`bobby` with no args) is unchanged, because `showHelpAfterError` only acts on errors.

### 2. `templates/CLAUDE.md.ejs` — new section after line 127

```ejs

## Ticket command flags

`bobby <command> --help` lists every flag. These are the ones agents reach for:

- `bobby ticket create -t "<title>"`: `--type bug|feature|improvement|task`, `-p critical|high|medium|low`, `-a <your agent name>`, `--parent <epic ID>`, `--epic`, `--repos <a,b>`, `--size xs|s|m|l|xl`, `--workflow <name>`, `--found-in <ticket ID>`<% if (typeof studio !== 'undefined' && studio) { %>, `--project <name>` (a repo that is its own studio project is filed there, not listed in `--repos`)<% } %>
- `bobby ticket move <ID> <alias> ["reason"]`: aliases `plan`, `build`, `review`, `test`, `ship`, `done`, `reject "<reason>"`, `block "<reason>"`, `unblock`; `--by <who>` records who moved it
- `bobby ticket comment <ID> --by <who> "<note>"`
```

Keep it to these three bullets. The full list already lives in `WORKFLOW.md`.

### 3. `commands/create.js` — lines 37–45

- [ ] Line 3: add `listStudioProjects` to the existing `../lib/config.js` import.
- [ ] Replace the `bad` handling:
  ```js
  const bad = repos.filter(r => !allowed.includes(r));
  if (bad.length) {
    const projects = listStudioProjects(root);
    const siblings = bad.filter(r => projects.includes(r));
    const unknown = bad.filter(r => !projects.includes(r));
    for (const s of siblings) {
      error(`${s} is its own project: file it with --project ${s} (and drop it from --repos)`);
    }
    if (unknown.length) {
      error(`Ticket repos not in project '${config._project}' (${allowed.join(', ') || 'none'}): ${unknown.join(', ')}`);
    }
    process.exit(1);
  }
  ```
  A truly unknown repo keeps today's message verbatim (AC 3), only now listing the unknown names rather than the whole `bad` list. If a name is both in the repo group and a project, it is in `allowed` and never reaches here.

### 4. Tests

- [ ] `test/commands/cli-help.test.js` (new): spawn `node bin/bobby.js ticket create --bogus -t x` with `spawnSync` (it exits 1, and `execSync` would throw). Assert `status === 1`, stderr matches `/unknown option '--bogus'/`, and stderr contains `Usage: bobby ticket create`. Add a second case on a different depth (`bobby brief --bogus` → `Usage: bobby brief`) to prove it's every subcommand, not just `ticket`.
- [ ] `test/commands/create.test.js`, new `describe('studio --repos')`. A tmp studio via `initStudio` + `addRepo(app)` + `createProject('robinflow', { prefix: 'RF', repos: ['app'] })` + `createProject('robin-ops', { prefix: 'RO' })`. Run with `--project robinflow`:
  - `--repos robin-ops` → exit 1, stderr contains `robin-ops is its own project: file it with --project robin-ops`, does NOT contain `Ticket repos not in project`, and no ticket folder is created.
  - `--repos nope` → exit 1, stderr contains `Ticket repos not in project 'robinflow' (app): nope`.
  - `--repos app` → exit 0, `repos: [app]` in the frontmatter.
- [ ] `test/lib/template.test.js`: render `CLAUDE.md.ejs` (reuse the existing config at line 29). Assert it contains `## Ticket command flags` and each flag `--parent`, `--epic`, `--repos`, `-a <`, `--size`, `--workflow`, `--found-in`, plus `reject` and `unblock`. **Drift test:** build `new Command()`, call `registerCreate`, `registerMove`, `registerComment` on it, collect `cmd.options.map(o => o.long || o.short)`, extract every `` `--flag`/`-x` `` token from the rendered section, and assert each one exists on its command. This catches the cheat sheet teaching a flag that doesn't exist, which is the original complaint. With `studio: 'S'`, assert `--project <name>` appears; without it, assert it doesn't.
- [ ] Full suite to a log and read the summary. Watch for tests that assert exact stderr of a commander error (`grep -rn "unknown option\|error: missing" test/`). Those now also get help text appended, so update the ones that use exact equality to `toMatch`.

## Risk areas

- **Exact-stderr assertions** in existing tests (see the last step).
- **`process.exit` paths inside actions** are unaffected. `showHelpAfterError` only fires for commander's own parse errors (unknown option, missing argument, missing required option), not for `error(...)` + `process.exit(1)` inside an action.
- **`--project` is spliced out of argv** before parse (`bin/bobby.js:114–119`), so the new hint's suggested `--project` can never itself trigger an unknown-option error.

## Out of scope

- Commander suggestions for mistyped commands (already on by default).
- A generated, exhaustive CLI reference.
