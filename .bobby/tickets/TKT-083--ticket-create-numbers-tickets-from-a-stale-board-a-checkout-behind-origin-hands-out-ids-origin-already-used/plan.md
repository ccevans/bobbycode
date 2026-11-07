# TKT-083 plan — refuse to number tickets from a board that is behind its upstream

Planned against origin/main `8cc1ddb`. Size: **m**.

## Approaches considered

| # | Approach | Effort (x3) | Risk (x2) | Maint. (x2) | Impact (x1) | Score |
|---|---|---|---|---|---|---|
| A | New `lib/board-upstream.js`: commands that create tickets (`ticket create`, `go "<text>"`) fetch + refuse when behind; `nextId()` reads the upstream tree's highest ID from the already-fetched remote-tracking ref (no network); `brief` prints the behind line | 4 | 4 | 4 | 5 | 33 |
| B | Put fetch + behind check inside `nextId()` itself so every caller (CLI, dashboard, `bobby new`, sprints) is guarded | 4 | 2 | 3 | 5 | 27 |
| C | Reserve numbers by pushing on create | 1 | 2 | 3 | 5 | 16 (out of scope by CC) |

**Selected: A.** Network stays in the command layer, where a refusal can be printed and exit 1. `nextId()` gets the cheap, offline half (the upstream floor), so the dashboard and any other `createTicket` caller can never hand out an ID upstream already used, and none of them pick up a network call. B would put a network fetch into every unit test that creates a ticket, and into the dashboard's request path.

## Decisions made while planning (within CC's approved direction)

1. **"Behind" means commits that touch the board directory**: `git rev-list --count HEAD..<upstream> -- <board dir>`. Commits that only touch code can't collide IDs. Counting them would make every `ticket create` in bobbycode need a pull after any code push. In a studio, the count is limited to `.bobby/<project>/tickets`, so another project's board moving doesn't block this one. AC 1 is reworded to match (see ticket.md).
2. **`bobby new` needs no code change.** `createProject` always runs `git init` in a brand-new directory (`commands/init.js` `ensureGitRepo`, `lib/project.js:123`), so the only board it writes has no upstream by construction. A fetch there would be dead code. A test pins that `bobby new` still works when run from inside a checkout that is behind.
3. **`bobby brief` fetches too**, so the line is true rather than as old as the last fetch. Brief is read-only, so a fetch failure there does not abort the brief. It prints an explicit lead line instead: `Board freshness unknown: could not fetch origin (<git's reason>)`. That is a visible state, not a silent substitute. `ticket create` / `go` still hard-error on a fetch failure, per CC.
4. **Upstream exists in config but the remote branch doesn't exist yet** (a branch set up with `-u` before its first push, or a remote branch that was deleted): after a successful fetch, `rev-parse --verify <tracking ref>` fails. That means there is nothing to be behind and no upstream tree. Treat it the same as no upstream (AC 4).
5. **Concurrent fetches in one repo** (parallel sessions) can fail with `cannot lock ref`. Retry the fetch up to 3 times, 500 ms apart, only for stderr matching `/cannot lock ref|Unable to create '.*\.lock'/`. Then error. This is a retry, not a fallback.

## Files to modify

- `lib/board-upstream.js` — **new**. All git logic. Uses `execFileSync('git', [...], { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })`, never a shell string.
- `lib/counter.js` (84 lines) — `nextId()` adds the upstream floor after the `highestOnDisk` block (lines 27–34).
- `commands/create.js` (90 lines) — one import, one guard call before `createTicket` (line 52).
- `commands/go.js` (91 lines) — one import, one guard call before `createTicket` in the `what.length > 0` branch (line 58).
- `commands/brief.js` (125 lines) — one import, one call that prints the lead line.
- `test/lib/board-upstream.test.js` — **new**.
- `test/commands/create.test.js`, `test/commands/go.test.js`, `test/commands/new.test.js` — add cases (below).
- `test/commands/brief-freshness.test.js` — **new**, for the brief cases. Use this exact name: TKT-085 creates `test/commands/brief-owners.test.js`, so the two never collide.

Not touched: `lib/auto-sync.js` (it stays commit-only), `commands/new.js`, `lib/brief.js`, `lib/dashboard/*`.

## Shared files (parallel build — keep edits additive and in these exact spots)

