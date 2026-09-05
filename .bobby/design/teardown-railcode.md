# Reference Teardown — railcode.dev

Extracted 2026-08-25. Method: Playwright render at 1440×900 (8 scroll positions, read as
images) **first**, then `curl` of `/assets/index-CfimRFGl.css` (69KB, real `:root` block),
then `getComputedStyle` probes on the live page. Nothing here is from memory.

Screenshots: `rail-top.png`, `rail-s0..s7.png`, `rail-full.png` in the session scratchpad.

---

## 0. What the page actually is

A **world**, read top to bottom, ordered by altitude. Sky at the top, ground in the middle,
underground at the bottom. Every band is a place, and the illustration bands are the joints
between them:

```
sky #e2eff8      hero — headline left, dark terminal window right
  ↓ park band    200px full-bleed pixel-art amusement park (coaster, ferris wheel, carousel)
grass #cde5b0    "A safe playground for your company"
forest #21452d   dark green — the product lives here. Pill tabs + real app UI screenshot
grass #cde5b0    "Automating work should be fun" — comparison split
forest #21452d   feature cards with pixel-art icons
grass #cde5b0    closing CTA "Set the builders free"
  ↓ soil line    grass + trees, then a cross-section cut
soil #4a3423     footer, underground, tree roots and worms visible in the dirt
```

The metaphor is not decoration bolted onto a SaaS page — the **section backgrounds are the
metaphor**. That is the load-bearing fact of this reference.

---

## 1. Colour — full `:root`, verbatim

| Token | Value | Role |
|---|---|---|
| `--paper` | `#e2eff8` | sky ground (hero) |
| `--paper-2` | `#e7eff8` | sky, lighter |
| `--ink` | `#221812` | warm near-black — **brown-biased, not grey** |
| `--muted` | `#6f6156` | secondary text |
| `--faint` | `#9c8d80` | tertiary |
| `--line` | `#2218121c` | hairline (ink @ 11%) |
| `--coral` | `#4c8dd4` | link blue (token name is a leftover) |
| `--coral-deep` | `#2e6bb5` | link hover |
| `--coral-text` | `#1e5596` | inline link in body copy |
| `--band-2` | `#cde5b0` | grass green band |
| `--band-lift` | `#e1efd0` | grass, lighter |
| `--ink-cool` | `#1e3a22` | heading ink **on grass** — green-biased, not `--ink` |
| `--muted-cool` | `#48604a` | body on grass |
| `--showcase-bg` | `#21452d` | forest-green section ground |
| `--showcase-panel` | `#31523c` | card fill inside forest |
| `--showcase-panel-line` | `#4f6c59` | card border inside forest |
| `--showcase-tile` | `#ffffff0d` | tile fill (white @ 5%) |
| `--footer-bg` | `#4a3423` | soil brown |
| `--panel` | `#2c2520` | terminal window ground |
| `--panel-line` | `#ffffff17` | terminal divider |
| `--panel-fg` | `#eee8e1` | terminal text |
| `--panel-dim` | `#8b8079` | terminal secondary |
| `--st-high/med/low` | `#d03b3b` / `#fab219` / `#0ca30c` | status only |

**Two ink families, switched by band.** Warm brown ink on sky/soil; cool green ink on grass.
Not one ink used everywhere. This is the detail that makes the bands read as places.

---

## 2. Type

```
--sans:  "Schibsted Grotesk", -apple-system, …    (Google Fonts, wght 400 500 600 700)
--mono:  ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
--pixel: "Press Start 2P", ui-monospace, …        (Google Fonts)
```

Computed, from the live page:

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| H1 hero | 62px | **400** | 64.5px (1.04) | −2.17px (−0.035em) |
| H2 section | 48px | 400 | 50.9px (1.06) | −1.44px (−0.03em) |
| H2 closing | 64px | 400 | 67.8px | −1.92px |
| Hero subhead | 19px | 400 | 33.25px (1.75) | normal |
| Section subhead | 17.5–22px | 400 | 1.5 | normal |
| Body | 16px | 400 | 25.6px (1.6) | normal |
| Card H3 | 17px | 600 | 25.5px | −0.34px |
| Card body | 15px | 400 | 24px (1.6) | normal |
| Brand wordmark | 17px | 600 | 25.5px | −0.17px |
| CTA button | 15px | 700 | — | +0.9px, **uppercase** |
| Nav button | 11px | 700 | — | +0.66px, uppercase |

