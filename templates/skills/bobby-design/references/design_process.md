# The Design Process

The full detail behind the eight steps. The SKILL body is the summary; this is the working manual.

**Two gates only** (⛳ = stop for the human). Everything else you do yourself.

```
1 Brief  →  2 Reference remix  →  ⛳3 Style tiles  →  4 Wireframe (light)
                                          ↓
        8 QA & ship  ←  ⛳7 Critique  ←  6 Build  ←  5 Tokens
```

**Autonomous mode:** if the user says "just build it" / "don't ask me" / "surprise me," skip both gates — pick the strongest direction yourself, state which you picked and why in one line, and run straight through. Every craft rule still applies.

---

## 1. Brief

**Goal:** know what you are designing and what it must do, before you have any opinions about how it looks.

Pin down three things:

- **The subject** — one concrete thing. Not "a website" but "a CLI that gives a solo dev an engineering team."
- **The audience** — who is actually looking at this, and what state are they in when they arrive? (A stressed homeowner and a curious developer need different pages.)
- **The single job** — what is the one thing this page must accomplish? If there are three, rank them and design for the first.

Also capture: must-have content, brand constraints, and **any existing design system**. Check `CLAUDE.md`, a tokens/theme file, existing component styles. If one exists, it wins — you fill gaps, you do not override.

**Asking questions:** at most 2–3, and only where the answer changes the design. Guess sensibly on everything else and say what you assumed. A brief is not an interrogation.

**Output:** a few lines. Subject, audience, job, constraints, assumptions.

---

## 2. Reference remix — a hard gate

**Goal:** source the raw material for something original.

**You may not proceed to style tiles without 3–5 fully cited references you have actually looked at.** This gate exists because it is the step most likely to be skipped under time pressure, and skipping it is the single largest cause of generic output. Autonomous mode does not exempt you — it only removes the *asking*, not the *looking*.

### 2a. Ask the user first

> *"Any sites, apps, posters, packaging — anything — whose look you like? Even one or two helps a lot."*

Easiest possible question for a non-designer, and it is where their taste enters the project. Note that the ask is deliberately broader than websites: a book cover or a piece of packaging is often a better lead than another SaaS homepage.

### 2b. Find the rest yourself

If they name none, or fewer than three, search and **actually open them**. Aim for 3–5 total.

Range deliberately:
- **Outside the subject's category** — if it is a dev tool, look at editorial design, wayfinding, instrument panels, record sleeves
- **Outside the minimal-website cluster** — that cluster is where the default look lives
- **At least one that is not a website at all**

### 2c. Cite every reference, fully

Record all four fields for each. An uncited reference does not count.

| Field | Requirement |
|---|---|
| **Name** | What it is |
| **Source** | A URL, or a specific findable citation for a physical/print artifact |
| **What's good** | The *thinking*, not the surface — one line |
| **What we take** | The specific thing carried into this design |

**Surface vs. thinking:** "warm pink gradients" is surface. "Deliberately rejected the hacker-terminal cliché so the tool feels emotionally warm" is thinking — and thinking is what transfers to a different subject.

### The rules that make this real

- **No working from memory.** "Film end credits," "greenbar paper," "Swiss posters," "brutalist web" are *mental images*, not references. Working from a remembered aesthetic produces a generic imitation of that aesthetic — the same failure as working from your own taste, just wearing a costume. If you want the motif, go find real specimens and look at them.
- **Every tile names its sources.** A direction that cannot cite where it came from was invented, not remixed.
- **Check nostalgia.** Retro and skeuomorphic references carry a message. Ask whether it is the right message for *this* subject in *this* year, or whether it just reads as period costume. Distinctive is not the same as right.
- **Show the user the reference table.** It costs them nothing to skim, and it catches a wrong direction before any pixels exist.

### 2d. Scan the category, then find the lens

**The norm:** what do all the competitors look like? You need this to diverge deliberately rather than landing on the norm by accident.

**The lens:** what is *this subject's own world* made of — its materials, vernacular, instruments? That is what transforms borrowed thinking into something new rather than a collage.

**Output:** the cited reference table, the category norm, and one line: **"how this will differ."**

---

## 3. ⛳ Art direction — style tiles

**Goal:** settle the visual world cheaply, before spending a full build on the wrong one.

A style tile sits between a moodboard (too abstract to decide from) and a full comp (too expensive to throw away). It shows the **visual language** without committing to layout — so feedback stays on "does this feel right" instead of "move that button."

Produce **2–3 directions** as a published artifact. See `style_tile_template.md` for exactly what goes on each.

Rules:
- Each tile anchors to a **different** reference remix — not three shades of one idea
- The set must differ on a **named axis**, and you state it: *warm ↔ austere*, *classic ↔ experimental*, *quiet ↔ loud*
- Show **real UI atoms in real states** (button, hover, card, label, link, input) — concrete beats abstract for a non-designer
- **No full page layout.** That is step 4's job and it muddies the decision.
- Each gets a short name and a one-line "what this says about you"

