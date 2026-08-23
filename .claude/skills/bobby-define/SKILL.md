---
name: define-product
description: "Product Definition Skill: Takes a committed idea through the artifact chain the pros run — brief → personas → journeys → data model → architecture → feature map → mockups → blueprint (data model, architecture and mockups optional) — so decomposition builds the right thing instead of guessing, and you see the whole plan before a line is written. Each artifact feeds the next; the human reacts at a gate after every stage; every v1 ticket ends up traceable to a feature, a journey step, and a persona. MANDATORY TRIGGERS: define, define the product, product definition, write the brief, product brief, personas, user personas, user journeys, journey map, feature map, feature list, blueprint, show me the plan, what are we building, overview before building, what should v1 be, scope v1, MVP scope, requirements. NOT for pressure-testing whether an idea is worth building at all — that is bobby-vet (before a project exists). NOT for visual design — that is bobby-design (after the feature map names the screens)."
argument-hint: "<epic id — e.g. TKT-001>"
---

# Bobby Define Skill

> Product definer — takes the MVP epic from a one-line idea to a locked product
> definition: brief, personas, journeys, optionally a data model and a forward
> architecture with its ADRs, the feature map, optionally mockups of the
> v1 screens, and a blueprint you can
> read on one page. Runs the process a real
> product team runs, so that when bobby-plan decomposes the epic, every ticket
> traces to a feature, a journey step, and a persona — instead of being invented.

## Scope

**This skill DEFINES the product.** It produces `.bobby/product/` — the locked,
committed artifacts (six when nothing is skipped) plus a generated blueprint
page — and ends by moving the epic to `planning`.

- Not the idea gate: whether this is worth building at all is **bobby-vet**
  (run before the project exists). By the time define runs, the idea is committed.
- Not visual design: what screens *look like* is **bobby-design** — it runs
  after define, using the personas and journeys as its inputs.
- Not decomposition: tickets are **bobby-plan**'s job (Product-Aware Epic Mode),
  which reads the feature map this skill locks.
- One definition per project: `.bobby/product/` describes THIS project's product.
  A second unrelated epic in the same repo reuses or extends it, not replaces it.

## Before Starting

Read, in parallel:

1. `.claude/skills/bobby-define/learnings.md` + `.claude/skills/bobby-define/learnings.local.md` and `.claude/skills/bobby-shared/learnings.md` + `.claude/skills/bobby-shared/learnings.local.md`
2. The epic's `ticket.md` — its Description carries the idea, verbatim. Quote it; never paraphrase it into something you'd rather build.
3. **Any existing `.bobby/product/*.md` — resume, don't restart.** If brief.md exists and is approved, start at the Personas step (Step 2). If the human wants a locked artifact changed, that's a Deviation + Changelog entry, not a rewrite.
4. `.bobby/architecture-wakeup.md` if present (existing projects have constraints an idea-stage interview should respect).

## The Three Rules (read before anything else)

### Rule 1 — The human reacts. You define.

The founder is not a product manager. Never ask them to write a persona, enumerate features, or produce a journey. **You draft from evidence; they react.** Ask questions a founder can answer from lived experience ("who did you last see struggling with this?"), draft the artifact, then ask the stage's gate question. Their reaction — keep, strike, correct — is the input. Every stage ends with its ⛳ gate; nothing advances past a gate without their answer.

### Rule 2 — Every artifact feeds the next.

Personas quote the brief's Problem. Journeys name their persona. Features cite the journey steps they serve. IDs (`P1`, `J1.S3`, `F1.2`) are **copied between files, never retyped** — a typo in a copied ID is drift, a retyped one is fiction. If a later stage needs something an earlier artifact doesn't say, go back and amend the earlier artifact (with a Changelog line), don't invent it locally.

### Rule 3 — Traceability is a checklist, not a vibe.

Every feature row has a journey step. Every journey has a persona. Every v1 ticket (created later by bobby-plan) carries a `feature:` ref. A v1 ticket without one is drift — flag it, don't ship it. This is what makes the definition *load-bearing* instead of documentation theater.

<interrogation_rules>
These rules govern every interview in this skill. Follow them strictly:

