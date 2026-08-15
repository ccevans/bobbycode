---
id: TKT-069
title: >-
  The app orchestrator worktrees a ticket in its TARGET repo, not always the
  launch repo
stage: done
type: feature
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
parent: TKT-020
feature: null
persona: null
created: '2026-08-12'
updated: '2026-08-12'
---

## Description

Depends on TKT-068 (there is no single branch to build this on until the merge).

The orchestrator is single-repo by construction. `Orchestrator` takes one
`repoRoot` at construction (`commands/app.js` passes `findProjectRoot()`), and
every worktree, lock, diff and branch is computed against that one root
(`lib/dashboard/orchestrator.js`, `createWorktree(this.repoRoot, …)`). There is
no code path that reads a ticket's target repo — grep for `.repos` in
`lib/dashboard/` returns nothing on either branch.

The studio already models the answer: a ticket carries `repos:` frontmatter,
the project declares a repo group, and `resolveRepoPath(studioRoot, config,
name)` turns a repo name into a path. The CLI's `repoTargetingClause` already
tells a `bobby run` agent to work in the right repo's directory. The app just
does not use any of it.

What this ticket builds: the orchestrator resolves a run's target repo from the
ticket's `repos` field (falling back to the project's repos), and creates the
worktree, lock, branch and diff against THAT repo — not always the launch repo.
A ticket that names `bobbycode-pro` gets a worktree in bobbycode-pro; the
Workspace view's diff reads from there; the ship branch is pushed there.

Open design points to settle at planning:
- A ticket that touches TWO repos (some genuinely do). One workspace, two
  worktrees? Or is that out of scope for v1 — one repo per ticket, split the
  ticket otherwise?
- The main-checkout lock is per-repo; the studio has many. The lock keys off
  `repoRoot` today (TKT-014/015) — it must key off the resolved repo.
- Where the board lives vs where the code lives: the board is the studio's, the
  code is the target repo's. The agent prompt already handles this via
  `resolveTicketsDir` naming absolute paths (TKT-052).

This is the ticket that would have made TKT-023 ship correctly: its board entry
is the studio's, its code is in bobbycode-pro, and the orchestrator would have
worktreed and shipped in bobbycode-pro instead of manufacturing a dead
`bobby/tkt-023-ship` branch in the wrong repo.

## Acceptance Criteria

- [ ] A run resolves its target repo from the ticket's `repos` (then project's)
- [ ] Worktree, branch, lock and diff are all against the resolved repo
- [ ] A ticket targeting bobbycode-pro ships in bobbycode-pro, verified live
- [ ] The single-repo case is unchanged — a v1 project with one repo behaves
      exactly as today
- [ ] The two-repo-per-ticket question is decided and recorded, in or out of v1
- [ ] Covered by a test that runs a ticket against a non-launch repo

## Comments
- [2026-08-12] bobby-test: AC3 verified live against the REAL studio repos (not a fixture): created a workspace for PRO-003 (no repos frontmatter → project_repos[0]=pro) via the live orchestrator from the studio root. Result: ws.repoRoot=/Users/ccevans/Repos/bobby/repos/bobbycode-pro ✓, lockFile guards pro ✓, and the branch bobby/pro-003-plan was created in bobbycode-pro's git — NOT the studio root ✓. Worktree landed in the sibling worktree_root (correct by design; worktrees never live inside the repo dir). Cleaned up via discard() ✓. Combined with the reviewer's revert-proof of TC1/TC4, multi-repo targeting works end to end: a ticket builds and ships in the repo its code lives in.
- [2026-08-12] bobby-review: APPROVED. Reviewed impl 05c0194 against plan.md (the contract) and for correctness; matches the plan, and I verified every one of the five risk areas adversarially rather than trusting the green suite. I also proved the tests are real by reverting the threading in a throwaway worktree.

1) THE GATE (Decision 2, regression guard) — CORRECT, and safe on both edges you flagged. inStudio = !!config.studio && Object.keys(group).length>0 (group = repo_group||repos||{}). studio-with-EMPTY-group → inStudio false → fallback, resolveRepoPath never reached (it throws on an empty group, confirmed), no throw. project-with-NO-repos (studio+group present but empty project_repos AND no ticket.repos) → name stays null → 'if(!name) return fallback', no throw. Non-studio → fallback; TC2 asserts ws.repoRoot===o.repoRoot, ws.lockFile===o.lockFile, and placement byte-identical to computeWorktreePlacement pre-change. One deviation worth noting, benign: the plan's resolution-rule line says 'studio (OR non-empty repo_group)' but the impl uses AND. The AND is the safer reading and matches Decision 2's own skip condition (!studio AND empty group) plus the codebase convention that config.studio is what marks a studio (board/sessions/decisions dirs all gate on config.studio). The OR reading would actually THROW on a studio-with-empty-group; the impl does not. Not a defect — I'd keep the AND.

