# Craft Principles

The rules that separate a designed page from a generated one. Read before designing anything.

---

## Part 0 — Designing for someone who is not a designer

Bobby's user is a solo dev, an indie hacker, or a non-developer. They know their subject and they know what they like when they see it. They do **not** know typographic terms, spacing scales, or what makes a palette work — and asking them to supply that is how projects stall and how output ends up generic.

### The human reacts; you design

Every question you ask must be answerable **without design vocabulary**.

| Ask this | Not this |
|---|---|
| "Which of these three feels right?" | "What typeface do you want?" |
| "Warmer, or sharper?" | "Should the accent be analogous or complementary?" |
| "Is this too loud?" | "What saturation level do you prefer?" |
| "What do people get wrong about your product?" | "What's your brand personality matrix?" |
| "Any sites you like the look of?" | "Describe your desired aesthetic." |

Two stopping points only: **the style tile pick** and **the final critique**. Everything between them is your work. Do not narrate options you are not going to pursue; make the call and move.

### Their taste enters through references, not through instructions

The single most useful thing a non-designer can give you is **"I like how this site looks."** That is real, specific data. Ask for it early. If they have nothing, go find candidates and let them react to those.

### Never hand back an unmade decision

If you find yourself about to ask "do you want X or Y?" about something they have no basis to judge — pick the better one, state that you picked it, and say why in one line. They can always push back.

---

## Part 1 — Where uniqueness actually comes from

### The reference remix

Originality is not invention from nothing. It is **remix through a specific lens**.

```
2–4 references
    → name what is GOOD in each (the thinking, not the surface)
        → combine them
            → diverge through THIS subject's own world
                → something that did not exist before
```

**Steal the thinking, not the style.** "Charm uses warm pink gradients" is the surface. "Charm rejected the hacker-terminal cliché to make developer tools feel emotionally warm" is the thinking — and the thinking is what transfers to a new subject.

Failure modes:
- **One reference** → you have made a copy. Always 3+.
- **References with no lens** → you have made a collage. The subject must transform them.
- **Your own unguided taste** → you have made the AI default. References are the antidote.
- **References from memory** → you have made a generic imitation of a remembered aesthetic. This is the subtlest failure, because "film end credits" or "greenbar computer paper" *sounds* specific while being exactly as ungrounded as taste. If you did not look at it, it is not a reference.

### Citation is the discipline

Every reference carries four fields, and all four are required:

| Field | Requirement |
|---|---|
| **Name** | What it is |
| **Source** | A URL, or a specific findable citation for a physical/print artifact |
| **What's good** | The *thinking*, not the surface |
| **What we take** | The specific thing carried into this design |

A direction that cannot cite its sources was invented from taste. Citation is not bureaucracy here — it is the mechanism that forces you to have actually looked, and looking is where the specific details come from that separate a real design from an imitation of one.

**Non-web references are welcome and often stronger** — packaging, signage, book design, instrument panels, forms, film titles, record sleeves. They must still be found, looked at, and cited.

**Check nostalgia before committing.** Retro and skeuomorphic references carry a message about the subject. Ask whether it is the right message, or whether the page will read as period costume. Distinctive is not the same as right.

### Diverge from the category, not from the user

"Diverge" means **differ from the competitors**, never from the references the user chose. Those references are their taste, and taste is the one thing you cannot supply for them.

The finished design must be **recognizably in the family** of what they picked. If they showed you quiet, light, typographic sites and you deliver dark industrial blocks, you have not been bold — you have substituted your taste for theirs, and the fact that it is distinctive does not redeem it.

**The trap:** the user says an early draft "looks generic." It is tempting to hear *"this aesthetic is wrong"* and abandon it. Usually the aesthetic was fine and the draft was **empty** — quiet with no idea in it. The fix is to put a specific idea *into* their aesthetic, not to switch aesthetics.

