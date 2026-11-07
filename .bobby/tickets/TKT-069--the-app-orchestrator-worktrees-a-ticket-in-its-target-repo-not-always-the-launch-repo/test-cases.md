# Test Cases — TKT-069

Two suites. Fast unit tests drive `_resolveTargetRepo` directly (no git) for the
precedence + Decision-1 logic. Integration tests use real git repos (the
`initRepo` pattern from `test/lib/dashboard/worktree.test.js` — `fs.mkdtempSync` +
`git init -b main`) and call the real `orchestrator.createWorkspace` /
`merge` / `getDiff`, asserting the worktree, branch, lock and diff land in the
resolved repo. The orchestrator FSM is exercisable without a real agent (fake
`_runExecutor`, per `orchestrator-fsm.test.js`); these tests do not need to spawn
one because they assert on git state, not agent output.

Suggested new file: `test/lib/dashboard/orchestrator-repo-target.test.js`.

**Studio fixture** (shared setup): a temp studio root containing two real git
repos, `repos/launch` and `repos/pro`, each `initRepo`'d. Orchestrator constructed
with `repoRoot: studioRoot`, `config` = `{ studio: 'studio', repo_group: { launch:
{ path: 'repos/launch' }, pro: { path: 'repos/pro' } }, project_repos: ['launch'],
dashboard: { worktree_root: '../wt' }, git_conventions: {} }`, and a `ticketsDir`
under the studio board. Tickets are created on the shared board with
`createTicket(ticketsDir, { …, repos })`.

---

## TC1 — a ticket targeting a NON-launch repo worktrees + ships in that repo (key AC)

**Type:** integration (real git). **Covers AC:** "worktree, branch, lock and diff
against the resolved repo"; "a ticket targeting bobbycode-pro ships in bobbycode-pro".

**Preconditions:** studio fixture above. A ticket `TKT-100` created on the board
with `repos: ['pro']`, moved to `planning`.

**Steps:**
1. `ws = o.createWorkspace({ ticketId: 'TKT-100', agent: 'plan' })`.
2. Read `ws.repoRoot`, `ws.lockFile`, `ws.worktreePath`, `ws.branch`.
3. `listWorktrees(proPath)` and `listWorktrees(launchPath)`.
4. (ship path) commit a change on `ws.branch` inside `ws.worktreePath`, then
   `o.getDiff(ws.id)` and `o.merge(ws.id)`.

**Expected:**
- `ws.repoRoot === proPath` (the pro repo), NOT `launchPath`.
- `ws.lockFile === mainCheckoutLockPath(proPath, config)` — under `proPath/.bobby`.
- `ws.worktreePath` resolves under `resolveWorktreeRoot(proPath, config)`.
- `listWorktrees(proPath)` contains `ws.branch`; `listWorktrees(launchPath)` does NOT.
- `o.getDiff(ws.id)` returns the diff computed against `pro`'s main and includes the
  committed change; `o.merge(ws.id)` lands the branch in `pro`'s main
  (`git log` on `proPath` main shows the merge) and `launchPath` main is untouched.

---

## TC2 — single-repo / non-studio case is byte-identical (regression guard)

**Type:** integration (real git). **Covers AC:** "the single-repo case is unchanged".

**Preconditions:** ONE real git repo `launch`. Orchestrator with
`repoRoot: launchPath`, config `{}` (no `studio`, no `repo_group`). A ticket
`TKT-200` on the board with NO `repos` frontmatter, in `planning`.

**Steps:**
1. `ws = o.createWorkspace({ ticketId: 'TKT-200', agent: 'plan' })`.
2. Inspect `ws.repoRoot`, `ws.lockFile`, `ws.worktreePath`, and
   `listWorktrees(launchPath)`.

**Expected:**
- `ws.repoRoot === launchPath === o.repoRoot` and `ws.lockFile === o.lockFile`
  (resolution was skipped — no studio).
- `ws.worktreePath` / `ws.branch` are exactly what `computeWorktreePlacement(
  launchPath, config, 'TKT-200', 'plan')` returns — identical to pre-change output.
- `listWorktrees(launchPath)` contains `ws.branch`. No second repo exists to leak into.

---

## TC3 — a ticket naming TWO repos is refused at `createWorkspace` (Decision 1)

