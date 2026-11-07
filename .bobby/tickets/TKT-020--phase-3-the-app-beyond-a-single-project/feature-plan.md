# Feature Plan — TKT-020: Phase 3 — the app beyond a single project

## Architecture Decisions

- **Workspace as the universal run unit.** Chats (TKT-021), project switches
  (TKT-022), and onboarding (TKT-024) all use the existing workspace/orchestrator
  pattern rather than parallel state machines. Chat is a workspace in `plan` mode;
  project switch re-scopes the orchestrator's context; onboarding calls
  `createProject` then opens the new project in the app.

- **`--resume` is the conversation primitive.** Claude CLI's `--resume` handles
  context restoration, compaction, and token management. We pass it through the
  executor rather than reimplementing conversation state.

- **Studio-level pairing (TKT-067) replaces per-project pairing.** One pairing
  code reaches every project the studio serves. The tunnel gains a `project`
  field in request frames; the server routes by current project context.

- **`/classic/` lifecycle.** The classic dashboard at `/classic/` and hq/web in
  bobbycode-pro are retired together (TKT-026) once the App is proven default.
  No new features go to classic.

- **`createProject` is the shared entry point.** TKT-025 extracted it to
  `lib/project.js`. Both the CLI (`bobby new`) and the app onboarding (TKT-024)
  call it. The function takes `cwd` as an argument and returns structured results
  (no stdout, no process.exit).

## Shared Utilities & Components

| Utility/Component | Created By | Used By | Location |
|---|---|---|---|
| `createProject()` | TKT-025 | TKT-024 (onboarding) | `lib/project.js` |
| `PROJECT_STACKS` | TKT-025 | TKT-024 (stack cards) | `lib/project.js` |
| `--resume` executor support | TKT-021 | Future interactive modes | `lib/dashboard/executor.js` |
| `ChatManager` | TKT-021 | TKT-021 API routes | `lib/dashboard/chat.js` |
| `resolveRepoPath` | TKT-069 | TKT-067 (multi-project relay) | `lib/config.js` |
| `listProjects()` | existing | TKT-022 (project picker) | `lib/studio.js` |
| `ProjectContext` | TKT-022 | TKT-022, TKT-067 (project-scoped tunnel) | `lib/dashboard/project-context.js` |
| `setActiveProject` / `getActiveProject` | existing | TKT-022 (persist selection) | `lib/studio.js` |

## Naming Conventions

- API routes: `/api/<resource>` (REST-style, existing pattern)
- Chat routes: `/api/chats`, `/api/chats/:id/message`, `/api/chats/:id/commit`
- Project routes: `/api/projects`, `/api/projects/select`
- Onboarding routes: `/api/onboard`, `/api/onboard/create`
- State files: `.bobby/<name>.json` (parallel to `workspaces.json`)

## Ticket Dependencies

| Ticket | Depends On | Provides |
|---|---|---|
| TKT-068 | — | Converged trunk (app + studio on one branch) |
| TKT-069 | TKT-068 | `ws.repoRoot` per-workspace repo targeting |
| TKT-025 | — | `createProject()` in `lib/project.js` |
| TKT-023 | TKT-068 | RelayTransport (app frontend over relay) |
| TKT-021 | TKT-068 | `--resume`, ChatManager, `plan` permission mode |
| TKT-022 | TKT-069 | Mutable project context, `/api/projects/select` |
| TKT-024 | TKT-025 | Browser-based project creation, stack cards |
| TKT-067 | TKT-023, TKT-022 | Studio-level pairing, project-scoped tunnel frames |
| TKT-026 | TKT-023 (proven) | Classic + hq/web removal |

## Build Order Rationale

The execution order respects hard dependencies while minimizing integration risk:

1. **TKT-023** (testing) — Already built, just needs to complete testing stage.
2. **TKT-021** (vet chat) — Independent: new module + executor extension. No
   dependency on TKT-022.
3. **TKT-022** (studio mode) — ProjectContext is a dependency for TKT-067.
4. **TKT-024** (onboarding) — Soft dependency on TKT-022 (studio integration
   feature-flagged by `isStudio`). Can build without it.
5. **TKT-067** (pair-once) — Hard dependency on TKT-022 (ProjectContext).
6. **TKT-026** (delete /classic) — Cleanup; no code depends on it. Last.

## Cross-Cutting Concerns

- **server.js is touched by 4 tickets** (TKT-021 chat routes, TKT-022 project
  routes, TKT-024 onboard routes, TKT-026 classic removal). Merge conflicts
  are likely. Each ticket adds routes in the route registration block — append,
  don't interleave.
- **orchestrator.js is touched by 2 tickets** (TKT-021 runChat, TKT-022
  ProjectContext). Both are additive — new methods, not modified existing ones.
- **`commands/remote.js` is touched by TKT-067.** The ProjectContext wiring
  is the only change.

## Out of Scope

- Multi-user / team mode (one dev machine, one phone per pairing)
- Service worker + push notifications for the phone app (PRO-005)
- Full hq/web feature parity audit (the App is the replacement, proven by TKT-023)
- Interactive refine (TKT-021 covers plan chat only; extend to other agents later)
- hq/web deletion (lives in bobbycode-pro repo; documented in TKT-026)
