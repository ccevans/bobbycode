# Test Cases — TKT-026: Delete /classic

## TC-1: /classic route returns 404

**Precondition:** Server running with the App active (appDir set).
**Steps:**
1. GET `/classic/`.
**Expected:** 404 (no route for GET /classic/). Previously this served the
classic dashboard.

## TC-2: / still serves the dashboard

**Precondition:** Server running (free tier, no Pro app).
**Steps:**
1. GET `/`.
**Expected:** 200 with the dashboard HTML from `templates/dashboard/index.html`.
The free-tier default dashboard still works.

## TC-3: / serves the App when Pro is active

**Precondition:** Server running with BOBBY_APP_DIR or Pro installed.
**Steps:**
1. GET `/`.
**Expected:** 200 with the App UI from the Pro package.

## TC-4: `bobby dashboard` still works as an alias

**Steps:**
1. Run `bobby dashboard --help`.
**Expected:** Shows the same help output as `bobby app --help` (alias works).
No error about unknown command.

## TC-5: No startup message about /classic

**Precondition:** Server starts with Pro app active.
**Steps:**
1. Read the startup console output.
**Expected:** No line mentioning "Classic dashboard" or "/classic/". The
"old UI lives at /classic/ for one release" message is gone.

## TC-6: commands/dashboard.js is deleted

**Steps:**
1. Check `ls commands/dashboard.js`.
**Expected:** File does not exist.

## TC-7: No dead references to /classic in source

**Steps:**
1. Run `grep -rn '/classic' lib/ commands/ bin/`.
**Expected:** No matches (excluding any "classic" used as a general English
word in comments unrelated to the dashboard route).

## TC-8: npm test passes

**Steps:**
1. Run `npm test`.
**Expected:** All tests pass. No test references /classic.

## TC-9: npm run lint passes

**Steps:**
1. Run `npm run lint`.
**Expected:** No lint errors.

## TC-10: Free-tier documentation is accurate

**Steps:**
1. Read README.md sections about the dashboard.
**Expected:** No mention of "/classic/". The free-tier dashboard is described
as the default at `/`, not as a "classic" fallback.