Minimal is not the same as generic. The minimal sites people admire have a spine — a thesis, a structural device, real specificity. Generic minimal is what is left when you copy the calm and skip the spine.

**Check before shipping:** put the design next to the user's references. Could someone tell they belong to the same family? If not, go back.

### The subject's own world is the lens

Distinctive choices come from the material the subject is actually made of:

- A CLI tool → the terminal, monospace, prompts, exit codes, man pages
- A cash home-buyer → contracts, keys, county records, the walk-through
- A running app → splits, elevation profiles, race bibs, stopwatch type
- A bakery → butcher paper, hand-lettered signage, proof timers, flour dust

Ask: *what does this subject's world look like, and what have I got that no other category has?* That is where the signature move comes from.

### The signature move

Every good page has **one** deliberate, subject-specific idea it hangs on. A motif, a type treatment, a structural risk, an interaction. Name it explicitly before you build.

Then keep everything around it quiet. Boldness spent in one place reads as confidence; boldness spread everywhere reads as noise. If two elements are both fighting for attention, one of them is wrong.

---

## Part 2 — Typography

Typography carries the personality of a page even when the page is not about typography. It is the highest-leverage decision you make.

### Pairing

1. **Contrast first.** The two faces must be *obviously* different — a display face with personality against a neutral text face. Subtle differences between similar fonts read as a mistake, not a choice.
2. **But share something.** A common x-height, width, era, or stroke logic keeps the pair coherent rather than random.
3. **Two families max.** A third only if it does a real job (code, data, captions).

Common strong strategies:
- Characterful serif display + clean sans body
- Geometric or grotesque display + humanist text face
- Monospace display + neutral sans body (excellent for developer tools — the mono *is* the subject)

### Size floors — never design small

**Small type is one of the loudest AI tells.** Models produce 13–14px body copy and 10–11px labels because dense small text *looks* sophisticated in a thumbnail and costs nothing to generate. On a real screen it reads as cramped, cheap, and hard to use.

Hard floors. These are not suggestions:

| Role | Floor | Prefer |
|---|---|---|
| **Body copy** | **16px / 1rem** | **17–18px** on desktop |
| Secondary / captions | 14px | 15–16px |
| Labels, eyebrows, legal, metadata | **13px** — nothing on the page goes below this | 14px |
| Line-height (body) | 1.5 | 1.5–1.65 |
| Measure | — | 50–75 characters |

- **16px is the browser default and the accessibility baseline.** Going under it is a decision to be less readable, and it is almost never the right one.
- **18px body on desktop is the confident choice.** Generous type reads as considered; small type reads as generated.
- **Labels are where this fails most.** A 10px uppercase eyebrow is the single most common AI typography tic. If a label needs to recede, use colour and letter-spacing — not a smaller size.
- **The floor beats reference fidelity.** If a teardown shows the reference running 10/12/14px, **do not inherit that.** Take its proportions and scale the whole system up to clear the floor. Only go below if the user explicitly asks, and say what it costs.
- Scale display type with `clamp()`, but set the **minimum** of every clamp above the floor too — a headline that collapses to 20px on mobile has the same problem.

### Overriding the defaults — the banned font list

Models default to **safe, not appropriate**: they reach for the most-trained-on option, which is by definition the most generic one. These are the fonts that result. **Do not use any of them unless the user explicitly asks, or a teardown shows the user's own reference using one.**

**Tier 1 — the outright tells.** Using these is the fastest way to look machine-made:
`Inter` · `Roboto` · `Arial` · `Helvetica` / `Helvetica Neue` · `Space Grotesk` · `Space Mono`

> **Inter is the #1 slop tell.** And `Space Grotesk` is the trap one level up: it is the model's idea of an *edgy* default, reached for when it wants to look "more designed." It signals that someone asked for distinctive and accepted the first distinctive-sounding answer.