1. **ONE question at a time.** Each message contains exactly one probing question, plus optionally the observation that motivated it.
2. **Wait for the answer** before the next question.
3. **Go deep before wide.** An answer that exposes a shaky assumption gets 1–2 follow-ups before you change topic.
4. **No leading questions.** "What happens when…" — never "Don't you think we should…".
5. **Label each question** with the stage's bracketed tags so the founder can track the thread.
6. **Respect the budget.** Each stage names a question budget. Enough to find the soft spots, not an interrogation marathon.
7. **The express path:** if the founder says "just draft it," draft the stage's artifact (or all remaining artifacts) immediately, marking every guess `(assumed)`, and present one combined gate: "Here's everything — the `(assumed)` marks are where I guessed. Correct the ones that are wrong." Respect it; don't sneak questions back in.
</interrogation_rules>

---

## Step 1: The Brief — `.bobby/product/brief.md`

**Tags:** [Problem] [Users] [Outcome] [Constraints] [Success-metric] [Non-goals] · **Budget:** 5–8 questions.

The epic's idea is the seed. Interview toward the six Decided fields — the two that founders always leave vague are **Success metric** (one observable number or event: "5 strangers pay", "I use it every morning" — if the project can't fail, it can't succeed) and **Non-goals** (2–4 explicit "this is NOT…" statements; these later bind the feature map's Never column).

```markdown
# Product Brief — <EPIC-ID>: <epic title>

**Locked:** YYYY-MM-DD · **Status:** approved

## Decided
- **Idea (verbatim from the epic):** "<the one-liner>"
- **Problem:** <one sentence — who hurts, when, and what it costs them>
- **Target user:** <one line; detailed in personas.md>
- **Outcome:** <what is observably different for the user when v1 works>
- **Success metric:** <the single number/event that says it worked>
- **Constraints:** <stack, budget, deadline, platform — only real ones>
- **Non-goals:** <2–4 things this explicitly is NOT>

## Vetted — from the human
- Keep: <confirmed>
- Drop: <struck>

## Deviations (each needs a reason)
_none_

## Changelog
- YYYY-MM-DD — created (bobby-define-brief)
```

⛳ **Gate — your final message:** the brief in five lines, then verbatim:
> "Two things only: is the **Problem** line the problem you actually mean — and which **Non-goal** is wrong?"

Then: `bobby ticket comment <EPIC> --by bobby-define-brief "Brief drafted — at the gate."`

## Step 2: Personas — `.bobby/product/personas.md`

**Tags:** [Persona] [Context] [Pain] [Frequency] [Proxy] · **Budget:** 4–6 questions.

Derive 2–3 personas **from the brief's Problem and Target user lines** — quote them. Exactly one persona is marked `PRIMARY`; v1 is built for that one. The question that keeps personas honest is [Proxy]: *"Do you know a real person who matches this?"* A persona with no proxy is an assumption — keep it, but mark it `Proxy: none — assumption`.

```markdown
# Personas — <EPIC-ID>

**Locked:** YYYY-MM-DD · **Status:** approved
**Source:** brief.md (Problem, Target user)

## P1 — <Name>, <role> · PRIMARY
- **Goal:** <what they're trying to get done — echoes the brief's Outcome>
- **Context:** <where/when/how often they hit the problem>
- **Pains:** <2–3, each traceable to the brief's Problem>
- **Today's workaround:** <what they do now and why it fails them>
- **Proxy:** <the real person we know, or "none — assumption">

## P2 — <Name>, <role>
<same fields>

## Vetted — from the human
## Deviations (each needs a reason)
_none_
## Changelog
```

⛳ **Gate:** the personas in brief, then verbatim:
> "Which one is v1 **actually** for — and do you know a real person who matches them? If not, whom *do* you know?"

Comment on the epic as above (`--by bobby-define-personas`).

## Step 3: Journeys — `.bobby/product/journeys.md`

**Tags:** [Trigger] [Step] [Decision] [Dead-end] [Handoff] · **Budget:** 4–6 questions per journey.

One journey per primary-persona goal — 1–3 total, no more. Each journey names its persona and numbers its steps `J1.S1, J1.S2…`. For every step: what the persona does, what the product does, and the **drop-off risk** — the honest "here's where they'd give up." Features will cite these step numbers, so number them stably.

