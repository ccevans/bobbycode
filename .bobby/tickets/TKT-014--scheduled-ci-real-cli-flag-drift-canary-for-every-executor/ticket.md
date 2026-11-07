---
id: TKT-014
title: 'Scheduled CI: real-CLI flag-drift canary for every executor'
stage: backlog
type: improvement
priority: medium
area: dashboard
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-001
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

The per-PR verification rule (every flag cited to a real CLI run) proves an
executor's argv is correct at merge time — and nothing after that. Harness
CLIs ship weekly; if cursor-agent or codex renames a flag, CI stays green and
the first signal is a user's failed dashboard run. Close the gap with a
scheduled GitHub Actions workflow (weekly cron + manual dispatch, NOT
per-commit) that checks for flag drift against the real binaries, no
accounts required.

Mechanism — the parse-vs-auth control test proven during cursor-agent
verification: an agent CLI parses argv before checking auth, so Bobby's
exact command line run unauthenticated must fail with an authentication
error, never `unknown option`. Two probes per executor flavor:

1. **Acceptance probe:** build argv via the flavor's real `buildArgs`
   (import from lib/dashboard/executor.js — never hand-copy flags into the
   workflow) with a trivial prompt and every option Bobby can emit
   (outputFormat, model, each permissionMode mapping). Run it in a temp dir.
   PASS if the failure is auth/login-shaped; FAIL if output matches
   unknown-option/unrecognized-flag patterns.
2. **Control probe:** same argv plus `--bobby-definitely-not-a-flag`. This
   MUST fail with unknown-option — proving the CLI still rejects bad flags
   at parse time and probe 1 isn't vacuously passing (e.g. a CLI that
   ignores unknown flags, or an install failure swallowing everything).

Per flavor in the workflow matrix:
- claude: install via npm; probe `-p --output-format stream-json --model x
  --permission-mode <each>`
- cursor-agent: install via curl script; probe `-p --output-format
  stream-json --model x --trust --force` and `--mode plan`
- codex and later flavors: added by their executor tickets — extend this
  ticket's AC into TKT-004/TKT-009 ("register the flavor in the canary")

Failure handling: the workflow opens (or updates, never duplicates) a GitHub
issue titled "flag drift: <flavor>" with the argv, the output, and which
probe failed. Scheduled-only failures must not block PR CI — this is a
canary, not a gate. Installer failures report as their own distinct outcome
(`install-failed`), not as drift.

Also emit the CLI's `--version` in the job summary so an issue can say
"drift appeared between cursor-agent X and Y."

## Acceptance Criteria

- [ ] `.github/workflows/flag-canary.yml` runs weekly + on manual dispatch,
      never on push/PR
- [ ] Argv comes from the real buildArgs functions via a small node script —
      grep proves no flag string is duplicated in the workflow file
- [ ] Both probes implemented per flavor; a canary leg fails only on
      unknown-option (drift) — auth failure is the passing state
- [ ] Control probe failing (unknown flags no longer rejected) is reported
      as drift too, with its own message
- [ ] Installer failure reported as install-failed, distinct from drift
- [ ] On failure: idempotent GitHub issue with flavor, versions, argv, output
- [ ] claude + cursor-agent legs live; TKT-004/TKT-009 ACs extended to
      register future flavors in the canary
- [ ] README support matrix (TKT-006) notes each executor is canary-monitored


## Comments