**Tier 2 — the "safe modern" set.** Not offensive, just the next thing reached for:
`Open Sans` · `Lato` · `Montserrat` · `Poppins` · `Nunito` · `Raleway` · `Work Sans` · `DM Sans` · `Manrope` · `Plus Jakarta Sans` · `Geist`

**Tier 3 — the "elegant" defaults.** The reflex when a brief says premium or editorial:
`Playfair Display` · `Instrument Serif` · `Cormorant Garamond` · `Libre Baskerville`

**Tier 4 — the non-choice.** A bare `system-ui` / `-apple-system` stack presented as if it were a decision.

**What to do instead:**

- Pick a face with an actual point of view, and be able to say **why it fits this subject** in one sentence. If the reason is "it's clean and modern," it is a default.
- **System monospace is the honest exception.** Where webfonts cannot load, `ui-monospace` / `SF Mono` / `Menlo` genuinely carries character in a way a system grotesque does not — especially for developer subjects, where the terminal is the subject.
- **A reference-backed choice is not a default.** If a teardown shows the user's own reference running Geist, using Geist is inheriting their taste, not falling back to yours. Say which it is.

When the environment blocks external font CDNs (as artifacts do), inline the face as a `@font-face` data URI rather than linking a URL and silently falling back — a silent fallback to the system stack undoes the entire type decision.

If you genuinely cannot load a custom face, commit hard to what the system stack does well (a real scale, deliberate weights and tracking, an interesting size jump) so the restraint reads as a choice.

### Setting it

- Set a **type scale** and stay on it. Arbitrary sizes are the fastest way to look unconsidered.
- Running text near **65 characters** per line.
- Headings get `text-wrap: balance`.
- Uppercase labels need letter-spacing (~0.1–0.2em) or they look broken.
- Body text 16px minimum, line-height ~1.5.
- Digits in columns get `font-variant-numeric: tabular-nums`.
- Hierarchy comes from **weight, size, and spacing** — not from adding more colors.

---

## Part 3 — Color

### The formula

```
1 light neutral   (ground — carries the mood)      ~60%
1 dark neutral    (ink — carries the text)         ~30%
1 anchor accent   (does the brand recognition)     ~10%
+ semantic colors (success / warning / danger — separate, and NOT your accent)
```

Three to five colors total. The **60/30/10** distribution is what makes a palette feel composed rather than scattered.

### Choosing neutrals

**A pure mid-grey reads as unconsidered.** Bias the neutral toward the accent's hue — a warm accent gets warm-grey/cream neutrals, a cool accent gets cool-grey/slate. The bias can be subtle; what matters is that it is *there*.

Pure white and near-black are legitimate grounds when they suit the subject. The point is that they were chosen, not inherited.

### The accent

One anchor accent does nearly all the brand work. If the accent fights the ground (vibrating, muddy, illegible), do not swap it out — **shift it analogous or drop its saturation** first.

Never use color as the only carrier of meaning. Pair it with a label, an icon, or a shape.

### Both themes, deliberately

Design light and dark with the same care. **Never naively invert.** In dark mode:
- The accent usually needs to get *lighter and slightly less saturated* to stay legible
- Pure black grounds are rarely right — a near-black with hue bias is better
- Shadows stop working; use borders and surface lightness for elevation instead

Implement at the **token level**: define custom properties on `:root`, redefine only the tokens under `@media (prefers-color-scheme: dark)`, and again under any explicit `[data-theme]` override. Style components through the tokens, never inside the media query.

---

## Part 4 — Layout

### Build a grid, then break it

Start with a real grid — it is the backbone. Then break it **on purpose**:

- Let **one column dominate** and others support. Equal columns are for spreadsheets, not stories.
- Vary alignment; allow deliberate overlap.
- Editorial grids run odd counts (5, 7, 9) with gutters sized to the text column.

Asymmetry without an underlying grid is just mess. The grid is what makes the break read as intentional.

### Whitespace is compositional