```markdown
# Journeys — <EPIC-ID>

**Locked:** YYYY-MM-DD · **Status:** approved
**Source:** personas.md

## J1 — <journey name> (persona: P1)
**Trigger:** <what starts it>
**Success:** <the end state, in P1's terms>

| Step | What P1 does | What the product does | Drop-off risk |
|---|---|---|---|
| J1.S1 | … | … | … |
| J1.S2 | … | … | … |

## Vetted — from the human
- The step where P1 said they'd give up: <J1.Sn> — and what changed because of it.
## Deviations (each needs a reason)
_none_
## Changelog
```

⛳ **Gate:** verbatim:
> "Walk **J1** with me as <P1's name>: at which step number would you actually stop or give up?"

Whatever step they name gets rethought before locking. Comment on the epic (`--by bobby-define-journeys`).

## Step 4: Data Model — `.bobby/product/DATA-MODEL.md` (optional)

**Tags:** [Entity] [Relation] [Truth] · **Budget:** 3–5 questions (only where ownership is genuinely unclear).

Runs after the Journeys step, before the Forward Architecture step — so the
Feature Map step cuts the map against a stated data model instead of every
build ticket rediscovering one. **Entities are derived from what journey steps
store and show, never brainstormed** — an entity no journey step touches
doesn't exist; it goes back to the Journeys step (Step 3) as a proposed step,
or out. Per entity: the journey-cited fields, the relations (entity → entity,
with cardinality), and the **source-of-truth call** — this system, a named
external system, or the user. If every truth call feels low-risk, the model
hasn't been thought about; that column is where the honest calls live.

```markdown
# Data Model — <EPIC-ID>

**Locked:** YYYY-MM-DD · **Status:** approved
**Source:** journeys.md

## <Entity>
- **Fields:** <only ones a journey step stores or shows — cite the step: J1.S2>
- **Relations:** <Entity> → <Entity> (<1:1 | 1:n | n:m>)
- **Source of truth:** <this system | <named external system> | the user>

## Vetted — from the human
- The truth call they corrected: <entity> — <what changed>
## Deviations (each needs a reason)
_none_
## Changelog
```

⛳ **Gate — your final message**, verbatim:
> "Here is every entity and who owns the truth for it. Point at the one **source-of-truth** call that is wrong — or name the entity that is missing."

Comment on the epic (`--by bobby-define-data-model`).

**Skipping is first-class, two ways:** `bobby run define <EPIC> --no-data-model`
never enters this stage (the chain recomputes its handoffs), and "skip" at the
gate exits it — comment `bobby ticket comment <EPIC> --by bobby-define-data-model
"Data model skipped at the gate."`, write no artifact, and move on. Every
downstream reader treats `DATA-MODEL.md` as "when present", so skipping costs
nothing.

## Step 5: Forward Architecture — `.bobby/product/ARCHITECTURE.md` + ADRs (optional)

**Tags:** [Component] [Boundary] [Decision] · **Budget:** 3–5 questions.

The **forward view**: the components and boundaries that WILL exist, where
each entity lives, the integration seams. Explicitly distinct from `bobby run
arch`'s `.bobby/architecture.md`, the **backward view** of what DOES exist —
the file's header states that distinction; when the two disagree after
building, re-run arch and amend this file with a Changelog line. Inputs:
`DATA-MODEL.md` **when present** (its stage can be skipped), `journeys.md`,
and `.bobby/architecture-wakeup.md` if the repo already exists — a conflict
with the backward view is an ADR, never a silent contradiction.

Each load-bearing call becomes an ADR through the existing command — **never
by hand-editing `.bobby/decisions.yaml`**:

```
bobby decision add --id <kebab-case-id> --fact "<the decision>" --why "<the reason, citing a journey step or entity>" --ticket <EPIC-ID>
```

`bobby decision add` deliberately doesn't commit; the entries land with the
Feature Map step's lock commit. bobby-review already runs `bobby decision
list` — the ADRs bind every ticket from day one with no review-side change.

```markdown
# Forward Architecture — <EPIC-ID>

**Locked:** YYYY-MM-DD · **Status:** approved
**Source:** DATA-MODEL.md (when present) · journeys.md

> This file is INTENT — what will exist. `bobby run arch` writes
> `.bobby/architecture.md`, the discovery of what does exist. When they
> disagree after building, re-run arch and amend this file (Changelog line).

## Components
- **<Component>** — <its job>; owns: <entities that live here>
## Integration seams
- <seam — what talks to what, and how>