**Display type is weight 400, not bold.** The headline reads heavy because Schibsted Grotesk
is a sturdy face, not because it is bolded. Tight negative tracking at display size is the
whole typographic idea.

`Press Start 2P` appears only as pixel-font accent, never as running text.

> **Deviation required:** the 11px nav button and the 8.5–11.5px text inside the embedded app
> screenshots are below this project's 13px floor. Take the *proportions*, scale to clear 13px.

---

## 3. Layout

- Container `--maxw: 1120px`
- Section vertical rhythm: **`116px 0`**, hero `72px 0`, closing section `272px 0 200px`
- Illustration bands: full-bleed, **200px** tall, no padding, sit *between* sections
- Feature panels: 2-up split, illustration on one half, copy on the other, **alternating sides**
- Small feature cards: 2×2 grid, pixel icon top-left, H3, 2 lines of body
- Hero: copy left ~45%, dark terminal window right ~55%. Not centered.
- Product showcase: pill tab row above a full app-UI screenshot in a dark card

---

## 4. Surfaces, radius, shadow

Radius frequency: `3px` (13×) · `8px` (10×) · `999px` (9×) · `7px` (9×) · `6px` (9×) · `4px` (9×)
→ a **small-radius system**, 3–8px. Pills only for tab chips and buttons. No 16px+ blobs.

Terminal window: `box-shadow: 0 24px 60px -26px #0009` — one deep, tight, offset cast shadow.
Cards inside the forest band: flat fill + 1px border, **no shadow**.

### The CTA button — the reference's signature object

```css
background: linear-gradient(#ffdf6b, #f8c820 55%, #e3ac18);
color: #4a2e08;
padding: 14px 28px;  border-radius: 12px;
font: 700 15px/1 var(--sans); text-transform: uppercase; letter-spacing: .9px;
box-shadow:
  inset 0 1px  #ffffff8c,        /* top highlight */
  inset 0 -2px #8c5a084d,        /* inner bottom shade */
  0 3px 0 #b8860b,               /* hard 3px lip — the physical edge */
  0 14px 28px -12px #8c5a08b3;   /* soft cast shadow */
```

Hover presses it down: the lip drops `3px → 1px` and the cast shadow tightens `14/28 → 6/14`.
This is a real, pressable, arcade-cabinet button. It is the single most copyable object on
the site.

---

## 5. Illustration — the mechanism

**`<canvas>` elements with `image-rendering: pixelated`**, drawn programmatically per-pixel at
low resolution and scaled up. Confirmed by DOM probe:

```
CANVAS 1440×200 image-rendering:pixelated   ← the park band
CANVAS  235×40  image-rendering:pixelated   ← inline pixel object
CANVAS   58×20, 46×16, 34×14, 24×10         ← drifting clouds
```

Not SVG, not sprite PNGs. Feature icons in the forest band (traffic cone, door, house,
ledger) are small pixel objects standing in for the icon-tile template — that is this
reference's answer to the generated-feature-card look.

---

## 6. Motion — as experienced

| What | Value |
|---|---|
| Button press | `transform .12s`, `box-shadow .12s`, `filter .15s` |
| Scroll reveal | `opacity .6s cubic-bezier(.2,.7,.2,1)` + `transform .6s`, same curve |
| Section transform | `transform .24s cubic-bezier(.2,.7,.3,1)` |
| Link colour | `color .15s` / `.25s` |
| Clouds | drift horizontally across the sky band, continuous, slow |
| `prefers-reduced-motion` | honoured — several `transition: none` overrides present |

Nothing bounces. Nothing pulses. Motion is short and physical, except the clouds, which are
ambient and belong to the world rather than the interface.

---

## 7. What is deliberately absent

No gradients other than the button. No glassmorphism. No icon tiles. No stat banner. No
`01/02/03`. No testimonial carousel. No dark mode toggle — the page is one committed world,
and the "dark mode" is a *place inside it* (the forest), not a theme.

---

## 8. Unknowns

- `--dw`, `--d-ink`, `--d-sec`, `--d-mut`, `--d-line`, `--d-fill` and the `--a-*`, `--c-*`,
  `--c3-*`, `--lg-*` families belong to the **embedded demo-app mockups**, not to the site
  chrome. Not inherited here.
- Exact cloud drift duration — `unknown`, read as slow ambient loop from the render, not
  extracted as a number.
