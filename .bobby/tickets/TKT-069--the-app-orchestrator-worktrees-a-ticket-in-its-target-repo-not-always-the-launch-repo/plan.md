# Plan — TKT-069: orchestrator worktrees a ticket in its TARGET repo

## Problem

`Orchestrator` is single-repo by construction. It takes one `repoRoot` at
construction (`commands/app.js` passes `findProjectRoot()`), and every worktree,
lock, branch and diff is computed against that one root. Nothing reads a ticket's
target repo — `grep -r '\.repos' lib/dashboard/` is empty. In a studio, the board
lives at the studio root but a ticket's *code* can live in another repo of the
group (e.g. `bobbycode-pro`). Today the orchestrator would worktree and ship that
ticket in the launch repo, manufacturing a dead branch in the wrong place (the
TKT-023 failure).

## Goal

Resolve each run's TARGET repo from the ticket once, at `createWorkspace`, store
it on the workspace record, and make every per-workspace git operation (worktree,
branch, lock, diff, merge, discard) act against THAT repo. The single-repo /
non-studio case must be byte-behavior-identical to today.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|:-:|:-:|:-:|:-:|:-:|
| A | Resolve once at `createWorkspace`, store `ws.repoRoot` + `ws.lockFile`; every per-workspace op reads `ws.repoRoot` (falls back to `this.repoRoot`). `this.repoRoot` stays the default. | 5 | 5 | 5 | 4 | **49** |
| B | Resolve on every call site (getDiff, merge, discard, …) by re-reading the ticket's `repos` each time. | 3 | 3 | 2 | 4 | 33 |
| C | Construct a fresh Orchestrator per target repo (multi-orchestrator registry). | 1 | 2 | 3 | 4 | 26 |

**Selected: A.** It resolves the repo exactly once, at the single point where the
worktree/branch are already computed from `this.repoRoot`, and threads the result
through the workspace record the FSM already carries everywhere. B re-derives the
same answer on every read (a ticket's `repos` could even change under it, giving
two ops two different repos for one workspace — incoherent). C is a large blast
radius — concurrency cap, lock registry, SSE hub and process map are all
per-orchestrator, and splitting them per repo rewrites the run loop. A is the
smallest change that makes the workspace the unit that knows its repo.

## Design decisions (settle + record)

### Decision 1 — a ticket that names TWO repos → HARD ERROR at `createWorkspace`

**v1 is one repo per ticket.** If `ticket.data.repos` has more than one entry,
`createWorkspace` throws before any worktree or token is spent, with a message
that names the ticket and the repos and tells the user to split the ticket or
narrow `repos` to the one the code lives in. Two-worktrees-one-workspace is out
of v1 scope.

