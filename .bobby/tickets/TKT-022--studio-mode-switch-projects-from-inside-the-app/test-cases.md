# Test Cases — TKT-022: Studio mode — switch projects from inside the app

## TC-1: ProjectContext initializes from active-project file

**Precondition:** Studio with two projects (alpha, beta). `.bobby/active-project` contains "beta".
**Steps:**
1. Create `new ProjectContext(root, config)`.
2. Read `projectContext.projectName`.
**Expected:** Returns "beta". `ticketsDir` resolves to `.bobby/beta/tickets`.

## TC-2: ProjectContext falls back to first project when no active-project file

**Precondition:** Studio with projects. No `.bobby/active-project` file.
**Steps:**
1. Create `new ProjectContext(root, config)`.
2. Read `projectContext.projectName`.
**Expected:** Returns the first project from `listStudioProjects()`.

## TC-3: ProjectContext.switchTo re-scopes all paths

**Precondition:** ProjectContext initialized to project "alpha".
**Steps:**
1. Call `projectContext.switchTo('beta')`.
2. Read `projectName`, `ticketsDir`, `sessionsDir`.
**Expected:** All point to the "beta" project's directories under `.bobby/beta/`.
`.bobby/active-project` file now contains "beta".

## TC-4: switchTo throws on unknown project name

**Steps:**
1. Call `projectContext.switchTo('nonexistent')`.
**Expected:** Throws with a message naming the project.

## TC-5: GET /api/projects lists studio projects

**Precondition:** Studio with three projects; "alpha" is active.
**Steps:**
1. GET `/api/projects`.
**Expected:** 200 with `{ projects: ['alpha', 'beta', 'gamma'], active: 'alpha' }`.

## TC-6: POST /api/projects/select switches the active project

**Precondition:** Studio with projects; "alpha" is active.
**Steps:**
1. POST `/api/projects/select` with body `{ name: 'beta' }`.
2. GET `/api/projects`.
**Expected:** Select returns 200. GET shows `active: 'beta'`.

## TC-7: Switching does not interrupt running agents in another project

**Precondition:** A workspace is running an agent for project "alpha".
**Steps:**
1. POST `/api/projects/select` with body `{ name: 'beta' }`.
2. Check the running process map on the orchestrator.
**Expected:** The alpha workspace's process is still in the running map.
Status is still 'running'. No SIGTERM was sent.

## TC-8: Tickets API returns tickets for the active project only

**Precondition:** Studio. Project "alpha" has TKT-001. Project "beta" has TKT-002.
**Steps:**
1. Switch to "alpha".
2. GET `/api/tickets`.
3. Switch to "beta".
4. GET `/api/tickets`.
**Expected:** Step 2 returns TKT-001 (not TKT-002). Step 4 returns TKT-002 (not TKT-001).

## TC-9: Selected project survives page reload via GET /api/config

**Precondition:** Active project is "beta".
**Steps:**
1. GET `/api/config`.
**Expected:** Response includes `activeProject: 'beta'` and `isStudio: true`.

## TC-10: Non-studio project — /api/projects returns 400

**Precondition:** A single-project (non-studio) dashboard.
**Steps:**
1. GET `/api/projects`.
**Expected:** 400 with error message indicating project switching is not available.

## TC-11: Non-studio project — /api/projects/select returns 400

**Precondition:** A single-project (non-studio) dashboard.
**Steps:**
1. POST `/api/projects/select` with body `{ name: 'anything' }`.
**Expected:** 400 with error message.

## TC-12: ProjectContext.isStudio returns correct value

**Precondition:** A studio config with `studio: true`.
**Steps:**
1. Create `new ProjectContext(root, config)`.
2. Call `projectContext.isStudio()`.
**Expected:** Returns true. For a non-studio config, returns false.