- `commands/create.js` — also edited by **TKT-087**, which changes the repos-rejected block (lines 37–45) and the `../lib/config.js` import on line 3. TKT-083 must NOT touch lines 3 or 33–45. Add the new import as a new line **after line 7** (`import { tryLogEntry } ...`). Add the guard call as a new line **directly before line 52** (`const result = createTicket(...)`).
- `commands/brief.js` — also edited by **TKT-085**, which changes the import on line 3 and replaces the "In flight" block (lines 68–77). TKT-083 must NOT touch lines 3 or 64–125. Add the import as a new line **after line 6**. Add the call as one new line **directly after line 62** (`const b = buildBrief(...)`), before the first `console.log('')`. Print the lead line before the title (it "leads").
- No dependency on another ticket in this batch.

## Step-by-step plan

### 1. `lib/board-upstream.js` (new)

- [ ] `git(args, cwd)`: thin wrapper over `execFileSync`. A child that exits non-zero throws an Error that carries `status` and `stderr`. A spawn failure (no numeric `status`, e.g. ENOENT) is rethrown untouched. Callers branch on `status`, as `lib/studio.js addRepo` does.
- [ ] `boardUpstream(ticketsDir)` → `null` or `{ repoRoot, remote, remoteBranch, trackingRef, label, relDir }`:
  - `cwd` = `ticketsDir` if it exists, else its nearest existing ancestor.
  - `git rev-parse --show-toplevel`. A non-zero exit (not a git repo) returns `null`.
  - `git symbolic-ref -q --short HEAD`. A non-zero exit (detached HEAD) returns `null`.
  - `git config --get branch.<b>.remote` and `branch.<b>.merge`. If either is missing (exit 1), return `null`: no upstream, today's behaviour.
  - `remote === '.'` (a local upstream branch): `trackingRef = merge ref`, nothing to fetch (`remote: null`).
  - Otherwise `remoteBranch = merge.replace(/^refs\/heads\//, '')`, `trackingRef = refs/remotes/<remote>/<remoteBranch>`, `label = <remote>/<remoteBranch>`.
  - `relDir = path.relative(fs.realpathSync(repoRoot), fs.realpathSync(ticketsDir))` (realpath on both sides, because macOS tmpdirs sit behind the `/var` → `/private/var` symlink). If it starts with `..`, the board is outside the repo: return `null`.
- [ ] `fetchUpstream(up)`: no-op when `up.remote` is null. Otherwise `git fetch --quiet <remote> +refs/heads/<remoteBranch>:<trackingRef>`, with an explicit refspec so the tracking ref updates even under a custom fetch refspec, and `timeout: 30000`. Retry per decision 5. On failure throw `Could not fetch <remote> (<url from git remote get-url, if readable>) to check the board is current: <first stderr line>. Fix the remote or your access, then retry.` On timeout: `Fetching <remote> timed out after 30s ...`.
- [ ] `trackingExists(up)`: `git rev-parse --verify -q <trackingRef>`. Exit 1 means false.
- [ ] `commitsBehind(up)`: returns 0 if `!trackingExists`. If `git rev-parse --verify -q HEAD` fails (unborn branch), use `git rev-list --count <trackingRef> -- <relDir>`. Otherwise `git rev-list --count HEAD..<trackingRef> -- <relDir>`. Returns a number.
- [ ] `upstreamHighestId(ticketsDir, prefix)` (no network): `up = boardUpstream(ticketsDir)`. Returns 0 if `!up` or `!trackingExists(up)`. Otherwise `git ls-tree --name-only <trackingRef> -- <relDir>/` (`relDir` is '' when the board is the repo root: use `.`). Take `path.basename` of each line, match `^<prefix>-(\d+)--`, return the max.
- [ ] `assertBoardCurrent(ticketsDir)`: `up = boardUpstream(...)`. If `!up`, return. Otherwise `fetchUpstream(up)`, `n = commitsBehind(up)`. If `n > 0`, throw `Board is <n> commit(s) behind <label>; it may hand out a ticket ID <label> already used. Pull first: git -C <repoRoot> pull --rebase <remote> <remoteBranch>`. For `remote === '.'`, say `git -C <repoRoot> rebase <branch>`.
- [ ] `boardFreshness(ticketsDir)` for brief, returns one of `{ state: 'none' } | { state: 'current' } | { state: 'behind', count, label } | { state: 'unknown', reason }`. Same calls as above. A fetch error becomes `unknown` with the error message. It never throws for a fetch error, but still throws for a spawn failure.

