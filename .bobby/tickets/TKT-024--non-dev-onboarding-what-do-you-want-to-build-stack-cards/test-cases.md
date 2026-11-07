# Test Cases — TKT-024: Non-dev onboarding

## TC-1: GET /api/stacks returns all available stacks

**Precondition:** Bobby installed with bundled stacks.
**Steps:**
1. GET `/api/stacks`.
**Expected:** 200 with an array of stack objects. Each has `name`, `display`,
`areas`, `hasStarter`. At least "node", "web", "blog" have `hasStarter: true`.
"generic" has `hasStarter: false`.

## TC-2: POST /api/onboard creates a project from an idea

**Precondition:** Server running, filesystem is writable.
**Steps:**
1. POST `/api/onboard` with body `{ idea: "a habit tracker for runners", stack: "node" }`.
2. Check the returned JSON.
3. Verify the project directory exists on disk.
**Expected:** 200 with `{ success: true, epic: { id: 'TKT-001', ... }, dirName, stack: 'node' }`.
The directory contains `.bobby/`, `.bobbyrc.yml`, `CLAUDE.md`, and the ticket.

## TC-3: POST /api/onboard rejects blank idea

**Steps:**
1. POST `/api/onboard` with body `{ idea: "", stack: "node" }`.
**Expected:** 400 with error message about idea being required.

## TC-4: POST /api/onboard rejects unknown stack

**Steps:**
1. POST `/api/onboard` with body `{ idea: "my app", stack: "fortran" }`.
**Expected:** 400 with error message listing valid stacks.

## TC-5: Onboarding creates a runnable starter for stacks that have one

**Precondition:** Server running.
**Steps:**
1. POST `/api/onboard` with body `{ idea: "my blog", stack: "blog" }`.
2. Check the returned JSON for `starter` field.
3. Verify starter files exist in the project directory.
**Expected:** Response includes `starter` with `devCommand` and/or `devUrl`.
The project directory has starter files (e.g., `index.html` for blog).

## TC-6: Onboarding overlay shows on empty board

**Precondition:** Dashboard started with no existing tickets.
**Steps:**
1. Load the dashboard in a browser.
2. Wait for initial render.
**Expected:** The onboarding overlay is visible, showing the idea input and
stack selection cards. The regular board is behind/hidden.

## TC-7: Stack cards are selectable and show metadata

**Precondition:** Onboarding overlay is visible.
**Steps:**
1. View the stack cards.
2. Click on the "Node HTTP API" card.
**Expected:** Cards display the stack name, areas tags, and a "Quick start"
badge for stacks with starters. Clicking a card selects it (visual highlight).

## TC-8: Submitting onboarding dismisses overlay and shows board

**Precondition:** Onboarding overlay visible, idea typed, stack selected.
**Steps:**
1. Type "a habit tracker for runners" in the idea field.
2. Select the "node" stack card.
3. Click "Create Project".
4. Wait for the API response.
**Expected:** Loading state shown during API call. On success, overlay
dismisses, board refreshes with the newly created epic ticket visible.

## TC-9: Error during onboarding shows inline error

**Precondition:** Onboarding overlay visible. Filesystem is read-only or
the target directory already exists.
**Steps:**
1. Type an idea, select a stack, click "Create Project".
**Expected:** The error message appears inline in the overlay (not a separate
page). The overlay remains visible so the user can retry.

## TC-10: Studio mode — new project is registered and switched to

**Precondition:** Dashboard running in studio mode with ProjectContext.
**Steps:**
1. POST `/api/onboard` with `{ idea: "my app", stack: "web" }`.
2. GET `/api/projects`.
**Expected:** The new project appears in the projects list and is the
active project.

## TC-11: "New project" button visible only in studio mode

**Precondition:** Dashboard in studio mode.
**Steps:**
1. Load the dashboard with tickets already present (no auto-onboarding).
2. Look for a "New project" button.
**Expected:** Button is visible. Clicking it opens the onboarding overlay.
In non-studio mode, the button is absent.

## TC-12: Onboarding does not require the terminal

**Steps:**
1. Complete the full onboarding flow through the browser only.
**Expected:** At no point is the user asked to open a terminal, run a
command, or edit a file manually. Everything happens through the app UI.
