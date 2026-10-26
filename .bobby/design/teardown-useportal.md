# Teardown — useportal.net

**Source:** https://useportal.net · **Method:** Playwright render + screenshot + computed styles
**Site type:** Framer (JS-rendered — static HTML is a shell and contains almost none of the design)
**Confidence:** high — everything below was observed on the rendered page.

> ## ⚠️ Correction
> A previous version of this teardown was built from `curl`'d static HTML and was **wrong on
> every axis**: it claimed a pure-white ground, a restrained palette, no motion, and Inter
> headings. The real page is a full-bleed illustrated gradient with animated stars and a serif
> display face. **Static HTML analysis of a JS-rendered site produces confident nonsense.**

---

## The true feel

**Warm, whimsical, cinematic.** A dreamy dusk sky with flickering stars and a tiny robot, big
literary serif headlines, hand-drawn annotations, and tilted cards with illustrated icons. It
feels personal and charming — like a designer's passion project, not a SaaS product. The
atmosphere does the emotional work; the layout underneath is calm and conventional so the
warmth never becomes noise.

---

## Layout

| | |
|---|---|
| **Hero** | Full-bleed illustrated background, content centred over it, ~900px tall |
| **Below fold** | Light ground, centred container, generous whitespace, left-aligned text |
| **Feature rows** | Two-column — illustrated card stack on one side, text on the other |
| **Anchor** | Large app screenshot **overlapping the bottom edge of the hero**, in a rounded translucent frame |

## The hero — the defining element

- **Full-bleed illustrated dusk sky**, vertical gradient: deep blue → periwinkle → pink/magenta
  → warm orange at the horizon
- **Animated flickering stars** scattered across the upper sky (Framer layers literally named
  `Stars` and `Flickering stars`)
- **Illustrated landscape**: dark teal hills, a treeline, distant mountains
- **A small orange robot character** standing in the scene — the brand's personality in one detail
- **White serif headline** over the illustration, centred
- **White pill CTA** ("Join beta") floating on the image
- **App screenshot overlaps the bottom**, rounded, with a soft translucent white border/glow

## Colour — rich, not restrained

Hero is a multi-hue gradient: deep blue, periwinkle, pink, magenta, orange, teal-green.
Below the fold it calms to near-white `#F7F7F7` / `#FFFFFF` with black text.
Accent `rgb(0, 122, 255)` — iOS blue. Illustrated icons add orange, green, yellow.

**Two distinct zones:** a saturated illustrated hero, then a quiet editorial body.

## Type

- **Display: `Perfectly Nineties Regular`** — a distinctive editorial serif. **48px h1 · 36px h2.**
  Not Inter, not a geometric sans. This is the single biggest thing the earlier teardown missed.
- **Body: Inter** — sans, small, comfortable
- **Accent: IBM Plex Mono / Fragment Mono** — sparingly
- Headings are **full conversational sentences**, and they are *long* — four lines of serif is
  normal here: *"A freelance toolkit you can use for any type of project, big or small…"*

## Detail work — where the charm lives

- **Hand-drawn blue script annotation** with a curved arrow: *"Latest feature release"*
- **Dashed/dotted divider rules** between sections
- **Illustrated emoji-style icons** on cards (coins, calendar, flag)
- **Tilted, staggered cards** — each rotated a degree or two, overlapping like a dealt hand
- Soft, near-invisible layered shadows

## Motion

- **Flickering stars** animate continuously in the hero
- Colour transitions `400ms cubic-bezier(.44,0,.56,1)`
- Otherwise calm — the atmosphere moves, the layout does not

---

## Inherited rules

1. Hero is a **full-bleed illustrated atmospheric background**, not a flat colour
2. **Ambient animation** in the hero (stars) — subtle, continuous, never distracting
3. **Serif display face**, large, over the illustration; sans for body
4. Headings are long conversational sentences — do not compress to terse fragments
5. **Product screenshot overlaps the hero's bottom edge** in a rounded translucent frame
6. Below the fold, calm to a near-white editorial ground — atmosphere is for the hero only
7. Hand-drawn / illustrated touches carry the personality; the layout stays conventional
8. Cards may be **tilted and staggered** rather than gridded
9. **Do not inherit the 10–14px body scale** — below the readability floor