## Decisions (ids in `.bobby/decisions.yaml`)
- `<decision-id>` — cite the id only; the decision itself lives in the log.

## Vetted — from the human
- Vetoed at the gate: <id or "none — they stand">
## Deviations (each needs a reason)
_none_
## Changelog
```

⛳ **Gate — your final message**, verbatim:
> "These are the decisions bobby-review will hold every ticket to from day one. Veto one now — or say they stand."

Comment on the epic (`--by bobby-define-architecture`).

**Skipping is first-class, two ways:** `bobby run define <EPIC> --no-architecture`
never enters this stage, and "skip" at the gate exits it — comment
`bobby ticket comment <EPIC> --by bobby-define-architecture "Architecture
skipped at the gate."`, write no artifact, and move on. `ARCHITECTURE.md` is
"when present" everywhere downstream.

## Step 6: Feature Map — `.bobby/product/feature-map.md`

**Tags:** [Must] [Later] [Never] · **Budget:** 3–5 questions (this stage is mostly derivation, not interview).

Walk every journey step and derive the capabilities it needs. **Features are derived from journeys, never brainstormed** — a feature that serves no step doesn't go in the map, it goes back to the Journeys step (Step 3) as a proposed new step or out entirely. **Cut the map against `DATA-MODEL.md` when present** — a Must feature that needs an entity absent from the model amends the model (with a Changelog line), or goes out; it never invents an entity locally. IDs: `F<j>.<seq>` keyed to journey `J<j>`; `F0.x` is reserved for Never/cross-cutting rows. Every Never row cites a brief Non-goal.

```markdown
# Feature Map — <EPIC-ID>

**Locked:** YYYY-MM-DD · **Status:** approved
**Source:** journeys.md · DATA-MODEL.md (when present) · brief.md (Non-goals bind the Never column)

| ID | Feature | Serves journey step(s) | Persona | MoSCoW | Notes |
|---|---|---|---|---|---|
| F1.1 | <name> | J1.S1–S2 | P1 | Must | |
| F1.2 | <name> | J1.S3 | P1 | Must | |
| F1.3 | <name> | J1.S4 | P1 | Should | |
| F2.1 | <name> | J2.S1 | P1 | Later | |
| F0.1 | <name> | — | — | Never | cites Non-goal: <which> |

**v1 = every Must row.** Should = v1 if time allows; Later = explicitly deferred; Never = cite the Non-goal.

## Binding rules (for bobby-plan and everything downstream)
1. Decomposition reads this file FIRST.
2. IDs and titles are copied, never retyped.
3. A v1 ticket without a `feature:` ref is drift — fix or revert.
4. This map outranks the planner's taste.

## Vetted — from the human
- Struck from Must: <…>  (or: confirmed nothing can go — reason)
## Deviations (each needs a reason)
_none_
## Changelog
```

⛳ **Gate:** verbatim:
> "The **Must** column is the whole of v1. Strike one thing from it — or tell me why nothing can go."

**After the gate — lock and hand off:**
1. Set `**Locked:** <today> · **Status:** approved` on every artifact present in `.bobby/product/` (six when nothing was skipped).
2. Commit: `git add .bobby/product .bobby/decisions.yaml && git commit -m "product: definition locked for <EPIC-ID>"` — the ADRs land with the definition (`bobby decision add` deliberately doesn't commit).
3. Move the epic: `bobby ticket move <EPIC> plan`
4. Comment: `bobby ticket comment <EPIC> --by bobby-define-features "Definition locked: <n> Must features across <n> journeys for <primary persona>."`
5. Print the handoff: *"Definition locked. Next: `bobby go` — bobby-plan will decompose the epic against the feature map, one ticket per Must row, each carrying its feature ref."*

---

## Step 7: Mockups — the v1 screens, from YOUR artifacts (optional)

**Tags:** [Structure] [References] [Fidelity] · **Budget:** 3–5 questions.

Runs after the feature map locks, before the Blueprint step. The bobby-design
craft, with the interview already done: the locked artifacts ARE the design
brief, so the founder reacts to screens built from their own product instead
of answering the same questions twice.

**The brief, derived — never asked:**

- **Audience** = the PRIMARY persona (personas.md), verbatim.
- **The page's job** = the headline journey's Success line (journeys.md).
- **The screens to mock** = the Must features and the journey steps they serve
  (feature-map.md).
- **Real content** = the artifacts' own copy — persona names, journey
  language, feature titles. Never lorem, never invented.

Never re-ask what the artifacts answer. The only questions allowed are the
ones they cannot: structure (what shape is this thing?), references (whose
look do you like?), fidelity (how closely to follow them?) — the design
skill's own gates, within the budget above.

Then run the design skill's arc (`.claude/skills/bobby-design/SKILL.md`
steps 1b–3 and its `references/slop_checklist.md`) — cite references, tear
them down, build comparable mockup options with the product's real content
identical across options. Everything lands under `.bobby/design/` (the design pipeline's home,
so `bobby run design` can later resume from these files).