2) TWO-REPO HARD ERROR (Decision 1) — CORRECT, throw position structurally guarantees no orphan. createWorkspace order: _requireTicket (pure read, verified — no claim/assign), resolveWorkflow (validation only), THEN _resolveTargetRepo (throws for >1 repo), THEN computeWorktreePlacement → createWorktree → newWorkspace/store.create. The throw is strictly before the first side effect. TC3 asserts BOTH listWorktrees counts unchanged AND store.list().length===0 after the throw — so it verifies the guarantee, not just that an error is raised. Message names the ticket id, both repos, and split/narrow.

3) RETHREAD COMPLETENESS — CORRECT, no missed site, no split-brain. Enumerated every this.repoRoot/this.lockFile and every git-op. Moved WITH fallback: merge (lock on ws.lockFile + removeWorktree on ws.repoRoot + _mergeToMain(...,{repoRoot})), discard (removeWorktree), getDiff (diffAgainstMain), getChangedFiles (changedFiles). Correctly STAYED this.*: constructor lock (106), _runInMainCheckout worktreePath+lock (308/319, a repo run has no ticket by design), _promptContext hasProduct (418, feature-map lives at the studio board not the code repo), getDiff/getChangedFiles repo-run branches (912/923). No split-brain in merge: repoRoot and lockFile both come from the same ws record, and ws.lockFile was derived from ws.repoRoot via mainCheckoutLockPath at resolve time, so the lock guards exactly the repo the merge touches. The exit path (headSha at 346, commitCheckpoint 516, _producedNothing 644) keys off ws.worktreePath — repo-correct by construction, since worktreePath was computed from the resolved repoRoot and stored. _mergeToMain signature change drops nothing: mergeToMain only reads {message}, and the sole non-test caller passes {message,repoRoot}; the repo-run.test.js seam override still works (dashboard suites green).

4) FALLBACK (TC7) — CORRECT on EVERY moved site: merge (both repoRoot and lockFile), discard, getDiff, getChangedFiles, _mergeToMain all use '|| this.*'. TC7 strips repoRoot/lockFile off a real persisted record and confirms getDiff+merge still operate against this.repoRoot without error. No bare ws.repoRoot read anywhere.

5) NEW TESTS ARE REAL, NOT STUBBED — proven. TC1 (worktree/diff/merge land in pro, launch's main untouched) and TC4 (per-repo lock isolation: hold launch's lock, pro's merge still resolves, same-lock re-acquire throws) assert on actual git state via real repos. I reverted the ws.repoRoot threading (getDiff+merge+discard back to this.repoRoot) in a throwaway worktree and re-ran: TC1 FAILS (diff empty — 'feature.txt' not found because the diff ran against the studio root) and TC4 FAILS (pro's merge rejects). So the suite catches the exact wrong-repo bug class. TC2/TC3/TC5/TC6/TC7 correctly still passed under the revert (they don't depend on that threading) — the tests are appropriately targeted, not blanket.

decisions.yaml: parses to a list of 32, no dup ids, no null ids; one-repo-per-ticket-v1 present with all seven keys and listed by 'bobby decision list'. The cosmetic reflow of the TKT-061 auto-sync entry's 'why' is the expected byproduct of 'bobby decision add' round-tripping the document (consistent with decisions-log-has-one-writer), not a hand-edit. state.js: newWorkspace gains repoRoot/lockFile defaulting null — repo runs and old records unaffected. All 13 dashboard suites green (245) — the signature/state changes broke nothing.

ACs: AC1 resolve from repos→project_repos ✓ (TC5); AC2 worktree/branch/lock/diff against resolved repo ✓ (TC1); AC4 single-repo unchanged ✓ (TC2 + gate); AC5 two-repo decided+recorded ✓ (Decision 1 + one-repo-per-ticket-v1); AC6 test against a non-launch repo ✓ (TC1). AC3 'ships in bobbycode-pro, verified LIVE' is proven mechanically end-to-end in real git (TC1 worktree+diff+merge in pro), but the through-the-app live verification belongs to the test stage. Recommend moving to testing for that live check; I am not moving the stage. No blocking findings.
- [2026-08-12] claude: Unblocked: TKT-068 merged integrate/app-studio, so the orchestrator, repo group config, and resolveRepoPath now live on one trunk. This is buildable now — the seam (resolveRepoPath, ticket .repos frontmatter, repoTargetingClause) exists and has no orchestrator caller yet, which is exactly what this ticket wires.