### 2. `lib/counter.js`

- [ ] `import { upstreamHighestId } from './board-upstream.js';`
- [ ] After line 34 (`if (highestOnDisk > candidate) candidate = highestOnDisk;`), add the floor: `const highestUpstream = upstreamHighestId(ticketsDir, prefix); if (highestUpstream > candidate) candidate = highestUpstream;` with a one-line comment (TKT-083: never allocate at or below what upstream already holds). No fetch here.
- Sprints also call `nextId` (`lib/sprint.js:107`). The floor applies to them too, which is correct and harmless.

### 3. `commands/create.js`

- [ ] New import line after line 7: `import { assertBoardCurrent } from '../lib/board-upstream.js';`
- [ ] New line before line 52: `assertBoardCurrent(ticketsDir);`. It throws, and the existing catch prints `error(e.message)` and exits 1. It runs after the cheap local validations (repos, --found-in), so an invalid-input error never waits on the network, and before anything is written, so nothing is created (no folder, no `.counter` change).

### 4. `commands/go.js`

- [ ] Import after line 12. In the `what.length > 0` branch, call `assertBoardCurrent(ticketsDir);` as the first statement, before `createTicket`. `go` with no args, and `go <ID>`, create nothing, so they get no guard.

### 5. `commands/brief.js`

- [ ] Import after line 6: `import { boardFreshness } from '../lib/board-upstream.js';`
- [ ] After line 62 add `printFreshness(boardFreshness(ticketsDir));`. Define `printFreshness` as a small function at the bottom of the file (below `registerBrief`, away from TKT-085's edits):
  - `behind` → blank line, then `  ⚠ Board is N commit(s) behind <label> — pull before creating tickets` (use `warn` styling from `lib/colors.js`, or bold + the existing colours).
  - `unknown` → blank line, then `  ⚠ Board freshness unknown: <reason>`.
  - `none` / `current` → print nothing.
- `studioBrief()` (`--all`) is unchanged.

### 6. Tests (see test-cases.md for the full list)

- [ ] Fixture helper: there is no `test/helpers/` dir, so write a local `makeBoardRepos()` function in each test file that needs it, and keep it short:
  - `git init --bare origin.git`. Clone A with `git init -b main`, write `.bobbyrc.yml` + `.bobby/tickets/.counter`, commit, `git remote add origin`, `git push -u origin main`. Then `git clone origin.git B`.
  - Git identity is already provided by `test/setup.js` (GIT_AUTHOR_*/GIT_COMMITTER_* env), so no per-call `-c user.*` is needed.
  - Everything is local paths. No network.
- [ ] Run the full suite to a log (`npm test > /tmp/... 2>&1`) and read the summary. Adding git spawns to `nextId` adds a few ms per ticket created in tests. Check that no suite times out.

## Risk areas

- **Tests with a ticketsDir inside the bobbycode checkout itself** would now read bobbycode's real `origin/main`. Grep `test/` for `createTicket(`/`nextId(` with a relative or repo-local dir. Expected: none (all tests use `mkdtemp`).
- **macOS symlinked tmpdirs** break `path.relative` against `--show-toplevel`. Realpath both sides (step 1).
- **The board inside a gitignored `.bobby/`** (some users ignore it): `rev-list -- <dir>` counts 0 and `ls-tree` lists nothing. That gives today's behaviour, which is correct.
- **Fetch latency** (~0.5–2 s) on every `ticket create` and `brief`. CC accepted this. The 30 s timeout bounds a hung SSH prompt.
- **`go` re-exec**: the guard runs in the parent before `exec(['run', ...])`, so the child never runs on a refused create.

## Dependencies

None. Independent of TKT-084..087. TKT-084's ID-prefix inference picks the project before `resolveTicketsDir`, so in a studio the guard runs against the right project board with or without 084.

## Out of scope

- Reserving numbers by pushing on create (CC deferred).
- `lib/auto-sync.js` fetching or pushing.
- The dashboard's create endpoint fetching (it gets the offline upstream floor via `nextId`).
- `bobby brief --all` freshness per project.