Margins and gaps are choices that **control pace the way silence controls music**. Whitespace is not leftover — it is the thing that makes the focal point land. Generous space around one element is the cheapest way to say "this matters."

### Mechanics

- Lay out sibling groups with flex/grid and `gap` — not per-element margins that collapse or double.
- Wide content (tables, code, diagrams) scrolls inside its **own** `overflow-x: auto` container. The page body never scrolls sideways.
- Watch selector specificity: type-based and element-based rules fighting over the same padding is how spacing silently breaks.

### Structure must encode meaning

Numbered markers (01 / 02 / 03), eyebrows, dividers, and section labels are **information**, not decoration. Use numbering only when the content genuinely is a sequence — a real process, a timeline, a ranking. Numbering three unrelated features is a tell.

---

## Part 5 — Motion

Motion should be **directed**: a page-load sequence, a scroll-paced reveal, a hover micro-interaction that carries meaning.

- **One orchestrated moment beats scattered effects.** Choose where motion earns its place.
- Transitions 150–300ms. Animate `transform` and `opacity` only — never properties that cause layout shift.
- Excess animation is itself a tell of generated work. Less is usually more.
- Always honor `prefers-reduced-motion: reduce`.

---

## Part 6 — The anti-generic checklist

Current AI-generated design clusters around a recognizable set of looks. Avoid them unless the user explicitly asks for one (their words always win).

### The tells

- **The minimal default: an off-white or cream ground + dark ink + exactly one accent + a grotesque.** This is the single most common AI-design output. It is not neutral and it is not safe — it is *recognizable*, and it reads as "nothing was decided."
- Warm cream `#F4F1EA` ground + serif display + terracotta accent
- Near-black ground + a single acid-green or vermilion pop
- Purple-to-blue gradient hero on white
- Inter or Space Grotesk as the "safe" face — or a bare system stack in the *final* output
- Broadsheet hairline rules with dense columns
- Emoji as section markers or feature icons
- Everything centered
- `rounded-lg` on everything; every card an identical rounded box with the same soft shadow
- An accent bar/rail on every card
- The generic SaaS spine: hero → three feature cards → testimonial row → CTA band

### The minimal trap

Restraint is not automatically taste. The sites people admire for being minimal — the ones a user will point you at — are restrained **and** intensely specific: real typefaces, real photography, a real point of view. Copy only the restraint and you get the default look.

If a user shows you minimal references, the thing to take is **what they were confident enough to leave out and why** — not the off-white ground. Steal the thinking, not the style. Producing a quiet page with no specific idea in it is the most common way this skill fails.

### The range test (for a set of directions)

A set of style tiles must span **different worlds**, not different temperatures of one world.

- [ ] **Different grounds.** If every tile's background is in the same colour family, you have produced one tile three times. Redo it.
- [ ] **Different type strategies.** Not three weights of the same grotesque.
- [ ] **Different structural motifs.** Each tile should be built out of a different material.
- [ ] **At least one real risk.** If every option is safe, the user has no actual choice — they are picking a shade. One tile should be the one you are slightly nervous to show.

**The description test:** write one sentence describing each tile. If any two sentences are interchangeable, one of those tiles is wasted.

### When you cannot load real typefaces

If the environment blocks webfonts (artifacts, sandboxed pages) and you cannot inline a face as a data URI, **do not ship default-font specimens and call it art direction.** Disclosure does not fix it — the page still looks generic.

Carry the personality through what you *can* control:

- Extreme scale contrast, and tracking pushed well past default
- Case as a design decision (all-caps with wide letterspacing, or strict lowercase)
- Structure and motif — rules, box-drawing characters, grids, borders, stamps, gutters
- Color and ground doing more of the work than usual
- System **monospace** is genuinely characterful; a system grotesque is not

The identity has to live in the system, not in a font you cannot load.

### The two required outputs

**1. Name the signature move — and make it visible.** One sentence, before you build: *"This design hangs on ___."* If you cannot finish that sentence, you do not have a direction yet.

