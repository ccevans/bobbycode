# AI Design Slop — Pattern Checklist

The consolidated catalogue of visual patterns that mark an interface as AI-generated.
Merged from Adrian Krebs' 16-pattern Show HN audit, the Impeccable detector catalog
(64 rules), and general frontend practice.

**Calibration:** 0–1 patterns is clean · 2–3 is mild · **4+ is heavy slop.**

---

## How this list is binding

Treat every item below as a **do-not** by default. There are exactly two exemptions:

1. **The user explicitly asked for it.** Their words always win. If they want a purple
   gradient, build a purple gradient — and say you know it is on the list.
2. **A teardown shows it in the user's own reference.** Inheriting a trait extracted
   from a site *they chose* is honouring their taste, not defaulting to yours. Record
   it as reference-backed in the design spec, with the reference named.

Anything else on this list that appears in your build is drift. Not a decision — drift.
The difference is whether you can point at where it came from.

**Do not use "it's reference-backed" as a laundering step.** The trait has to be *in the
extracted teardown*, in writing, before you build. Deciding afterwards that your gradient
resembles something the user liked is post-hoc justification.

---

---

## 1. Typography

- [ ] **Inter as the default face** — especially on a centered hero headline. The Helvetica of the LLM era.
- [ ] **The recurring font set** — Inter, Geist, Space Grotesk, Instrument Serif. Each new generation of tools converges on the same handful.
- [ ] **Serif italic accent word** — one word of the hero set in italic serif inside an otherwise-sans page.
- [ ] **Oversized italic serif display headline** — reads as taste in isolation, now the universal AI-startup hero.
- [ ] **Hero eyebrow / pill chip** — tiny uppercase tracked label directly above the H1, or the same shape as a rounded chip.
- [ ] **Repeated section kicker labels** — the same tiny uppercase tracked label above every section heading. Editorial scaffolding without editorial structure.
- [ ] **All-caps section headings** used as a system-wide device.
- [ ] **Oversized hero headline** — a full sentence blown up to display size, eating the entire first viewport.
- [ ] **Flat type hierarchy** — sizes too close together; no step contrast (aim for ≥1.25 ratio between steps).
- [ ] **Single font for the whole page** — no display/body pairing, so no typographic hierarchy.
- [ ] **Crushed letter-spacing** — tracking pulled so tight characters lose their shapes.
- [ ] **Icon tile stacked above a heading** — small rounded-square icon container sitting on top of the feature title. The universal generated feature-card template.

**Fixes:** pick a display face outside the common set (Söhne, Untitled Sans, Haas Grotesk, Migra, Inktrap, Cabinet Grotesk, General Sans; serifs: Tiempos, GT Sectra, Freight Text, Source Serif 4). Pair it with a *different* body font. Fold the eyebrow copy into the headline, or cut it. Size headings 48–72px with optical, not destructive, tracking.

---

## 2. Color & contrast

- [ ] **"VibeCode purple"** — the specific lavender-violet that leaks out of most default generations.
- [ ] **Purple-to-blue gradients** on white or dark backgrounds.
- [ ] **Gradients everywhere** — as backgrounds, buttons, borders, and orbs simultaneously.
- [ ] **Gradient text** — decorative, kills scannability, especially on headings and metrics.
- [ ] **Permanent dark mode** reached for by default rather than chosen.
- [ ] **Dark mode with colored glows** — saturated `box-shadow` halos on a dark field. Cyberpunk by reflex.
- [ ] **Large colored glows / radial background halos** behind hero content.
- [ ] **Barely-passing body contrast** — generated dark themes routinely ship body text that fails WCAG AA (4.5:1 body, 3:1 large).
- [ ] **Gray text on colored backgrounds** — washed out; use a darker shade of the background hue instead.
- [ ] **Cream / warm beige page background** — the *new* default "tasteful" surface, now itself a tell. Use it because your palette calls for it, not by reflex.

