# Plan — TKT-022: Studio mode — switch projects from inside the app

## Problem

`bobby dashboard` (and `bobby remote`) reads config once at startup and binds
every component — orchestrator, server, store, tickets — to that single project.
Switching projects requires quitting and restarting from a different directory.

The studio infrastructure already exists: `lib/studio.js` has
`listStudioProjects()`, `setActiveProject()`, `getActiveProject()`,
`readProjectConfig()`, and per-project boards at `.bobby/<project>/tickets/`.
But the dashboard never calls any of it.

## Goal

Add a mutable project context to the dashboard so the user can switch projects
without restarting. The selected project survives a page reload. Running agents
in project A are undisturbed when the user switches to project B.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|:-:|:-:|:-:|:-:|:-:|
| A | ProjectContext class holding the active project; orchestrator + server read from it; `/api/projects/select` swaps it; store is shared, tickets resolve per project | 4 | 4 | 4 | 5 | **37** |
| B | Construct a new Orchestrator per project switch (tear down + rebuild) | 3 | 2 | 3 | 5 | 28 |
| C | Multi-orchestrator registry — one per project, all alive simultaneously | 2 | 2 | 3 | 5 | 22 |

**Selected: A.** The store and SSE hub are shared infrastructure — workspaces
from any project coexist in the same `workspaces.json` and the same SSE stream
(tagged by project). Rebuilding the orchestrator (B) loses running processes.
One orchestrator per project (C) is a large surface-area change (concurrency
cap, lock registry, process map all per-orchestrator).

## Design decisions

### Decision 1 — ProjectContext is a thin holder, not a state machine

`ProjectContext` is a class with `{ projectName, config, ticketsDir, sessionsDir }`
and a `switchTo(name)` method that re-resolves the paths. The orchestrator and
server read from `this.projectContext.*` instead of their constructor arguments.
Switching is a reassignment, not a lifecycle event.

### Decision 2 — Running workspaces are project-scoped but not interrupted

Each workspace already records `ticketId` which indirectly scopes it to a
project. On switch, the API filters `store.list()` by the current project's
ticket prefix. Running agents are unaffected — they work in their worktree
regardless of which project the UI is showing. The process map stays shared.

### Decision 3 — Selected project persists via `setActiveProject`

`setActiveProject(root, name)` writes `.bobby/active-project` (gitignored).
On startup, `getActiveProject(root)` is read; if null, fall through to the
startup project. The browser stores it in `sessionStorage` for reload (belt),
and the API returns it in `GET /api/config` so the UI initializes correctly.

### Decision 4 — Non-studio projects get a pass

If the project is not a studio (`!config.studio`), the project-switch API
returns 400 and the UI hides the project picker. The feature is studio-only.
Single-project dashboards work exactly as before.

## Files to modify

- `lib/dashboard/project-context.js` (NEW) — `ProjectContext` class:
  `constructor(root, config)`, `switchTo(name)`, getters for projectName,
  config, ticketsDir, sessionsDir, agentsPath. Uses `setActiveProject()` /
  `getActiveProject()` from `lib/studio.js`.
- `lib/dashboard/orchestrator.js` — Constructor takes `projectContext` instead
  of raw `ticketsDir`/`sessionsDir`. Methods read `this.projectContext.ticketsDir`
  etc. No change to workspace creation/running (worktrees already carry their own
  paths). Add `switchProject(name)` that delegates to `projectContext.switchTo()`.
- `lib/dashboard/server.js` — New routes:
  - `GET /api/projects` — returns `listStudioProjects()` + active project name
  - `POST /api/projects/select` — body `{ name }`, calls `orchestrator.switchProject()`
  - Existing routes (`/api/tickets`, `/api/brief`, etc.) continue to read from
    `orchestrator.ticketsDir` (now dynamically scoped via project context)
  - `GET /api/config` — include `activeProject` in response
- `commands/dashboard.js` — Create `ProjectContext`, pass to orchestrator and server.
  Read `getActiveProject()` on startup.
- `commands/remote.js` — Same `ProjectContext` wiring.
- `test/lib/project-context.test.js` (NEW) — Unit tests for ProjectContext.

## Step-by-step plan

- [ ] Create `lib/dashboard/project-context.js`:
      - `constructor(root, config)` — resolves initial project from
        `getActiveProject(root)` or falls back to config.project.
      - `switchTo(name)` — validates name exists in `listStudioProjects(root)`,
        reads project config, resolves ticketsDir/sessionsDir/agentsPath,
        calls `setActiveProject(root, name)`.
      - Getters: `projectName`, `config`, `ticketsDir`, `sessionsDir`, `agentsPath`.
      - `isStudio()` — returns whether project switching is available.
- [ ] Update `Orchestrator` constructor to accept `projectContext` and read paths
      from it. Keep backward-compatible: if no `projectContext`, use raw args
      (for tests and non-studio usage).
- [ ] Add `switchProject(name)` to `Orchestrator` — delegates to projectContext,
      broadcasts a 'project_switched' event via SSE.
- [ ] Wire `GET /api/projects` and `POST /api/projects/select` in server.js.
- [ ] Update `GET /api/config` to include `activeProject` and `isStudio`.
- [ ] Update `commands/dashboard.js` to create ProjectContext and pass it.
- [ ] Update `commands/remote.js` similarly.
- [ ] Tests: ProjectContext switching, API endpoints, non-studio returns 400.
- [ ] Verify: `npm test` + `npm run lint` green.

## Risk areas

- **Ticket prefix collision.** Two studio projects can have the same ticket
  prefix. Workspace filtering by prefix would match the wrong project.
  Mitigate: filter by ticketsDir path, not prefix.
- **Config cache staleness.** ProjectContext caches the project config at
  switch time. If the config file changes on disk (another terminal ran
  `bobby init`), the cached config is stale. Acceptable for v1 — switching
  re-reads.
- **Orchestrator method references.** Many orchestrator methods reference
  `this.ticketsDir` directly. Search for all references and change them to
  read from `this.projectContext?.ticketsDir || this.ticketsDir`.

## Dependencies

- TKT-068 (converged trunk) — satisfied
- TKT-069 (target repo resolution) — satisfied; `ws.repoRoot` per-workspace
  means project B's repos don't collide with project A's
- Studio infrastructure (`lib/studio.js`) — present on trunk

## Feature Context (parent TKT-020)

- **Depends on:** TKT-069 (ws.repoRoot ensures cross-project repo targeting works),
  studio.js infrastructure (listStudioProjects, setActiveProject, getActiveProject).
- **Provides:** ProjectContext and `/api/projects/select` — used by TKT-067
  (tunnel routes by current project) and TKT-024 (newly created projects
  become selectable).
- **Deviations:** None from feature-plan.

## Complexity

**Medium** — new ProjectContext class + orchestrator/server threading + 2 API
routes. The blast radius is well-contained: workspaces are already self-describing
and running agents don't read the orchestrator's project context.
