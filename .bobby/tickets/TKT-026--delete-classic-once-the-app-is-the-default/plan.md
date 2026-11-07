# Plan — TKT-026: Delete /classic once the App is the default

## Problem

The classic dashboard at `/classic/` was frozen "for one release" when the App
shipped (CHANGELOG: "Classic stays reachable at /classic/ when the App is
active"). That release has passed. The `/classic/` route, its supporting code
in `commands/app.js`, and the static mount in `server.js` are dead weight.

Additionally, per TKT-023's review (scope amendment in the comments): hq/web
in bobbycode-pro is retired along with /classic — the App over RelayTransport
is the only phone frontend.

## Goal

Remove the `/classic/` route, its static mount, the "dashboard" alias migration
message, and clean up all dead references in docs and commands. The free-tier
promise is documented: `templates/dashboard/` remains as the default UI for
users without Pro (it IS the app now, not "classic"). The hq/web retirement
in bobbycode-pro is documented but out of scope for this repo.

## Approaches considered

| # | Approach | Effort (3x) | Risk (2x) | Maint (2x) | Impact (1x) | Score |
|---|----------|:-:|:-:|:-:|:-:|:-:|
| A | Remove /classic mount, clean up app.js messaging, remove commands/dashboard.js, update docs | 5 | 5 | 5 | 4 | **49** |
| B | Keep /classic as a redirect to / (gentle deprecation) | 4 | 4 | 3 | 3 | 33 |
| C | Remove everything + delete templates/dashboard/ (move to Pro package) | 2 | 1 | 2 | 4 | 18 |

**Selected: A.** Clean removal of the alias. The classic dashboard IS
`templates/dashboard/` — it's the default UI for all users, free or Pro.
Deleting the files (C) would break the free tier. A redirect (B) is half a
removal — it leaves the code path alive with no benefit. A removes the code
and the messaging while `templates/dashboard/` continues serving at `/`.

## Design decisions

### Decision 1 — `templates/dashboard/` stays; only the `/classic/` mount goes

`templates/dashboard/` is the MIT-licensed dashboard that ships with Bobby.
When no Pro app is installed, `resolveAppDir()` returns `null` and `server.js`
serves `templates/dashboard/` at `/`. Removing the files would break every
free-tier user. What this ticket removes is the `/classic/` *alias* that
serves the same files at a second URL when the Pro app is active.

### Decision 2 — `commands/dashboard.js` is removed; `app` is the only command

`commands/app.js` already has `.alias('dashboard')`. The separate
`commands/dashboard.js` (which predates the App command and does the same thing
minus Pro detection) is dead code. Remove it and its `registerDashboard` import
from `bin/bobby.js`.

### Decision 3 — The "for one release" messaging is removed

`commands/app.js:75` prints "old UI lives at /classic/ for one release" when
`process.argv[2] === 'dashboard'`. The release has passed. Remove the message.
Also remove the `Classic dashboard: ${url}/classic/` line at startup.

### Decision 4 — hq/web retirement is documented, not implemented here

The AC says "hq/web is deleted with /classic." That code lives in
bobbycode-pro, a separate repo. This ticket adds a comment to the ticket
noting that hq/web deletion must happen in bobbycode-pro as a follow-up
(or as part of this ticket's PR if the repos field is set). The AC is
considered met when the code in THIS repo is clean.

## Files to modify

- `lib/dashboard/server.js`:
  - Remove the `/classic/` static mount (~line 852): delete the
    `if (appDir) staticMounts.push({ prefix: '/classic/', dir: TEMPLATE_DIR })` line.
  - Remove the `/classic` → `/classic/index.html` rewrite (~line 861).
  - Remove the "Relative asset paths, so the same HTML works at / and under
    /classic/" comment (~line 96) — paths still relative, but the reason is
    gone.
- `commands/app.js`:
  - Remove the "old UI lives at /classic/" migration message (~line 75).
  - Remove the `Classic dashboard: ${url}/classic/` startup line (~line 140).
  - Update `resolveAppDir()` notes that reference "classic" to say "default
    dashboard" instead (no behavior change, just accuracy).
- `commands/dashboard.js` — DELETE this file entirely.
- `bin/bobby.js` — Remove the `registerDashboard` import and call. The `app`
  command with `.alias('dashboard')` already handles both names.
- `CHANGELOG.md` — Add an entry under [Unreleased] > Removed noting the
  /classic route is gone and the dashboard command is now an alias for app.
- `README.md` — Remove or update any mention of "classic at /classic/".
- `templates/CLAUDE.md.ejs` — If any reference to /classic exists, remove it.

## Step-by-step plan

- [ ] Delete `commands/dashboard.js`.
- [ ] Remove the `registerDashboard` import and call from `bin/bobby.js`.
- [ ] In `lib/dashboard/server.js`: remove the `/classic/` static mount and
      the `/classic` → `/classic/index.html` URL rewrite. Remove the "works
      at / and under /classic/" comment.
- [ ] In `commands/app.js`: remove the migration message about /classic.
      Remove the `Classic dashboard: ${url}/classic/` line. Update comments
      to say "default dashboard" instead of "classic".
- [ ] Update CHANGELOG.md with a Removed entry.
- [ ] Grep for remaining "classic" references in docs/README/templates and
      clean up. Ignore "classic" in non-dashboard contexts (e.g., design
      templates that use "classic" as an adjective).
- [ ] Verify no dead references remain: `grep -rn '/classic' lib/ commands/`.
- [ ] Tests: `npm test` + `npm run lint` green. No test should reference
      /classic (if any do, update them).
- [ ] Add ticket comment about hq/web follow-up in bobbycode-pro.

## Risk areas

- **`commands/dashboard.js` deletion might break imports.** The `app` command
  already has `.alias('dashboard')`, but verify that nothing else imports from
  `commands/dashboard.js` directly. `grep -rn "dashboard.js" bin/ commands/`.
- **Plugin seam.** Pro plugins may reference the `/classic/` mount path. Check
  `lib/dashboard/plugins.js` for any `/classic/` references.
- **User muscle memory.** `bobby dashboard` still works (it's an alias of `app`).
  The change is only the removal of the separate command file and the /classic
  URL path.

## Dependencies

- TKT-023 (RelayTransport proven) — satisfied; the App over relay works.
- TKT-068 (converged trunk) — satisfied.

## Feature Context (parent TKT-020)

- **Depends on:** TKT-023 (proves the App replaces hq/web), TKT-068 (converged
  trunk with the app command).
- **Provides:** A cleaner codebase — one command, one dashboard, one URL.
  No more "which UI am I looking at?" confusion.
- **Deviations:** hq/web deletion is documented as out-of-scope for this repo
  (it lives in bobbycode-pro). The AC is updated to reflect this.

## Complexity

**Simple** — file deletion + line removal + doc updates. No new code. The
blast radius is cosmetic: a URL and some messaging go away.
