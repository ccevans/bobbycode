# TKT-084 plan — infer the studio project from the ticket ID and the folder

Planned against origin/main `8cc1ddb`. Size: **m**.

## Approaches considered

| # | Approach | Effort (x3) | Risk (x2) | Maint. (x2) | Impact (x1) | Score |
|---|---|---|---|---|---|---|
| A | One `preAction` hook in `bin/bobby.js` reads the ticket-ID arguments commander already parsed, maps the prefix to a project, and sets `BOBBY_PROJECT` (the same channel `--project` uses). The cwd and main-worktree rungs go into `resolveActiveProject`. | 4 | 4 | 4 | 5 | 33 |
| B | Raw `process.argv` scan for ID-shaped tokens before parse | 5 | 2 | 3 | 5 | 30 |
| C | Per-command: each ticket command passes its `id` into `readConfig(root, { id })` | 2 | 3 | 3 | 5 | 23 |

**Selected: A.** B is cheaper but can't tell a ticket ID from free text. `bobby go fix utf-8 parsing` has the token `utf-8`, `bobby pack info react-18` has `react-18`, and sprint IDs are `SPR-001`. Each of those would become a false "unknown prefix" error. A only reads arguments that are ticket IDs by name (see the allowlist) and still sits in one place in `bin/bobby.js`, as CC's direction says ("happens once before dispatch"). C rewires every command, which the ticket rules out.

## Resulting precedence (CC-approved)

`--project` > `BOBBY_PROJECT` > ticket-ID prefix in the args > cwd under `<studio>/worktrees/<project>/` > `.bobby/active-project` in the MAIN worktree root > sole project > null (the existing actionable error).

`--project` and the ID rung both deliver through `process.env.BOBBY_PROJECT`, so child processes (`go` → `run workflow`) inherit the choice. The ID rung only writes the env var when it is unset, which keeps env above it.

## Files to modify

- `lib/project-infer.js` — **new**: `ticketIdsFromCommand(cmd)` and `inferProjectFromIds(studioRoot, ids)`.
- `bin/bobby.js` (142 lines) — the `--project` block (lines 111–120) and one new `preAction` hook directly after it.
- `lib/config.js` (654 lines) — `resolveActiveProject` (lines 141–158): add the cwd rung and the main-worktree read. Rewrite the `studioBoardDir` hint text (lines 596–598).
- `lib/studio.js` (222 lines) — `setActiveProject` / `getActiveProject` (lines 135–142) use the main worktree root. Import change on line 9.
- `commands/learn.js` — hint text at line 90 only.
- `templates/CLAUDE.md.ejs` — one studio-only bullet at the end of `## Working Style`.
- Tests: `test/lib/studio.test.js` (extend the precedence test), `test/lib/project-infer.test.js` (new), `test/commands/studio.test.js` (CLI cases).

## Shared files (parallel build — keep edits additive and in these exact spots)

- `bin/bobby.js` — also edited by **TKT-087** (adds `.showHelpAfterError()` to the `program` chain at lines 11–15, and may touch line 137). TKT-084 edits ONLY lines 111–120, plus new lines inserted directly after line 120, plus one new import line inserted **after line 48** (`import { touchProject } ...`). Do not touch lines 1–47 or 121–142.
- `templates/CLAUDE.md.ejs` — also edited by **TKT-087**, which adds a cheat-sheet block after `## Stay in the ticket` (around line 128). TKT-084 inserts its bullet **directly after line 112** (the "ticket stage is the sole progress tracker" bullet), before the blank line and `## Stay in the ticket`. Nothing else.
- `lib/studio.js` — also edited by **TKT-086** (adds one string to the `needed` array on line 100). TKT-084 changes only line 9 (the import) and lines 135–142. Leave line 100 alone.
- Dependencies: none. TKT-087's `--repos` hint uses `listStudioProjects`, which already exists. It does not need anything from this ticket.

## Step-by-step plan

### 1. `lib/project-infer.js` (new)

