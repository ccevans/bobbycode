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

## 2. Reference remix

**Goal:** source the raw material for something original.

1. **Get 2–4 references.** First ask the user: *"any sites you like the look of?"* This is the easiest possible question for a non-designer and it is where their taste enters the project. If they have none, go find candidates and let them react.

2. **Name what is good in each — the thinking, not the surface.** One line each. "Warm pink gradients" is surface. "Deliberately rejected the hacker-terminal cliché so the tool feels emotionally warm" is thinking, and thinking is what transfers.

3. **Scan the category.** What do all the competitors look like? You need to know the norm to diverge from it deliberately rather than accidentally landing on it.

4. **Find the lens.** What is *this subject's own world* made of — its materials, vernacular, instruments? That is what transforms borrowed thinking into something new.

**Output:** the references, what you take from each, the category norm, and one line: **"how this will differ."**

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
