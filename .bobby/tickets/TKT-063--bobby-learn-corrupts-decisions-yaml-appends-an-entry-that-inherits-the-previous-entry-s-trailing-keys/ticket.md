---
id: TKT-063
title: >-
  Nothing writes decisions.yaml — the seed points agents at `bobby learn`, which
  never touches it
stage: done
type: bug
priority: high
area: cli
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-08-09'
updated: '2026-08-09'
---

## Description

**Filed under a wrong title.** It was originally "bobby learn corrupts
decisions.yaml — appends an entry that inherits the previous entry's trailing
keys". `bobby learn` does not touch `decisions.yaml` at all. Retitled to the
actual defect; the observed corruption is a symptom of it.

`.bobby/decisions.yaml` HAS NO WRITER. Nothing in the codebase appends to it:

    $ grep -rn "decisions.yaml" commands lib | grep "\.js:"
    commands/init.js:211-214   # copies the seed template, once
    commands/init.js:789       # prints "Created …/decisions.yaml"
    lib/studio.js:71,80,115    # seeds an EMPTY file per project
    lib/agent-registry.js:285  # tells the arch AGENT to "seed" it

`commands/learn.js` reads and writes exactly one file — the skill's
`learnings.local.md` — and then calls `autoSync`. It never opens
`decisions.yaml`.

Meanwhile three things tell agents to write it:

1. `templates/bobby/decisions.yaml` line 3, shipped into every project:
   "Seeded by `bobby run arch`. **Updated via `bobby learn` or manually.**"
   The first half of that sentence is true; the second is false and it is the
   line an agent reads before deciding how to record a decision.
2. `templates/agents/bobby-arch.md.ejs:119` — "If it exists, add any new
   decisions you discovered."
3. Ticket acceptance criteria written by Bobby itself, e.g. TKT-061's
   "The chosen approach is recorded in decisions.yaml with its trade-off".

So every entry in that file has been appended by an LLM hand-editing YAML, with
no parse, no schema check, and no round-trip. That is where the malformed entries
come from. Two real examples on `feat/bobby-app`:

- `5e8b129` (TKT-061) — the append deleted the commented Example block, which
  was the file's only in-band documentation of the entry format. Every later
  agent appends to a file that no longer explains itself.
- `47af329` (TKT-062) — the diff opens by ADDING `supersedes: null` /
  `invalidated: null` before its own new entry: the previous entry had lost its
  trailing keys and the next append had to repair them. That repair is what the
  original title was describing.

**Second defect, same file.** The two seeds disagree on the schema:

- `templates/bobby/decisions.yaml` → a bare top-level LIST (`- id: …`)
- `lib/studio.js:80,115` → `decisions: []`, i.e. a MAPPING with a `decisions` key

A studio project and an ordinary project therefore ship structurally different
`decisions.yaml` files under the same name. Nothing crashes today only because
no code reads the file — the sole consumer is `bobby-review`, in prose. The
moment anything parses it, one of the two shapes breaks.

**The fix is a judgement call**, which is why this is filed rather than patched:

(a) Add a real writer — `bobby decision add --id … --fact … --why … --ticket …`
    that loads the YAML, appends a validated entry, and dumps it back. Agents
    stop hand-editing. Most work; makes the file as safe as tickets are.
(b) Writer plus `bobby decision list/invalidate`, so superseding is also a
    command rather than an edit. Bigger surface.
(c) Documentation only: correct the seed's false `bobby learn` claim and tell
    agents to re-read and parse the file after editing. Cheapest, keeps the
    freehand editing that caused the problem.

(a) looks right, and it is the same shape as the fix TKT-061 took: stop relying
on an agent doing the careful thing by hand and give it a command that cannot
get it wrong. Whichever is chosen, the false line in the seed and the
studio/template schema split must both go — those are defects on any path.

## Acceptance Criteria

- [x] `templates/bobby/decisions.yaml` no longer claims `bobby learn` updates it
- [x] `lib/studio.js` and `templates/bobby/decisions.yaml` seed the SAME schema,
      and a test asserts a studio project's file and an `init` project's file
      parse to the same shape
- [x] Appending a decision no longer requires hand-editing YAML — an agent has a
      command that round-trips the file
- [x] Appending preserves every existing entry's keys, verified by a test that
      appends to a file whose last entry ends in `supersedes`/`invalidated` and
      asserts both survive with the same values
- [x] A malformed or unparseable `decisions.yaml` fails loudly rather than being
      silently overwritten
- [x] `bobby-arch`'s and `bobby-review`'s instructions point at whatever the new
      mechanism is

## Steps to Reproduce

1. `grep -rn "decisions.yaml" commands lib | grep "\.js:"` — no write path
   outside `init` seeding and `studio.js`.
2. In a Bobby project, run `bobby learn bobby-build "x" "y"`, then
   `git diff -- .bobby/decisions.yaml`. Expected per the file's own header: the
   decision log can be updated by `bobby learn`. Actual: the file is untouched;
   only `learnings.local.md` changed.
3. `node -e "console.log(require('js-yaml').load(require('fs').readFileSync('.bobby/decisions.yaml','utf8')))"`
   in a studio project vs. an `init` project — a mapping in one, a list in the
   other.

## Comments
- [2026-08-09] bobby-build: Built option (a): `bobby decision add` in lib/decisions.js + commands/decision.js, round-tripping the YAML Document so comments and prior entries survive. Format block moved above the '---' marker so an append cannot consume it. studio.js and init.js now share one seed. bobby-arch and bobby-review point at the command. 20 new tests (test/lib/decisions.test.js, test/commands/decision.test.js, plus a schema-parity test in studio.test.js). Deliberately NOT wired to autoSync — that would extend TKT-061. Not built: `bobby decision invalidate` (option b) — retiring a decision is still a hand-edit of one field.