- [ ] `const ID_RE = /^([A-Za-z]+)-\d+$/;`
- [ ] `ticketIdsFromCommand(cmd)`. `cmd` is commander's `actionCommand` (commander 12.1: `cmd.registeredArguments[i].name()` and `cmd.processedArgs[i]`). Collect values from this **allowlist** only:
  - arg `ticketIds` or `epicId` on any command (`run`, `sprint add/rm/new`, `blueprint`);
  - arg `id` / `ids` when `cmd.parent?.name()` is `ticket` or `worktree` (ticket view/move/assign/attach/comment/update/archive, worktree create/path/remove);
  - arg `id` when `cmd.name() === 'retro'`;
  - arg `what` when `cmd.name() === 'go'` **and** it has exactly one element (mirrors `go`'s own `looksLikeTicketId` rule);
  - options `parent` and `foundIn` from `cmd.opts()` (so `ticket create --found-in RF-12` files on RF's board).
  
  Flatten variadic arrays, keep strings matching `ID_RE`, and return them. Sprint `<id>`, pack `<id>`, session `<id>` and `do`/`vet`/`new` free text are never read.
- [ ] `inferProjectFromIds(studioRoot, ids)`:
  - No ids → `null`.
  - Build `prefix → [projects]` from `listStudioProjects(studioRoot)` with `configForProject(studioRoot, p).ticket_prefix` (the same cascade `readConfig` uses, so no second copy of the prefix precedence). Compare case-insensitively (upper).
  - For each id: no project uses its prefix → throw `<ID>: no project in this studio uses prefix <P>. Projects: <name> (<PREFIX>), … — pass --project <name>`. More than one project uses it → throw `Prefix <P> is used by more than one project (<a>, <b>): pass --project <name>`.
  - Ids that resolve to more than one distinct project → throw `<RF-1> is robinflow, <BOB-2> is bobby: pass --project <name>`.
  - Otherwise return the single project.

### 2. `bin/bobby.js`

- [ ] `--project` must beat `BOBBY_PROJECT` (AC 4). Today line 116's `!process.env.BOBBY_PROJECT` makes the env win and leaves `--project` in argv. Change the condition to `if (i !== -1 && process.argv[i + 1])`, so it always sets `process.env.BOBBY_PROJECT = process.argv[i + 1]` and always splices. Update the comment above it.
- [ ] New import line after line 48: `import { ticketIdsFromCommand, inferProjectFromIds } from '../lib/project-infer.js';`. `findProjectRoot` comes from `../lib/config.js` and `isStudio` from `../lib/studio.js`, both on the same new line or the next one.
- [ ] New block directly after line 120:
  ```js
  // Studio: a ticket ID names its project (RF-12 → the project whose prefix is RF),
  // so agents don't need `bobby project use` first (TKT-084). Env (incl. --project) wins.
  program.hook('preAction', (_root, actionCommand) => {
    if (process.env.BOBBY_PROJECT) return;
    const ids = ticketIdsFromCommand(actionCommand);
    if (ids.length === 0) return;
    let root;
    try { root = findProjectRoot(); } catch { return; } // outside a project: the command itself reports it
    if (!isStudio(root)) return;
    try {
      const p = inferProjectFromIds(root, ids);
      if (p) process.env.BOBBY_PROJECT = p;
    } catch (e) { error(e.message); process.exit(1); }
  });
  ```
  `error` comes from `../lib/colors.js`. The `findProjectRoot` catch is not a fallback: outside a project there is nothing to infer, and the action prints its own "Not a Bobby project" error.

### 3. `lib/config.js` — `resolveActiveProject(rootDir, explicit, { cwd = process.cwd() } = {})`

- [ ] Keep the existing explicit and env rungs. After env, add:
  - **cwd rung:** `rel = path.relative(realpath(rootDir), realpath(cwd))`. If `rel` doesn't start with `..`, split it on `path.sep`. If `parts[0] === 'worktrees' && parts[1]` and `listStudioProjects(rootDir).includes(parts[1])`, return `parts[1]`. Wrap `realpathSync(cwd)` defensively: if cwd was deleted, `fs.realpathSync` throws ENOENT, so skip the rung then.
  - **main-worktree rung:** `const mainRoot = findMainWorktreeRoot(rootDir) || rootDir;` and read `.bobby/active-project` from `mainRoot`, not `rootDir`. `findMainWorktreeRoot` is a function declaration in the same module, so it is hoisted and fine to call.
- [ ] Keep the sole-project and null rungs. Update the doc comment's precedence line to the full chain above, and note that the ID rung lives in `bin/bobby.js` and arrives via `BOBBY_PROJECT`.
- [ ] `studioBoardDir` hint (lines 596–598), new text: ``Select a project: name a ticket ID (e.g. ${firstPrefix}-1), pass --project <name>, or run from worktrees/<project>/. Projects: ${all.join(', ')}`` (`firstPrefix` is optional; plain "a ticket ID" is fine). Do not lead with `bobby project use`. It may stay as a trailing "or set a default: `bobby project use <name>`".
- Unchanged: `studioBoardDir` still resolves the board under `root`, not the main root. A studio git worktree on a tickets branch (`worktrees/newsletter-v2-tickets`, branch `tickets/newsletter-v2`) files on its own branch's board on purpose. That is how the RF-1358.. refile worked.

### 4. `lib/studio.js`

- [ ] Line 9 → `import { listStudioProjects, findMainWorktreeRoot } from './config.js';`
- [ ] `setActiveProject` / `getActiveProject`: compute `const base = findMainWorktreeRoot(root) || root;` and read/write `path.join(base, '.bobby', 'active-project')`. Without this, `bobby project use` run inside a studio worktree writes a file that step 3 no longer reads, which would be a silent no-op. `setActiveProject`'s membership check keeps using `listStudioProjects(root)`.

### 5. Shipped text

- [ ] `commands/learn.js:90` → `Select a project (a ticket ID, --project <name>, or BOBBY_PROJECT)`.
- [ ] `templates/CLAUDE.md.ejs`: after line 112, a studio-only bullet:
  ```ejs
  <% if (typeof studio !== 'undefined' && studio) { -%>
  - **Studio projects:** a ticket command picks its project from the ticket ID (`RF-12` → the project whose prefix is `RF`) or from `worktrees/<project>/`, so no project switch is needed first. Pass `--project <name>` only to a command that names no ticket (e.g. `bobby ticket create`, `bobby ticket list`).
  <% } -%>
  ```
  `templateData` spreads `config`, so `studio` is set for a studio (see `commands/init.js:165`).
- Audit result: no shipped template under `templates/` tells agents to run `bobby project use` (grep `project use` in `templates/`: the only hit is unrelated). The habit came from the studio's own user-owned `robinflow-campaign-launch` skill, which this repo does not ship. **Report it, don't edit it** (it is outside this repo and outside the ticket).

### 6. Tests (see test-cases.md)

- [ ] `test/lib/project-infer.test.js`: unit tests for `inferProjectFromIds` (match, unknown, ambiguous prefix, mixed projects, lower-case id). For `ticketIdsFromCommand`, build a tiny commander program in the test (`ticket view <id>`, `go [what...]`, `sprint run <id>`, `ticket create --found-in`) and call `parse` with `{ from: 'user' }` and a stub action. Assert which IDs are collected.
- [ ] Extend `test/lib/studio.test.js` "active-project selection precedence" with the cwd rung (pass `{ cwd }`) and the main-worktree rung. That needs a real git studio: `git init`, commit, `git worktree add <root>/wt-x -b x`, then `setActiveProject(root, 'beta')` and `resolveActiveProject(<root>/wt-x)` → `beta`.
- [ ] `test/commands/studio.test.js` CLI cases: ID inference from the studio root and from `repos/` with no active-project file; `--project` beats `BOBBY_PROJECT`; unknown prefix exits 1 naming the projects.
- [ ] Full suite to a log and read the summary. `test/lib/dashboard/project-context.test.js` and `orchestrator-project-pin.test.js` exercise `resolveActiveProject` and must stay green.

## Risk areas

- **`readConfig` cost:** the main-worktree rung adds two `git rev-parse` spawns to studio `readConfig` calls that get that far. The rung is reached only when no `--project`, env or ID applies. The dashboard pins projects via `BOBBY_PROJECT` / `configForProject`. Acceptable, but do not call `findMainWorktreeRoot` before the cheaper rungs.
- **jest cwd:** tests run with cwd = the bobbycode repo, so the cwd rung must ignore a `rel` that starts with `..` (tmp studios live elsewhere).
- **commander internals:** `registeredArguments` / `processedArgs` are public in commander 12. If either is missing, `ticketIdsFromCommand` must return `[]`, not throw, and a unit test pins this.
- **Help/`--help` paths:** `preAction` doesn't fire for help, so there is no inference error on `bobby ticket view --help`.

## Out of scope

- Making studio boards resolve to the main worktree's board (see step 3).
- Editing the studio's user-owned skills that still say `bobby project use`.
- `--project=<name>` (equals form) parsing.
