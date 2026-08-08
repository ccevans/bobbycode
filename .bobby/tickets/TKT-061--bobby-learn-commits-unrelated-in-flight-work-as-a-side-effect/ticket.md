---
id: TKT-061
title: bobby learn commits unrelated in-flight work as a side effect
stage: reviewing
type: bug
priority: high
area: cli
author: unknown
assigned: bobby-build
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

`lib/auto-sync.js` `autoSync()` stages and commits EVERY Bobby-managed path,
not the files the command actually touched:

    const paths = getBobbyPaths(rootDir);      // .bobby, .claude/skills,
                                               // .claude/agents, .claude/commands,
                                               // CLAUDE.md, .bobbyrc.yml, ...
    execSync(`git add -- ${pathArgs}`);
    execSync('git commit -m "bobby: auto-sync"');

Callers: commands/learn.js, commands/triage.js, commands/retro.js,
commands/sync.js, lib/targets/cursor.js.

So `bobby learn "..."` — a command whose stated job is to append one line to a
learnings file — commits every uncommitted change under `.bobby/` and
`.claude/`, including work someone else is midway through.

OBSERVED, not theoretical: during this session an agent ran `bobby learn` while
another agent had uncommitted edits to `.bobby/design/design-spec-feature-view.md`
and several ticket files. Those were swept into a commit titled "Auto-synced
Bobby data" that nobody asked for. It had to be undone with `git reset --soft
HEAD~1`. A second agent later stashed the same file to get a clean lint
baseline, for the same underlying reason: the repo's Bobby state is shared
mutable ground and these commands treat all of it as theirs.

WHY IT MATTERS BEYOND TIDINESS: Bobby's own model is many agents working one
repo at once (that is what the concurrency cap and the main-checkout lock from
TKT-014/015 exist for). A command that commits whatever it finds is a race
against every other agent, and it is silent — `info('Auto-synced Bobby data')`
is the only trace.

THE FIX IS A JUDGEMENT CALL, which is why this is filed rather than patched:

(a) Scope the commit to the paths the calling command actually wrote. Correct,
    and means each caller must declare them.
(b) Keep the blanket add but refuse when anything unrelated is dirty, telling
    the user what it found. Safe, but noisy in a repo that is usually dirty.
(c) Make auto-sync opt-in via config, defaulting off. Least surprising; changes
    behaviour for anyone relying on it today.

(a) looks right — it is the same shape as several fixes this session: stop
doing the broad thing and name the narrow one. But it touches five callers, so
it deserves its own pass rather than being assumed.

## Acceptance Criteria

- [ ] `bobby learn` commits only what it wrote
- [ ] The same holds for triage, retro, sync and the cursor target
- [ ] Uncommitted work by another process is never swept into a Bobby commit
- [ ] The chosen approach is recorded in decisions.yaml with its trade-off
- [ ] Covered by a test that dirties an unrelated Bobby path and asserts it
      survives the command uncommitted

## Steps to Reproduce

1. In a Bobby project, edit any file under `.bobby/` and leave it uncommitted.
2. Run `bobby learn bobby-build "something" "a description"`.
3. `git log -1` shows a "bobby: auto-sync" commit containing your unrelated
   edit, which you never asked to commit.

## Comments
- [2026-08-08] bobby-build: Built: scoped autoSync to caller-declared paths. Updated autoSync signature, learn.js, triage.js, retro.js callers. Added 5-test suite in test/lib/auto-sync.test.js. Recorded decision in decisions.yaml.
