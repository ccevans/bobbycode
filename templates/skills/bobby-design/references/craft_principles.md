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
- **One reference** → you have made a copy. Always 2+.
- **References with no lens** → you have made a collage. The subject must transform them.
- **Your own unguided taste** → you have made the AI default. References are the antidote.

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

### Overriding the defaults

**Inter, Roboto, Arial, Open Sans, and bare `system-ui` are red flags.** They are what gets chosen when nothing gets chosen. Pick something with a point of view.

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

- Warm cream `#F4F1EA` ground + serif display + terracotta accent
- Near-black ground + a single acid-green or vermilion pop
- Purple-to-blue gradient hero on white
- Inter or Space Grotesk as the "safe" face
- Broadsheet hairline rules with dense columns
- Emoji as section markers or feature icons
- Everything centered
- `rounded-lg` on everything; every card an identical rounded box with the same soft shadow
- An accent bar/rail on every card
- The generic SaaS spine: hero → three feature cards → testimonial row → CTA band

### The two required outputs

**1. Name the signature move.** One sentence, before you build: *"This design hangs on ___."* If you cannot finish that sentence, you do not have a direction yet.

**2. Answer the distinctiveness question honestly, in writing, before shipping:**

> *"Would this look like every other AI-generated site? What is the one thing that makes it unmistakably* **this** *subject?"*

A real answer names something specific to the subject. "It's clean and modern" is not an answer. If there is no real answer, revise until there is.

### Reload constraints per component

Do not read these rules once and then drift. Re-check them when building **each** major component — the hero, the nav, the cards, the footer. Drift toward the default look happens gradually.

---

## Part 7 — Fundamentals (these are graded too)

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