Then **stop and let them pick.** Mixing is normal and good — "A, but with C's type" is a perfectly valid answer. Record the choice.

---

## 4. Wireframe (lightweight, skippable)

**Goal:** know what goes on the page before you decorate it.

Content blocks, hierarchy, reading flow. No color, no type, no polish. ASCII or grey boxes is fine.

This is **not a gate.** Keep it fast and internal. Show it inline only if it genuinely clarifies something for the user. **Skip it entirely** for a simple single-page site, or when the user is clearly in a hurry.

Its only job is to stop you designing before you know the content. When you already know the content, it has no job — skip it.

---

## 5. Design tokens

**Goal:** build the system, then the page. This is what makes page two match page one.

Turn the chosen direction into a real token set:

- **Color** — ground, ink, muted ink, rule/border, accent, semantic (success/warning/danger). **Both themes**, each deliberately designed.
- **Type** — the pairing, a fixed scale, weights, tracking, line-heights
- **Spacing** — a scale, not ad-hoc pixel values
- **Radius / shadow / motion** — consistent, and consistent with the direction

Implement as CSS custom properties on `:root`, redefined per theme. **Style every component through tokens** — a hardcoded hex inside a component is a bug, because it will not follow the theme and it will drift.

Write the tokens down somewhere durable. This is the artifact that keeps future work on-brand.

---

## 6. Build

**Goal:** the real thing.

Apply tokens to the structure. Real content throughout — **never lorem, never placeholder filler, never fake logos.** Real copy is design material and it changes the layout; fake copy hides problems until launch.

- **Standalone page or visual deliverable** the user should see and share → publish as an artifact, following the `artifact-design` skill's fundamentals (self-contained, CSP-safe, theme-aware, favicon).
- **Page inside an existing project** → build it in the project's own stack and match its conventions.

Re-read the anti-generic checklist when starting **each** major component. Drift is gradual.

---

## 7. ⛳ Critique and iterate

**Goal:** catch the generic version before the user has to.

First, **you** critique — before showing anything:

1. Run the **anti-generic checklist** (`craft_principles.md` Part 6)
2. Answer the **distinctiveness question** in writing
3. Score the **10 dimensions** below
4. Fix what fails

Then show the user and take plain-language feedback — "warmer," "the headline's too quiet," "too corporate," "love it." Translate their reaction into token changes yourself; never ask them to specify the fix.

### The 10-dimension scorecard

Score 0–10. Most first drafts land 5–7. Be honest — a flattering self-score wastes the step.

| # | Dimension | A 10 looks like |
|---|---|---|
| 1 | **Art direction** | One clear idea; every choice serves it; a named signature move |
| 2 | **Distinctiveness** | Unmistakably this subject; passes the avoid-list cleanly |
| 3 | **Typography** | Deliberate pairing with real contrast, a consistent scale, personality |
| 4 | **Color** | 60/30/10 holds; neutrals hue-biased; both themes deliberate |
| 5 | **Layout & composition** | Real grid, purposeful breaks, whitespace that paces the page |
| 6 | **Hierarchy** | The single job is obvious in the first two seconds |
| 7 | **Copy** | Specific, active, written from the user's side of the screen |
| 8 | **Motion & interaction** | Directed, meaningful, reduced-motion honored |
| 9 | **Responsive** | 375 / 768 / 1440 all correct; no body-level horizontal scroll |
| 10 | **Accessibility** | Visible focus, AA contrast, keyboard-navigable, 44px targets |

Anything **below 7 gets fixed** before the user sees it, or gets an explicit note explaining the tradeoff.

---

## 8. QA and ship

Final pass:

- [ ] Both themes render correctly (not a naive invert)
- [ ] 375 / 768 / 1440 — no horizontal scroll on `body`
- [ ] Every interactive element has a visible focus state
- [ ] Text contrast passes AA; nothing carried by color alone
- [ ] Tap targets 44px+
- [ ] `prefers-reduced-motion: reduce` honored
- [ ] Semantic HTML; heading order intact
- [ ] Empty / loading / error states exist where relevant
- [ ] No lorem, no placeholder assets, no dead links

Then:
- Commit, or publish the artifact
- Record the direction and tokens
- `bobby ticket create` for anything deliberately deferred
- Update `bobby-ux/references/brand_guidelines.md` with the established tokens, so the review skill grades future pages against the real brand

---

## Method notes

**Why style tiles and not straight to comps.** Full comps are expensive and invite the wrong conversation — people critique button placement while the visual language is still unsettled. Style tiles get a real decision on the *look* in a fraction of the time, and a rejected tile costs almost nothing. This is the single highest-leverage step in the process.

**Why real UI atoms (element collages).** Abstract swatch-and-font boards are hard for non-designers to judge. Showing an actual button, in its actual hover state, next to an actual card makes the direction concrete enough to react to honestly.

**Why tokens before the page.** "Build systems, not pages." A page built from tokens can be re-themed in minutes and page two will match it. A page built from hardcoded values cannot, and every subsequent page drifts.