**Fixes:** commit to a palette in CSS custom properties before writing markup. One dominant color plus one sharp accent beats five medium-strength colors. Anything with a point of view — earth tones, high-contrast black plus one bright, a Gumroad cream-and-pink — reads better than the default lavender.

---

## 3. Layout & composition

- [ ] **Centered hero in a generic sans** — the single most common shape.
- [ ] **Badge / chip positioned directly above the H1.**
- [ ] **Identical feature card grids** — same-size cards, icon on top, heading, two lines of copy, repeated six times.
- [ ] **The same card repeated 3× in a row** as the default section primitive.
- [ ] **Numbered 1-2-3 step sequences.**
- [ ] **Tiny numbered section labels** (01 · 02 · 03) beside headings, imitating editorial structure.
- [ ] **Stat banner rows** — 10M+ users / 99.9% uptime / 200ms p50.
- [ ] **Hero metric layout** — big number, small label, three supporting stats, gradient accent.
- [ ] **Sidebar or nav with emoji icons.**
- [ ] **Copy-paste section templates** — hero-metrics-features repeated with different colors, so nothing stands out.
- [ ] **Perfect symmetry with no visual tension** — nothing staggered, overlapped, or off-grid.
- [ ] **Nested cards** — cards inside cards inside cards, each with its own padding and shadow.
- [ ] **Monotonous spacing** — one spacing value everywhere; no rhythm between tight groupings and section breaks.
- [ ] **Cramped layouts** — no whitespace budget; sections don't breathe.
- [ ] **Borders doing the work of whitespace and shadow.**
- [ ] **Raw bullet or numbered lists** dropped in as UI with no styling.

**Fixes:** pick one strong layout primitive and repeat it until it becomes the site's signature — rather than seven card treatments, three stat banners, and a step sequence. Break the grid deliberately. Whitespace generously.

---

## 4. Cards, surfaces & visual details

- [ ] **Side-tab accent border** — thick colored stripe (3–4px) on one edge of a card. The most reliable single tell in the catalog; the design equivalent of em-dashes in AI text.
- [ ] **Border accent on a rounded element** — the thick stripe fighting the corner radius.
- [ ] **Hairline border + wide diffuse shadow** on the same element. Commit to one: a defined edge *or* a soft elevation.
- [ ] **Glassmorphism everywhere** — frosted blur and glow borders used as decoration rather than to solve a layering problem.
- [ ] **Extreme border-radius** — 24px+ on a small card rounds everything into the same soft blob. Cards top out around 12–16px; reserve full-pill for tags and buttons.
- [ ] **Identical radius and shadow on every surface** — no elevation system.
- [ ] **Decorative grid-line backgrounds** with no canvas, map, or measurement task behind them.
- [ ] **Repeating-gradient stripes** as surface texture.
- [ ] **Massive icon containers** larger than the content they introduce.
- [ ] **Unmodified shadcn/ui defaults** — the library is built to be copy-pasted by agents, so the defaults leak. Customize tokens, radii, shadow depths, and variants.

---

## 5. Motion

- [ ] **Pulsing status dots** that make static status look live.
- [ ] **Decorative blinking cursor** on non-editable hero copy.
- [ ] **Auto-scrolling marquees** of logos or words.
- [ ] **Bounce / elastic easing** on dialogs and cards. Reserve spring physics for things that are physically modeled; ease interface motion out smoothly.
- [ ] **Image scale-or-rotate on hover** as the default interaction.
- [ ] **Animating layout properties** (width, height, padding, margin) instead of transform and opacity.
- [ ] **Animation for its own sake** — motion that communicates nothing about connection, progression, or status.
- [ ] **Everything animating at once** on page load instead of a staggered reveal.

**Fixes:** hover lift of `translateY(-3px)` with a deeper shadow, 200–250ms ease. One or two floating accent elements, not five.

---

## 6. Copy