**Why error, not take-first:** the entire purpose of this ticket is *shipping in
the right repo*. A two-repo ticket has no single right repo; taking the first and
proceeding would ship only repo A's work while the ticket claims both — the exact
silent-wrong-repo class this ticket exists to kill. Refusing early with an
actionable message is the established pattern in this codebase (the concurrency
cap in `_assertConcurrencyHeadroom`, the lock's `heldMessage`, `_assertRepoRunnable`):
refuse before you spend, name what is wrong, name the way out. Take-first was the
rejected alternative because a "warning" on a workspace that still runs is exactly
the kind of not-quite-silent half-ship the no-op guard (TKT-062) was added to stop.

Record in `.bobby/decisions.yaml` as `one-repo-per-ticket-v1`.

### Decision 2 — single-repo / non-studio case is byte-identical (regression guard)

This is not a feature, it is the invariant the change must preserve. When there is
no studio (`!config.studio` and an empty `repo_group`), repo resolution is skipped
entirely: `ws.repoRoot` is set to `this.repoRoot` and `ws.lockFile` to
`this.lockFile`, unchanged. Every downstream call therefore receives exactly
today's arguments. A ticket with no `repos` frontmatter in a studio falls through
to `project_repos`, then to `this.repoRoot` — same guarantee. Gating resolution on
studio/`repo_group` presence also avoids `resolveRepoPath` throwing on a non-studio
project (its group is empty).

## Resolution rule

New private method `_resolveTargetRepo(ticket)` on `Orchestrator`, returning
`{ repoRoot, lockFile }` (absolute paths). Precedence:

1. **`ticket.data.repos`** (array, read from the shared board) — if length > 1,
   throw (Decision 1). If length === 1, `resolveRepoPath(this.repoRoot, this.config, name)`.
2. **`this.config.project_repos`** (array; `config.js:141`, the subset of the group
   the project uses) — take the first, `resolveRepoPath(...)`.
3. **Fallback** — `{ repoRoot: this.repoRoot, lockFile: this.lockFile }` unchanged.

Resolution is only attempted when `this.config.studio` (or a non-empty
`repo_group`) is present; otherwise go straight to the fallback. `lockFile` for a
resolved repo is `mainCheckoutLockPath(resolvedRepoRoot, this.config)`. If
`resolveRepoPath` throws (name not in the group), wrap the error to name the ticket
id so the message is actionable, then rethrow.

Note `this.repoRoot` **is** the studio root here: `commands/app.js` constructs the
orchestrator with `repoRoot: findProjectRoot()`, and in a studio that is the studio
root — exactly the `studioRoot` argument `resolveRepoPath` expects.

## Threading plan — which `this.repoRoot` sites become `ws.repoRoot`

Each consumer reads `const repoRoot = ws.repoRoot || this.repoRoot;` and
`const lockFile = ws.lockFile || this.lockFile;` — the `|| this.*` fallback keeps
workspace records persisted before the upgrade (WorkspaceStore is a JSON file) and
repo runs working.

**BECOME `ws.repoRoot` / `ws.lockFile`:**
- `createWorkspace` (~128–135) — `computeWorktreePlacement` + `createWorktree`.
  This is the resolution point: call `_resolveTargetRepo(ticket)`, use its
  `repoRoot`, and STORE both on the workspace (see state.js change below).
- `merge` (~744) — `acquireMainCheckoutLock(ws.lockFile, …)`.
- `merge` (~751) — `removeWorktree(ws.repoRoot, …)`.
- `_mergeToMain` call in `merge` (~749) / the method (~936) — `mergeToMain(ws.repoRoot, …)`.
  Pass the repo in from `merge`; `_mergeToMain(branch, opts)` gains a repoRoot arg
  (or read it in `merge` and pass through). Keep the method a seam for tests.
- `discard` (~820) — `removeWorktree(ws.repoRoot, …)`.
- `getDiff` (~842, the worktree branch) — `diffAgainstMain(ws.repoRoot, ws.branch)`.
- `getChangedFiles` (~853, the worktree branch) — `changedFiles(ws.repoRoot, ws.branch)`.

**STAY `this.repoRoot` (do NOT change) — and why:**
- Constructor `this.lockFile = mainCheckoutLockPath(repoRoot, config)` (~105) —
  the default/repo-run lock. Per-workspace locks are computed separately.
- `_runInMainCheckout` worktreePath = `this.repoRoot` (~255) — a repo run has no
  ticket and no target repo; it works in the main checkout by design.
- `_promptContext` `hasProduct` path (~354) — the product feature-map lives in the
  studio's board (`.bobby/product`), at the studio root, NOT in the code repo.
  Threading `ws.repoRoot` here would look for product context in the wrong place.
- `getDiff` (~841) / `getChangedFiles` (~852) repo-run branches
  (`workingDiff`/`workingChangedFiles(this.repoRoot)`) — repo runs, main checkout.

## Files to modify

- `lib/dashboard/orchestrator.js`
  - Add `_resolveTargetRepo(ticket)` (precedence + Decision 1 throw + error wrap).
  - `createWorkspace`: resolve, use resolved `repoRoot` for placement/createWorktree,
    pass `repoRoot` + `lockFile` into `newWorkspace`.
  - `merge`, `discard`, `getDiff`, `getChangedFiles`, `_mergeToMain`: read
    `ws.repoRoot` / `ws.lockFile` with `|| this.*` fallback per the table above.
- `lib/dashboard/state.js`
  - `newWorkspace({ …, repoRoot = null, lockFile = null })` — add the two optional
    fields to the returned object (default null so repo runs / old records are
    unaffected; `isRepoRun` and everything else untouched).
- `lib/config.js` — no change; `resolveRepoPath` and `project_repos` already exist.
- `.bobby/decisions.yaml` — add `one-repo-per-ticket-v1` (Decision 1).

## Step-by-step

- [ ] Add `repoRoot`/`lockFile` params to `newWorkspace` in `state.js` (default null).
- [ ] Add `_resolveTargetRepo(ticket)` to the orchestrator (pure, no git): gate on
      studio/`repo_group`; `ticket.data.repos` → throw if >1 else resolve; else
      `project_repos[0]`; else fallback to `this.repoRoot`/`this.lockFile`.
- [ ] In `createWorkspace`, call `_resolveTargetRepo(ticket)` after `_requireTicket`,
      use `repoRoot` for `computeWorktreePlacement`/`createWorktree`, and pass
      `repoRoot` + `lockFile` to `newWorkspace`.
- [ ] Thread `ws.repoRoot || this.repoRoot` / `ws.lockFile || this.lockFile` into
      `merge` (lock + removeWorktree + _mergeToMain), `discard` (removeWorktree),
      `getDiff` (diffAgainstMain), `getChangedFiles` (changedFiles).
- [ ] Give `_mergeToMain` the repo root (arg or read in `merge`), keeping it a seam.
- [ ] Record `one-repo-per-ticket-v1` in `.bobby/decisions.yaml`.
- [ ] Tests per `test-cases.md`; `npm test` + `npm run lint` green.

## Risk areas

- **Persisted workspaces without `ws.repoRoot`.** WorkspaceStore is a JSON file;
  an in-flight workspace from before the upgrade has neither field. The
  `|| this.repoRoot` / `|| this.lockFile` fallback is mandatory on every consumer,
  not optional — omitting it strands those records. (Anti-pattern to avoid: reading
  `ws.repoRoot` bare.)
- **Lock file must key off the resolved repo.** If `merge` kept using `this.lockFile`,
  two tickets in two repos would contend on one lock, or a repo run in repo A would
  block a merge in repo B. `ws.lockFile` (stored at createWorkspace) is what breaks
  that coupling — verified by test (d).
- **`hasProduct` must stay `this.repoRoot`.** It reads the studio board, not the
  code repo. Do not "consistency-thread" it.
- **`resolveRepoPath` throws on an unknown name.** Wrap with the ticket id so a
  misconfigured `repos:` frontmatter is diagnosable, not a bare "not in the group".

## Dependencies

- TKT-068 (merged into `integrate/app-studio`) — brings orchestrator, repo-group
  config, and `resolveRepoPath` onto one trunk. Satisfied.

## Feature Context (parent TKT-020)

- **Depends on:** `resolveRepoPath` + `project_repos` (config.js) and ticket `repos`
  frontmatter (tickets.js) — all present on the trunk; this ticket is their first
  orchestrator caller.
- **Provides:** `ws.repoRoot` / `ws.lockFile` on the workspace record — the field
  any later multi-repo work (two-worktree tickets, per-repo ship) builds on.
- **Deviations:** none. No `feature-plan.md` exists under TKT-020; nothing to update.

## Complexity

**Medium** — one resolver + a handful of one-line call-site rethreads across two
files, plus tests. No new subsystem; the blast radius is the orchestrator's
per-workspace git calls.