**Type:** integration (real git, but throws before creating a worktree).
**Covers AC:** "the two-repo-per-ticket question is decided and recorded".

**Preconditions:** studio fixture. A ticket `TKT-300` with `repos: ['launch', 'pro']`,
in `planning`.

**Steps:**
1. Call `o.createWorkspace({ ticketId: 'TKT-300', agent: 'plan' })` and capture the throw.
2. `listWorktrees(launchPath)` and `listWorktrees(proPath)`.
3. `o.store.get(...)` / list workspaces.

**Expected:**
- `createWorkspace` throws; message names `TKT-300` and both repo names and tells the
  user to split the ticket or narrow `repos`.
- NO worktree was created in `launch` or `pro` (both `listWorktrees` unchanged) and
  NO workspace record was stored — the refusal is before any state is written.

---

## TC4 — lock isolation: a run in repo A does not block a run in repo B (Decision 2 / lock)

**Type:** integration (real git). **Covers AC:** "lock keys off the resolved repo".

**Preconditions:** studio fixture. Ticket `TKT-401` with `repos: ['launch']` and
`TKT-402` with `repos: ['pro']`, both in `planning`; a workspace created for each.

**Steps:**
1. Confirm the two workspaces resolved to different lock files:
   `wsA.lockFile !== wsB.lockFile`.
2. Acquire `launch`'s lock directly:
   `acquireMainCheckoutLock(wsA.lockFile, { holder: 'test' })` and hold it.
3. While A's lock is held, run `o.merge(wsB.id)` (or acquire `wsB.lockFile` directly).

**Expected:**
- `wsA.lockFile` and `wsB.lockFile` are distinct paths (under `launch/.bobby` and
  `pro/.bobby` respectively).
- Acquiring/holding A's lock does NOT throw or block B: B's merge (or B's lock
  acquisition) succeeds while A's lock is still held. A second acquire of the SAME
  lock (A again) still throws `heldMessage` — proving the lock works, just per-repo.

---

## TC5 — precedence: `repos` > `project_repos` > `this.repoRoot` (unit)

**Type:** unit (no git — call `o._resolveTargetRepo(ticket)` directly).
**Covers:** the resolution rule and the fallback chain.

**Preconditions:** studio config with `repo_group` `{ launch, pro }`,
`project_repos: ['launch']`. Build ticket objects in-memory
(`{ data: { repos } }`) — no board or git needed.

**Steps / Expected (one assertion each):**
- Ticket `repos: ['pro']` → `{ repoRoot: proPath, lockFile: mainCheckoutLockPath(proPath) }`.
- Ticket `repos: null` (studio, `project_repos: ['launch']`) → resolves to `launchPath`.
- Ticket `repos: null` AND `project_repos: []` → falls back to `this.repoRoot` /
  `this.lockFile` unchanged.
- Non-studio config (`{}`), any ticket → falls back to `this.repoRoot` / `this.lockFile`
  (resolution skipped; `resolveRepoPath` never called, so no throw on empty group).

---

## TC6 — unknown repo name is a diagnosable error (error path)

**Type:** unit. **Covers:** error wrapping around `resolveRepoPath`.

**Preconditions:** studio config with `repo_group` `{ launch, pro }`.

**Steps:** `o._resolveTargetRepo({ data: { repos: ['nope'] } })`.

**Expected:** throws; the message names the offending repo (`nope`) AND the ticket
context, not a bare "not in the studio's repo group" with no ticket to trace it to.

---

## TC7 — persisted workspace without `ws.repoRoot` still merges/diffs (fallback guard)

**Type:** integration (real git). **Covers:** the `|| this.repoRoot` fallback for
records written before the upgrade.

**Preconditions:** single-repo `launch`. Create a workspace, then delete
`repoRoot`/`lockFile` off the stored record (simulate a pre-upgrade JSON record):
`o.store.update(ws.id, { repoRoot: undefined, lockFile: undefined })` (or seed a
record via `newWorkspace` without the fields).

**Steps:** commit a change on the branch, then `o.getDiff(ws.id)` and `o.merge(ws.id)`.

**Expected:** both operate against `this.repoRoot` (the launch repo) without error —
the missing fields degrade to the constructor defaults, exactly today's behavior.
