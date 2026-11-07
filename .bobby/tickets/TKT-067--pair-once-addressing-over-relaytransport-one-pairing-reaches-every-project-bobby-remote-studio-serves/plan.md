# Plan — TKT-067: Pair-once addressing over RelayTransport

## Problem

`bobby remote` creates one pairing per project, keyed on the SHA256 hash of
the project's absolute path (`pairing-store.js:17`). In a studio with 5
projects, the user needs 5 pairing codes — one scan per project. This makes
the phone unusable for multi-project work, which is exactly what a studio is.

## Goal

One pairing code reaches every project the studio serves. The tunnel gains
a `project` field in request frames so the server routes to the correct
project context. Non-studio `bobby remote` works exactly as before.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|:-:|:-:|:-:|:-:|:-:|
| A | Studio-level pairing: key off studio root (not project path), add `project` field to req/sub frames, server routes via ProjectContext | 4 | 4 | 4 | 5 | **37** |
| B | One pairing but multiple tunnels (one tunnel per project sharing the same key) | 3 | 2 | 2 | 5 | 26 |
| C | Phone-side project picker that opens separate pairing channels per project | 2 | 3 | 3 | 4 | 24 |

**Selected: A.** A studio is one logical entity; it should have one pairing.
Adding `project` to the existing frame protocol is a one-field extension —
the tunnel already sends `{ t: 'hi', project }`, so the phone already knows
the project name. Extending req/sub frames to include which project they
target is the same pattern. Multiple tunnels (B) waste relay connections and
complicate reconnect. A phone-side picker (C) still requires multiple channels
and confuses the "one scan" UX.

## Design decisions

### Decision 1 — Studio pairing is keyed on studio root, not project path

`pairing-store.js` hashes `path.resolve(root)` to derive the pairing file
name. For a studio, the root is already the studio root (it's what
`findProjectRoot()` returns). No change to `loadOrCreatePairing` — it already
does the right thing. The pairing file is per-studio, not per-project.

But: `commands/remote.js` calls `findProjectRoot()` to get the root. In a
studio this is the studio root. Today it passes `config.project` (the studio
name, not a project name) to the tunnel's `project` field. With ProjectContext
(TKT-022), the tunnel should pass the active project name.

### Decision 2 — Request frames gain an optional `project` field

The phone adds `project: <name>` to `{t: 'req'}` and `{t: 'sub'}` frames.
The tunnel's `handleRequest()` and `handleSubscribe()` read `frame.project`,
and if present and different from the current project, call
`projectContext.switchTo(frame.project)` before proxying. The switch is
per-request, not global — the server's API routes already read from
`projectContext.ticketsDir` (TKT-022), so switching before the proxy
request scopes it correctly.

If `frame.project` is absent (backward compat, single-project mode), no
switch happens.

### Decision 3 — `hi` frame lists all available projects

The `{t: 'hi'}` greeting currently sends `project` (singular) and `version`.
Extend it to also send `projects: string[]` — the list from
`listStudioProjects(root)`. The phone uses this to render a project picker.
In non-studio mode, `projects` is `[config.project]` (one entry = no picker).

### Decision 4 — The phone sends project on every request

Rather than a stateful "project switch" command, the phone sends the project
name on every req/sub frame. This is stateless from the tunnel's perspective
and avoids race conditions with concurrent requests during a switch.

## Files to modify

- `lib/remote/tunnel.js` —
  - `handleRequest()`: read `frame.project`, switch ProjectContext if needed
    before proxying.
  - `handleSubscribe()`: same — read `frame.project` before opening SSE.
  - `connect()` on open: send `hi` with `projects` array.
  - `constructor`: accept `projectContext` (optional, for studio mode).
- `commands/remote.js` — Pass `projectContext` to RemoteTunnel constructor.
  When in studio mode, construct a ProjectContext (from TKT-022).
  The pairing is still from `loadOrCreatePairing(root)` (Decision 1).
- `lib/dashboard/server.js` — No changes. The server already reads from
  `projectContext.ticketsDir` (TKT-022). The tunnel switches the context
  before the proxy request.
- `test/lib/tunnel.test.js` — Tests for project-scoped request routing
  and the extended `hi` frame.

## Step-by-step plan

- [ ] Extend `RemoteTunnel` constructor to accept `projectContext` (optional).
- [ ] In `handleRequest()`: if `frame.project` is set and `this.projectContext`
      exists and `frame.project !== projectContext.projectName`, call
      `projectContext.switchTo(frame.project)`. Then proxy as before.
- [ ] In `handleSubscribe()`: same project switching before opening the SSE
      stream.
- [ ] In `connect()` on open: extend the `hi` frame to include
      `projects: projectContext ? listStudioProjects(root) : [this.project]`.
- [ ] Update `commands/remote.js`:
      - If studio mode, create a ProjectContext and pass it to RemoteTunnel.
      - Pass `root` for the `listStudioProjects` call.
- [ ] Tests: req with project field routes to correct project, req without
      project field falls through (backward compat), hi frame includes
      projects list.
- [ ] Verify: `npm test` + `npm run lint` green.

## Risk areas

- **Thread safety of ProjectContext switching.** Two concurrent requests
  targeting different projects would race the `switchTo()` call. Node is
  single-threaded, so the proxy request (an `http.request`) fires after
  `switchTo()` completes, and the next event loop tick picks up the next
  request. But the SSE stream opened for project A would see project B's
  context if a switch happens mid-stream. Mitigate: SSE subscriptions
  capture their project at subscribe time, not at event time. The server's
  API already reads `ticketsDir` at request time, and SSE events come from
  the SSE hub which is keyed by workspace id, not project — so this is safe
  as long as the workspace store is shared.
- **ProjectContext dependency.** This ticket depends on TKT-022's
  ProjectContext. If TKT-022 is not built yet, the project-switching path
  in the tunnel is dead code (guarded by `if (this.projectContext)`). The
  non-studio path works regardless.
- **Pairing code backward compat.** Existing pairing files are keyed on
  project path. Studio-mode pairings would be keyed on studio root (which
  IS the path `loadOrCreatePairing` receives). An existing phone paired to
  project A would not work with a studio pairing (different hash). This is
  acceptable — `--new-code` rotates, and the migration message should say so.

## Dependencies

- TKT-022 (ProjectContext) — hard dependency for studio-level switching
- TKT-023 (RelayTransport) — proven; this builds on the same tunnel
- TKT-068 (converged trunk) — satisfied

## Feature Context (parent TKT-020)

- **Depends on:** TKT-022 (ProjectContext for switching), TKT-023
  (RelayTransport is the transport layer).
- **Provides:** Studio-level pairing — one scan reaches all projects.
  This is the "run your team from your phone" promise for multi-project users.
- **Deviations:** None from feature-plan.

## Complexity

**Medium** — one-field protocol extension + ProjectContext wiring in the
tunnel. The blast radius is contained: the tunnel, the remote command, and
the hi frame. No changes to the relay, the crypto, or the server API.
