---
name: bobby-freewill
description: "Freewill Skill: one agent takes a ticket from start to shipping on deliberately few instructions — built for Opus 5 and Fable 5, which work better from a goal and constraints than from a script. MANDATORY TRIGGERS: freewill, free will, freewill mode, one agent, single agent, minimal instructions, skip the ceremony, no ceremony, just do the ticket, run it end to end."
argument-hint: "<ticket ID>"
---

# Bobby Freewill Skill

> One agent takes the ticket from wherever it is to shipping. You get the goal, the
> constraints you could not have inferred, and nothing else. Every other decision is yours.

## Why this file is short

Bobby's other build skills are long on purpose — they were written for models that drift
without a script. Opus 5 and Fable 5 do not need the script, and on them a long one costs
you something real: attention spent on compliance, and an agent that finishes the checklist
instead of the ticket. Prescribed procedure also caps the work at whatever the procedure's
author imagined; your own read of this codebase is usually better.

So this file states only what you cannot work out by reading the repo — Bobby's conventions,
the invariants, and where you must stop. How to approach the problem, whether the test comes
first, how far to refactor, what evidence is convincing: your call, and you own the outcome.

**Do not add steps to this file.** If freewill keeps getting something wrong, that is a
learning (`bobby learn bobby-freewill "pattern" "description"`), or a sign that kind of
ticket belongs in the default workflow. It is not a reason to grow a procedure here.

## When not to use freewill

Freewill collapses plan → build → review → test into one agent, so it gives up the thing
those stages exist for: a second pair of eyes that did not write the code. Say so and route
elsewhere when the ticket is:

- **Security-sensitive** — auth, payments, crypto, secrets, permissions, user data. Use
  `--workflow secure`; a self-review is not an audit.
- **Underspecified** — you cannot state the acceptance criteria in your own words after
  reading `ticket.md`. Use the default workflow, or `bobby run vet {ID}` first.
- **An epic**, or big enough that you would want the plan reviewed before code exists.

Freewill's home ground is a ticket whose intent is clear and whose blast radius you can see.

## What you cannot infer from the codebase

1. **The ticket is the contract.** `.bobby/tickets/{ID}*/ticket.md` — its Description and
   Acceptance Criteria are the deliverable. Do not quietly widen or narrow them. If you think
   the ticket is wrong, say so in one or two sentences, then build it as written and flag it.
2. **Stage is tracked by the CLI, not by editing files.** `bobby ticket move {ID} ship` when
   done, `bobby ticket move {ID} block "reason"` when you cannot finish. Hand-editing
   frontmatter does not register.
3. **Never commit to main/master.** `git branch --show-current` first; if you are on it,
   `git checkout -b tkt-{ID}` before writing anything.
4. **Finish clean.** Commit every file you changed. `git status --short` must be clean when
   you are done — an uncommitted change is invisible to every stage after you.
5. **Evidence, not assertion.** Paste the test and lint output. "Tests pass" without the
   output is not a claim anyone downstream can act on.
6. **Durable lessons go in learnings**, not in your final message: `bobby learn bobby-freewill
   "pattern" "description"`.

## Invariants

<safety_rules>
Follow the Safety Rules in `CLAUDE.md`. They are not negotiable and they are not
subject to your judgment: no `rm -rf`, `DROP TABLE`, `git push --force`, `git reset --hard`,
or `git clean -fd`; no edits to `.env`, credentials, or CI config unless the ticket explicitly
calls for it; no global installs or system config changes.
</safety_rules>

**Scope lock.** Run `git diff --stat` before you commit. Every file in it should be one you
can tie to the ticket in a sentence. Fixing an unrelated thing you noticed on the way is
scope creep — file it with `bobby ticket create` instead.

## The self-review that replaces the review stage

You removed the reviewer, so you do the reviewer's job deliberately, not as an afterthought.
Before moving to shipping, re-read your own diff as though someone else wrote it and you are
looking for the reason it is wrong: the caller you did not update, the case the test does not
cover, the assumption that holds only for the input you happened to try. Then run the tests.

If that pass finds nothing, say what you checked. "Self-review found nothing" tells the next
person nothing.

## Stopping

Stop and hand back rather than guessing when the ticket contradicts itself, when the fix
demands a decision the ticket has no authority to make, or when you have failed the same way
three times. `bobby ticket move {ID} block "what you tried, and the specific decision you
need"`. A precise block beats a confident wrong build.

## Project overrides

If `.claude/skills/bobby-freewill/SKILL.local.md` exists, read it and follow it. It holds
this project's own instructions for this skill and **wins** wherever it conflicts with
anything above — including the "do not add steps" rule, which binds Bobby, not you.

`SKILL.md` is shipped by Bobby and is replaced on every upgrade — edits here are lost.
`SKILL.local.md` is yours and is never overwritten.
