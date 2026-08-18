---
id: TKT-072
title: 'CI is red on main: createProject''s initial commit fails on Linux runners'
stage: building
type: bug
priority: high
area: null
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-08-17'
updated: '2026-08-18'
---

## Description

CI has been red on `main` since a3fe211 (the PR #11 merge), on all three Node
versions in the matrix. Three tests in `test/lib/project.test.js` fail on the
ubuntu runner:

- `createProject › returns the facts a caller needs instead of printing them`
- `createProject › makes the initial commit`
- `createProject › reports the commit outcome as fields rather than as output`

They are exactly the three tests that assert `result.committed === true`, so
`createProject`'s best-effort initial commit (`lib/project.js:153-159`) is
failing on Linux. The commit is wrapped in try/catch and reported as fields, so
the scaffold itself still completes — the product behaviour degrades quietly and
only the tests notice.

This is not caused by TKT-021/TKT-022 (PR #12). `test/lib/project.test.js` and
`lib/project.js` are untouched by that branch, and the same three tests fail on
main's own run for a3fe211.

**What is already ruled out.** The obvious cause — a CI runner with no git
identity — appears to be handled already: the test's `beforeEach` sets
`GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_EMAIL`
on `process.env`, `lib/project.js` spawns git with no `env` override so the
child inherits them, and those four variables were confirmed sufficient for
`git commit` with no user config present at all. The suite also passes locally
on macOS both in isolation and in full (`--ci`, 1275 passed) with the global git
identity stripped via `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`/`HOME`. So the
cause is specific to the Linux runner and is not reproducible on this machine
(no Docker available here to reproduce faithfully).

**Why the root cause is still unknown.** The failing assertion is
`expect(result.committed).toBe(true)`, which prints only `true`/`false` — the
captured `commitError` string is never surfaced, so CI has never actually told
us why git refused. One incidental difference worth noting: `git init` produces
branch `master` on the runner and `main` locally.

**Suggested first step:** make the failure self-describing — assert on
`commitError` (e.g. `expect(result.commitError).toBeNull()` first, or include it
in the `committed` assertion message) so the next CI run reports the real git
error instead of a bare boolean. Fix from there.

## Acceptance Criteria

- [ ] The three `test/lib/project.test.js` failures pass on ubuntu for Node 18, 20 and 22
- [ ] The root cause is identified from a real git error message, not inferred
- [ ] A failure of the scaffold commit surfaces `commitError` in the test output, so a future regression names its own cause
- [ ] CI is green on `main`

## Steps to Reproduce

1. Push any branch and open a PR against `main` (or look at the run for a3fe211 on main).
2. Watch the `test` job on any Node version in the matrix.
3. Expected: suite green. Actual: 3 failed, 46 skipped, 1272 passed — all three failures in `test/lib/project.test.js`, all on `committed === true`.

## Comments