A signature move written in a caption is not a signature move. If you say "the roster is the spine of the page," the roster must be *rendered as a spine* — visibly, structurally. If a reader has to be told the idea, the design has not expressed it.

**2. Answer the distinctiveness question honestly, in writing, before shipping:**

> *"Would this look like every other AI-generated site? What is the one thing that makes it unmistakably* **this** *subject?"*

A real answer names something specific to the subject. "It's clean and modern" is not an answer. If there is no real answer, revise until there is.

### Reload constraints per component

Do not read these rules once and then drift. Re-check them when building **each** major component — the hero, the nav, the cards, the footer. Drift toward the default look happens gradually.

---

## Part 6b — Copy: the fastest way to look AI-generated

A page can pass every visual check and still read as machine-written in its first sentence. Copy is the highest-signal thing on the page and it is the thing most often coasted on.

### The tells

- **The em-dash enumeration.** Interrupting a sentence to list things, then resuming: *"Bobby staffs the rest — planner, builder, reviewer, testers, security, QE — and runs a lifecycle."* This is the single most recognizable AI construction. Break it into sentences or cut the list.
- **Filler qualifiers.** "end to end," "seamlessly," "robust," "powerful," "comprehensive," "real," "truly," "simply." Delete each one; if the sentence survives unchanged, it was filler.
- **Decorative tricolon.** Rule-of-three rhythm applied to things that are not actually three ("taste, judgment, and knowing why it matters"). A real sequence is fine; a rhythmic one is a tell.
- **Parallel-construction padding.** *"Its agents are your reviewer, its sessions carry your context."* Symmetry standing in for content.
- **"Not just X, but Y."** Almost always deletable down to Y.
- **"Whether you're X or Y…"** openings.
- **The subhead restating the headline.** If the headline says it, the subhead must do a *different* job — get concrete, or name the pain.
- **Copy that duplicates what the design already shows.** If a table lists six roles, the intro must not list them too. Redundancy undercuts the visual idea.
- **Abstract nouns where a verb belongs.** "provides visibility into" → "shows."

### The replacements

- **Say what happens, in verbs.** *"Tell it what you want. It plans the work, writes the tests first, reviews the diff, and ships."*
- **Name the pain in the user's own words.** Not "reduces friction in solo workflows" — *"No one reviews your code. No one remembers where you stopped at 1am."*
- **Specific beats clever.** A real number, a real command, a real failure mode.
- **Write from the user's side of the screen.** Name things as they experience them, not as the system implements them.

### Two rules

1. **Product docs are not page copy.** Lifting sentences from a README feels like "using real content," but README prose is written to be complete, and page copy is written to land. Rewrite it.
2. **Read the first sentence out loud.** If no person would say it that way, it is not finished.

Craft is not just aesthetics. Judges — and users — score execution.

- **Semantic HTML.** Real headings in order, real landmarks, real buttons and links.
- **Accessibility.** Visible focus on every interactive element, AA contrast, keyboard-navigable, 44px+ tap targets, alt text, labels not placeholders, never color alone.
- **Responsive.** Works at 375 / 768 / 1440. No horizontal body scroll. Content reflows gracefully.
- **States.** Loading, empty, error, and 0/1/many all designed — not just the happy path.
- **Performance.** Inline what must be inlined, but do not ship a page that fights the network.
- **Copy is design material.** Write from the user's side of the screen. Active voice. A button says exactly what happens. Errors say what went wrong and how to fix it. Specific beats clever.

---

## Sources

- Style Tiles — Samantha Warren
- Element Collages — Dan Mall
- Atomic Design — Brad Frost
- *Steal Like an Artist* — Austin Kleon
- 60/30/10 and palette construction — standard color theory practice
- Anti-generic AI design — Anthropic's frontend-aesthetics guidance; 2026 design-industry writing on AI slop