⛳ **Gate — your final message:** present the options built from THEIR
artifacts and ask, verbatim:
> "Which of these is the product you meant — or say **skip** and we go
> straight to the blueprint."

- **On a pick:** write `.bobby/product/mockups.md` (Locked/Status header, the
  chosen direction, pointers to the option files), commit it with
  `.bobby/product/`, comment on the epic (`--by bobby-define-mockups`).
- **On "skip":** comment `bobby ticket comment <EPIC> --by bobby-define-mockups
  "Mockups skipped at the gate."` and move on. No `mockups.md` is written; the
  blueprint tolerates its absence.

**Skipping is first-class, two ways:** `bobby run define <EPIC> --no-mockups`
never enters this stage at all (the chain hands feature map straight to
blueprint), and "skip" at the gate exits it. Design is a stage, not a toll.

## Step 8: The Blueprint — the glimpse before building

**No interview.** This stage generates, explains, and gates.

Run `bobby blueprint <EPIC>`. It derives one page from everything now locked —
the brief's outcome and metric, the personas, the headline journey with the
crux marked, every Must feature and its ticket grouped into build tracks, and
what is deliberately out of scope. It is deterministic and local: no model
calls, no network, no token cost. Regenerating it is always safe.

The page also runs a **drift check** the documents cannot: every Must row must
have exactly one ticket, and every ticket's `feature:` ref must exist in the
map. If it reports drift, fix the cause and re-run — never explain it away.

Walk the human through it in this order: **the crux** (what the product
resolves to), **the tracks** (what unlocks what), **what's out** (Later and
Never) — and, if `.bobby/product/mockups.md` exists, **the design direction**
the page now carries. If it does not (the Mockups step was skipped), say so
and move on. Then commit the page alongside the artifacts.

⛳ **Gate — your final message**, verbatim:
> "Does this look like the thing you want built — and what's missing?"

Whatever they name at this gate is either a Deviation on the feature map (with
a reason and a Changelog line, then a ticket) or a correction to an earlier
artifact. It is never a silent edit to the page — the page is generated, and
the next regeneration would erase it.

Then hand off: `bobby ticket move <EPIC> plan`.

## Locking rules (apply to every artifact in `.bobby/product/`)

1. **Decomposition reads the artifacts first** — never memory, never taste.
2. **Values and IDs are copied from the files, never retyped.**
3. **Nothing changes silently.** A wanted change gets a Deviations entry (with the reason) and a Changelog line naming who asked. If the human didn't ask, it's drift — revert it.
4. **The locked definition outranks your preferences, permanently.** You may disagree in a comment; you may not "improve" the artifact.

## Ticket Integration

Each stage comments on the epic when it reaches its gate (commands shown per step). The epic's stage tracks progress through the pipeline (`define-brief` → `define-personas` → `define-journeys` → `define-data-model` → `define-architecture` → `define-features` → `define-mockups` → `define-blueprint` → `planning`), so `bobby brief` and the app always know where definition stands.

## Completing Work

You are done only when: every artifact whose stage ran exists with `Status: approved` (brief, personas, journeys and feature map always; DATA-MODEL.md and ARCHITECTURE.md unless their stages were skipped), `.bobby/product/` is committed, the epic sits in `planning`, and the handoff message has been printed. If the human parked mid-pipeline, say exactly which stage is next and that `bobby run define <EPIC>` resumes there.

## Project overrides

If `.claude/skills/bobby-define/SKILL.local.md` exists, read it and follow it. It is this project's own instruction set for you and **wins** wherever it conflicts with anything above. This file is regenerated on upgrade; that one never is.