- [ ] **Em-dash overuse** — more than a couple in body copy.
- [ ] **Marketing buzzwords** — streamline, empower, supercharge, world-class, enterprise-grade, next-generation.
- [ ] **Aphoristic manufactured contrast** — "Not a feature. A platform." Once is fine; the repetition is the tell.
- [ ] **"Theater" framing** — dismissing something as performative theater.
- [ ] **Redundant UX writing** — label, sublabel, helper text, and hint all saying the same thing.
- [ ] **The same text repeated** in multiple slots of one card.

---

## 7. Imagery

- [ ] **Shape-assembled hero illustration** — art built from generic SVG primitives, reading as placeholder clip art.
- [ ] **Amateurish hand-coded SVG mascots** — doodles rather than whimsy. Ship no illustration rather than a sketchy one.
- [ ] **Generic stock-photo-style placeholder content.**
- [ ] **Broken or empty `<img src>`** shipping as a broken-image box.

---

## 8. Second-generation tells (the new exits)

Once the first-generation patterns get banned, agents escape through the same alternate doors — and those are becoming tells in their own right:

- [ ] **Ghost index numbers** (01 · 02 · 03) replacing every icon chip.
- [ ] **Uppercase overline + big-number cards** repeated identically for every KPI.
- [ ] **Text-left / visual-right hero with two pill CTAs** on every product site.
- [ ] **Cream/beige surfaces** as the reflexive "tasteful" alternative to dark mode.
- [ ] **Instrument Serif** as the reflexive alternative to Inter.

---

## 9. Build-quality defects (not AI-specific, same detectors)

- [ ] Line length over ~80 characters — constrain to 65–75ch.
- [ ] Line height under 1.3 — use 1.5–1.7 for body.
- [ ] Body text under 12px — 16px is the target.
- [ ] Wide letter-spacing on body text (over 0.05em).
- [ ] All-caps body paragraphs.
- [ ] Justified text without hyphenation.
- [ ] Skipped heading levels (h1 → h3).
- [ ] Cramped padding inside bordered or colored containers (need 12–16px).
- [ ] Body text flush against the viewport edge.
- [ ] Content overflowing its container or forcing horizontal scroll.
- [ ] Positioned children clipped by an `overflow: hidden` parent (tooltips, menus, popovers).
- [ ] Text occluded by an overlapping layer.
- [ ] Headings crowded closer to the previous block than to their own content.
- [ ] Content stuck at `opacity: 0` because a reveal handler never ran.
- [ ] Uncaught script errors on load.

---

## 10. The antidote

Three decisions, made before generation rather than after:

1. **A palette that isn't the default.** Define it as CSS variables up front. Two or three colors plus neutrals.
2. **A type system that isn't Inter.** Distinct display and body faces.
3. **One layout primitive, repeated.** Not seven treatments competing.

Then verify: font imported, tokens defined, responsive at 1100px and 600px, hover states present, squint test passes for hierarchy, at least one signature element someone would remember, and nothing cramped.

The real risk isn't ugliness. It's being accidentally generic — neither bold enough to be maximalist nor intentional enough to be minimalist. Shipping ugly on purpose beats shipping slop by accident.

---

## Tooling

- `npx impeccable detect` — runs the deterministic rules on files, directories, stdin, or rendered URLs. Also available as a Chrome extension and via Puppeteer. Good CI candidate alongside Lighthouse.
- Roll your own: Playwright loads the page headless, an in-page script walks the DOM and reads computed styles, each pattern is a deterministic CSS/DOM check. Deliberately no LLM judge — that would reintroduce the bias you're measuring. Expect 5–10% false positives.
- A `DESIGN.md` in the repo lets Impeccable flag drift from your own documented fonts, colors, type scale, and radii — worth doing per product so the Robin family stays internally consistent.

## Sources

- Adrian Krebs, "Scoring Show HN submissions for AI design patterns" — adriankrebs.ch/blog/design-slop
- Impeccable catalog (64 patterns, 59 deterministic rules) — impeccable.style/slop
- Developers Digest summary of the Krebs audit — developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
