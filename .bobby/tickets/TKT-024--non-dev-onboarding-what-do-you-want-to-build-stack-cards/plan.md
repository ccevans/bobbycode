# Plan — TKT-024: Non-dev onboarding — "What do you want to build?" + stack cards

## Problem

The app assumes a repo, a terminal, and knowledge of tickets. A non-developer
landing on the dashboard sees an empty board and no affordance to start. The
pitch — "a full software team" — is most valuable to someone who does not
already have one.

## Goal

Add an onboarding flow in the app: a "What do you want to build?" prompt +
stack selection cards, ending with a real project the app can drive. The flow
uses `createProject()` from `lib/project.js` (TKT-025) and lands the user on
Home with a real first ticket and a next action. Nothing requires the terminal.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|:-:|:-:|:-:|:-:|:-:|
| A | API endpoint `POST /api/onboard` + classic dashboard onboarding overlay (vanilla JS, same as existing app.js) | 4 | 4 | 4 | 5 | **37** |
| B | Redirect to a separate onboarding page (`/onboard`) served as a standalone HTML file | 3 | 3 | 3 | 5 | 29 |
| C | CLI wizard (`bobby new --interactive`) that opens the dashboard after | 2 | 4 | 3 | 3 | 24 |

**Selected: A.** The onboarding is part of the app — same page, same JS, same
API surface. A separate page (B) fractures the SPA model the classic dashboard
follows. A CLI wizard (C) defeats the purpose: the user should never need the
terminal.

## Design decisions

### Decision 1 — Onboarding is a modal overlay, not a separate view

The classic dashboard's `app.js` renders in a single page. Onboarding is a
full-screen overlay that appears when:
- The dashboard has no tickets (fresh install, no project), OR
- The user clicks a "New project" button (for studio mode)

The overlay collects: (1) idea text, (2) stack choice. On submit, it calls
`POST /api/onboard` and on success dismisses the overlay and refreshes the
board.

### Decision 2 — Stack cards use PROJECT_STACKS + stack JSON metadata

Each stack has a `display` name and a list of `areas` in its JSON file.
The API serves stack metadata at `GET /api/stacks` by reading all stack JSONs.
The UI renders them as selectable cards. Stacks with built-in starters
(node, web, blog) are highlighted as "quick start" since they produce a
runnable app.

### Decision 3 — The API does the work, not the browser

`POST /api/onboard` accepts `{ idea, stack, dir? }` and calls `createProject()`
server-side. The browser receives the result (epic id, starter info, project
path) and renders a success screen with next action ("Bobby is breaking down
your idea — check the board"). No git, no npm, no file system access from the
browser.

### Decision 4 — Studio integration

If the dashboard is a studio (TKT-022), the newly created project is
automatically registered and switched to via `ProjectContext.switchTo()`.
The onboarding endpoint detects studio mode and handles registration.
For non-studio single-project dashboards, onboarding creates a project in
the current working directory.

## Files to modify

- `lib/dashboard/server.js` — New routes:
  - `GET /api/stacks` — returns stack metadata for all PROJECT_STACKS
  - `POST /api/onboard` — accepts `{ idea, stack, dir? }`, calls
    `createProject()`, returns result
- `lib/project.js` — No changes needed (TKT-025 already did the extraction).
  Read `PROJECT_STACKS` for the stack list.
- `templates/dashboard/app.js` — Add:
  - `renderOnboarding()` — the overlay: idea input + stack cards + submit
  - `renderStackCards(stacks)` — card grid from /api/stacks data
  - `submitOnboarding(idea, stack)` — calls POST /api/onboard, handles success
  - Auto-show on empty board; "New project" button in header for studios
- `templates/dashboard/style.css` — Styles for the onboarding overlay + stack
  cards. Use the existing design system (colors, typography from the dashboard).
- `templates/dashboard/index.html` — Add onboarding container div.
- `test/lib/onboarding.test.js` (NEW) — Tests for the /api/onboard endpoint.

## Step-by-step plan

- [ ] Add `GET /api/stacks` route in server.js: reads each stack JSON from
      `stacks/` dir, returns `[{ name, display, areas, hasStarter }]`.
      `hasStarter` = true if `templates/starters/<name>/` exists.
- [ ] Add `POST /api/onboard` route in server.js:
      - Validate: idea non-empty, stack in PROJECT_STACKS.
      - Determine `cwd`: if studio, create in studio's `repos/` dir; else
        in the project root's parent.
      - Call `createProject(idea, { stack, cwd })`.
      - If studio: register the new project, switch ProjectContext.
      - Return `{ success: true, epic, dirName, stack, starter, committed }`.
- [ ] Add onboarding overlay to `app.js`:
      - `renderOnboarding()` — full-screen overlay with idea textarea and
        stack card grid.
      - Cards show stack `display` name, `areas` tags, "Quick start" badge
        for stacks with starters.
      - Submit button calls POST /api/onboard, shows loading state.
      - On success: dismiss overlay, navigate to board, show success toast.
      - On error: show error inline, don't dismiss.
- [ ] Add auto-trigger: on initial load, if `/api/tickets` returns empty
      AND no project config exists, show onboarding overlay.
- [ ] Add "New project" button visible in studio mode (check `/api/config`
      for `isStudio`).
- [ ] Style the overlay and cards in `style.css`: centered modal, card grid,
      selected state, loading spinner.
- [ ] Tests: /api/stacks returns all stacks, /api/onboard creates project,
      error on blank idea, error on unknown stack.
- [ ] Verify: `npm test` + `npm run lint` green.

## Risk areas

- **`createProject` runs git init/add/commit.** In a containerized or
  sandboxed environment (no git identity), the initial commit fails. The
  function already handles this gracefully (returns `committed: false` +
  `commitError`), but the UI must show the warning.
- **Stack detection for "hasStarter".** The starters live in `templates/starters/`.
  If the path resolution is wrong in the server context, all stacks show as
  "no starter". Use `path.resolve(__dirname, ...)` consistently.
- **File system permissions.** `createProject` writes to the filesystem.
  In read-only environments, it will throw. The API should return a clear
  400 error, not a 500.
- **Large file: `templates/dashboard/app.js`.** This file is ~700+ lines.
  The onboarding code should be added as a self-contained section with clear
  comments, not interspersed throughout.

## Dependencies

- TKT-025 (`createProject` extraction) — satisfied (lib/project.js exists)
- TKT-022 (studio mode) — soft dependency. If TKT-022 is not yet built,
  the studio integration path (`switchTo()`) is skipped and onboarding
  works for single-project dashboards only. The code should guard with
  `if (projectContext?.isStudio())`.

## Feature Context (parent TKT-020)

- **Depends on:** TKT-025 (`createProject` in lib/project.js), TKT-022
  (ProjectContext for studio integration — soft, feature-flagged by isStudio).
- **Provides:** Browser-based project creation. The onboarding flow is the
  entry point for non-developers — the whole "a full software team" pitch.
- **Deviations:** None from feature-plan.

## Complexity

**Medium** — one API endpoint calling an existing function + UI overlay.
The UI work is the bulk: stack cards, form validation, success/error states.
No architectural change.
