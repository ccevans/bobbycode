# Design Spec — bobbycode.com            v2 · Locked: 2026-08-25

The build reads **this file**, not anyone's memory of the conversation. A value in the build
that is not in this file is drift, not a decision.

> **v2 supersedes v1.** v1 (the candy-band direction) is preserved at
> `scratchpad/design/v1-candyland.html`. The user's note on v1: *"i feel like I should change
> it up some now — so it doesn't match railcode 100% — and maybe different colors — hard to
> tell its a race track."* Everything below answers those three points.

---

## What changed from v1, and why

| v1 | v2 | Because |
|---|---|---|
| Confectionery pastels as the ground | **Asphalt as the ground** | The racing read as edge detail because the big surfaces said bakery. The ground now *is* the track. |
| Full-bleed horizontal illustration bands | **One continuous track running the height of the page** | The horizontal band rhythm is railcode's most recognisable structure. Sections are now corners on one circuit, not stacked places. |
| Equal 3-up card grids | **Staggered blocks in a single grid row** | Also railcode's. The three sectors now step down and right, like a track falling away. |
| Schibsted Grotesk (railcode's face) | **Archivo, expanded width axis, uppercase** | Type silhouette was carrying the resemblance. |
| Bevelled gradient arcade button | **Flat block with a hard 5px offset** | railcode's CTA is its signature object. This is a different physical language: a sticker, not an arcade cabinet. |
| Sugar Rush as the world's material | **Sugar Rush as the cast, not the ground** | The candy was wallpaper and drowned the racing. It is now what sits *on* the asphalt: the karts, the cone, the barrier posts. |

**The hinge that lets both worlds coexist:** a candy cane and an FIA kerb are the same object —
red and white stripes. The kerbs run the whole page and read as both.

---

## Decided

| | |
|---|---|
| **Direction** | *The page is the track surface.* Asphalt ground, kerbs as the structural rule, one circuit running top to bottom. |
| **Headline** | **You drive. bobby runs the pit.** *(unchanged from v1; chosen by the user)* |
| **Signature move** | **A top-down track map in the hero, with every part named** — start/finish, pit lane, and the lap divided into S1 PLAN, S2 BUILD, S3 SHIP. The workflow *is* the lap, so the diagram carries the argument rather than decorating it. The continuous kerbed rail down the page is the same circuit, seen from inside it. |
| **Structure** | Asymmetric. Content sits in the run-off beside the track, and the three sectors stagger downhill rather than sitting in an equal row. |

---

## Tokens

### Colour — ground extracted, not invented

The Super Sprint (Atari, 1986) track-select screen was sampled pixel-by-pixel. Its tarmac is
**`#403050` at 21% of frame** and its shading is `#201828`. That is a *plum-biased* grey, which
is where this palette's neutral bias comes from — a citation, not taste.

```
--void       #14101C   deepest ground: hero, board, finish, footer
--tar        #241D2E   the main asphalt ground
--tar-lit    #403050   SUPER SPRINT TARMAC, exact — the track ribbon itself
--tar-edge   #201828   Super Sprint shading, exact
--tar-hi     #4E3D62   worn inside line
--paper      #F4F1EC   paddock panels (= kerb white; one value, two jobs)
--paper-2    #E7E1D6
--ink        #171220   ink on paper, plum-biased near-black
--ink-2      #463C55   body on paper
--ink-3      #6B6079
--sec        #D6CDE2   primary text on asphalt
--dim        #A99CBB   secondary on asphalt
--faint      #8B7E9E   tertiary  (raised from #7E7290 — that failed AA at 4.19)
--line       #FFFFFF16   --line-2 #FFFFFF2E   --line-ink #1712201F
--kerb-r     #E23B2E   FIA kerbs are red and white as standard
--kerb-w     #F4F1EC
--berry      #C8412C   BRAND RED. Unchanged from bobbycode.com through both redesigns.
--berry-lit  #F07A63   --berry-deep #9E2E1E
--flag-y     #FFD200   marshal yellow — attention only, never decoration
--flag-g     #3FB55C   green flag — the "shipped" pill and the terminal pass marks
--panel      #1B1524   terminal   --panel-fg #F2EDF7   --panel-dim #9287A3
```

### The CTA — flat, not bevelled

```css
background: var(--berry);  color: #FFFFFF;   /* #FFF4F1 measured 4.58, just under AA */
padding: 15px 30px;  border-radius: 3px;  min-height: 52px;
font: 800 16px/1 Archivo; font-variation-settings:'wdth' 108;
text-transform: uppercase; letter-spacing: .06em;
box-shadow: 5px 5px 0 var(--berry-deep);      /* hard offset. no gradient anywhere on the page */
```
Hover translates 2px into the shadow; active translates the full 5px and the shadow closes.

### Type

```
--disp / --sans : "Archivo"  (variable, wdth 62–125, wght 400–900)
--mono          : ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas
--pixel         : "Press Start 2P"
```

Display runs `font-variation-settings:'wdth' 118`, weight 800, uppercase — a wide, signage-like
silhouette. Body runs the normal width. One superfamily at two widths: obvious contrast,
guaranteed coherence.

| Role | Size | Notes |
|---|---|---|
| H1 | clamp(30, 4.3vw, 54) | 54px measured. Was 76px and ate the first viewport. |
| H2 | clamp(26, 3.5vw, 42) | |
| Closing H2 | clamp(34, 5.4vw, 68) | |
| Pull quote | clamp(24, 3.4vw, 40) | max-width **26ch on the blockquote**, not on its parent |
| Roundel numeral | 30px, wght 900 | |
| Lede 19 · Sub 17.5 · Body 16 · Card 15 · Pixel labels 13 · Buttons 13–16 | | **nothing below 13px** |

### Layout

```
--maxw 1180px    --rail 26px → 74px → 150px    --pad 20px → 32px → 40px
sections 74px → 104px → 130px vertical
sector deck at ≥1040px: 12 columns, all three in grid-row 1,
  cols 1/5/9 each spanning 4, offset 0 / 84px / 168px
radius 2 / 3 / 4 / 50% only. No 8px+ card blobs.
motion: press .1s · reveal .55s cubic-bezier(.2,.7,.2,1) · karts continuous, reduced-motion off
```

---

## Vetted — from the user

**Keep:** pixel art (explicitly: *"keep pixels but change layout so it doesn't match 100%"*);
the headline; the brand red; Sugar Rush karts as the cast.

**Drop:** railcode's horizontal band rhythm · its equal 3-up grids · its typeface · its
bevelled-gradient CTA · confectionery as the page ground.

**Delegated to me:** the direction (*"not sure"*) and the palette (*"you pick"*). Both calls,
and the reasoning, are recorded above.

---

## The hero track map

Top-down, because that is how every circuit map and Super Sprint's own track-select screen draws
one — the cited reference and the chosen viewpoint agree. Drawn per-pixel on canvas with
`image-rendering: pixelated`, like everything else in this build.

What is on it, and why each part is there rather than decorative:

| Element | Carries |
|---|---|
| Green infield, gravel run-off | Without them a track reads as a pipe, not a circuit |
| Red/white kerbs at 2px against a 9px ribbon | FIA standard. At 3px they drowned the tarmac. |
| Start/finish checkerboard | Where a lap begins and ends |
| Pit lane with **six** boxes | One per crew member — planner, builder, reviewer, tester, scrutineer, shipper |
| Two yellow timing loops | Where one sector is clocked and the next begins |
| Three cars running the lap | Continuous, off under `prefers-reduced-motion` |
| Five named labels | START/FINISH · PIT LANE · S1 PLAN · S2 BUILD · S3 SHIP |

**Two layouts, not one scaled.** A 2.8:1 landscape circuit squeezed onto a phone is an
illegible smear, so below 1040px the map swaps to a **portrait circuit** — different track
geometry, different centreline, different label positions — capped at 340px wide and set beside
its caption from 620px up. The swap is verified in both directions on resize.

Labels are real HTML positioned over the canvas, so they are selectable, scale with the page,
and are read by the `aria-label` on the canvas. Each carries a 2px `--void` outline and every
one clears AA against all three grounds it can sit on (worst case 4.65 on tarmac).

## The page as a race weekend

Three views of the same circuit, in the order you'd actually encounter it:

| | |
|---|---|
| **Hero — the map** | Top-down, labelled, outside the course. The track has not started yet; this is the plan you study before you drive. |
| **Trackside band — the arrival** | Full-bleed, side-on, at dusk. This is where the circuit begins, and where the running track starts. |
| **The rail — the lap** | The kerbed ribbon down the rest of the page. Same circuit, now seen from inside it. |

The rail deliberately **does not run through the hero**. It begins at the trackside band, so
the page moves from map → arrival → lap rather than starting mid-corner.

### What is in the trackside band

Railcode fills its band with a whole amusement park; this is the circuit equivalent, and every
object is real trackside furniture rather than scenery:

floodlight towers with light cones · a row of six lit pit garages, each with a kart and a pit
board · a transporter in the paddock · a team awning with tyre trolleys under it · the start
gantry straddling the track with its five red lights · a grandstand with a lit scoreboard and a
crowd · a recovery crane · a fuel rig · marshal posts · tyre barriers · catch fencing · a
helicopter · a tree line · and karts on the straight with the blur that says they are moving.

Drawn at 4× on desktop and **2× on narrow screens** — narrow gets more logical room rather than
smaller art, so the scene stays legible instead of compressing into a smear.

### What was added to the hero map

A tree line along the far side, a grandstand with a crowd behind the pit boxes, tyre barriers on
the outside of the fast corners, and marshal posts at two corners. The map grew from 98 to 114
logical rows to make room without crowding the circuit.

## The hero · the Grand Prix band

The hero is a **full-bleed circuit layout, edge to edge, drawn with real curves.** It replaced a
blocky top-down map and, before that, a raised track on pillars — which was a roller coaster with
a different name, and rightly called out as such. Real circuits are flat on the ground.

**Drawn from the F1 convention**, checked against live circuit maps: flat, top-down, uniform-width
ribbon, irregular on purpose, with a checkered start/finish, a direction of travel, timing loops
and coloured zone markings.

| | |
|---|---|
| Geometry | A Catmull-Rom spline stamped in pixels. The **corner complexes are a fixed share of the width and the straights stretch**, so a wide screen gets a longer lap rather than a distorted one. |
| Surface | Tarmac `--tar-lit`. The whole ribbon was briefly coloured by sector and read as three heavy bands; F1 colours only its zones, so the sector now reads off the **kerb**. |
| Sectors | Kerb alternates white with the sector's colour: **gold S1 PLAN · kerb-red S2 BUILD · pale S3 SHIP**, with a yellow timing loop at each split. |
| The field | Eight or nine cars, each drawn as a **top-down F1 sprite** rather than a marker: front and rear wings, a narrow nose, cockpit with the driver's helmet, sidepods, and four tyres joined to the body by suspension. 17 × 7 logical, roughly the 2.4 : 1 proportion of a real car, sized to sit inside the 8-wide ribbon. Wings and bodywork take the team colour; only the tyres are dark, which is what makes the silhouette read at this size. A two-step trail keeps a still screenshot reading as motion. |
| The venue | Start gantry over the line, pit lane with eight team garages, four packed grandstands, tree line, helipad, paddock, marshal posts around the lap. |
| Narrow | Below 760px the complexes shrink, furniture drops to a tree line and two stands, and the pit lane is omitted. |

## Deviations — each needs a reason

- **The page is dark-dominant.** "Permanent dark mode" is on the slop checklist. Exempt here
  because the subject's ground is literally asphalt, and it is not uniform: two full-width
  `--paper` paddock sections break it. It is a choice with a reason, not a reflex.
- **A plum-biased neutral.** Purple is a slop tell. `#403050` is not lavender — it is a dark
  desaturated plum-grey extracted from a cited 1986 specimen, used as the *ground*, never as an
  accent. Recorded in `teardown-supersprint.md`.
- **Green appears twice** — the terminal's ✓ marks and the "shipped" pill. Both are real
  semantics (a pass mark, a green flag), not decoration.
- **`html { overflow-x: hidden }`** as a guard. `overflow-y` untouched, no viewport units on
  any section, so an embedding host still scrolls normally.
- **44px hit expanders** (`::after`) on nav, footer and brand links. Painted box unchanged.
- **Single theme, no toggle.** The page commits to one world; `body` paints an explicit token
  background and every colour comes from `:root`, so it holds on either host ground.

## Slop-checklist exemptions still claimed

| Pattern | Why |
|---|---|
| Dark ground | The subject's ground is asphalt. See Deviations. |
| Pill/chip tab row | Product board stage filter; carries real state. |
| 2×2 card grid (the rules) | Four parallel items, no sequence implied, no icon tiles. |

**No longer needed after v2:** the gradient exemption (there are now zero gradients on the
page) and the cream-surface exemption (the confectionery ground is gone).

---

## Verified before publishing

- `document.scrollWidth === viewport` at 375 / 768 / 1024 / 1440 / 1920
- Every text/background pair composited and measured: **all pass WCAG AA**, lowest 4.94
- Computed styles probed on 29 selectors — nothing below 13px, no dropped declarations
- CSS math spacing grep clean; no multicol; no border + outer-shadow on any element
- Heading order H1 → H2 → H3 with no skips
- All tap targets ≥ 44px including pseudo-element expanders
- Board tabs driven by tap on a touch viewport, not just measured
- Readable with JavaScript disabled; board rows ship in the markup
- Inside an auto-height iframe the frame settles at 7177px and holds — no climb, no collapse

---

## Backported to the dark version

User: *"maybe the night theme looks better."* Rather than leave the dark build one polish
pass behind, the two real fixes found while working on light were ported back:

- **The tree line** — same fix, same colours (the dark file's original tree colours were
  reused verbatim in the new varied-canopy shapes, since they were already night-appropriate).
  The repetition was there in the dark version the whole time; it was just harder to spot
  against near-black than it turned out to be against open sky.
- **The hero as one continuous image** — a `cv-hsky` canvas behind the headline, sized to the
  text block every draw exactly as in the light version, sharing `C.void` and the same sparse
  star technique already used in the trackside-at-dusk scene. Same principle as the light
  version's shared `SKY_TOP`/`SKY_HORIZON`: the seam has to be invisible, which means the same
  literal fill colour on both sides of it, not two independently-chosen near-matches.

**Verified** at 375–1920: no overflow, the GP canvas confirmed still drawing (not blank) at
every width, the hero-sky canvas buffer resizing correctly with the text block, readable with
JavaScript off.

## The hero becomes one continuous image

User: *"the whole hero should be an image — with the clouds above and not limited to under the
headline."* Correct: the sky only existed inside the circuit canvas below the text, so the
headline sat on flat paper while clouds only appeared in the strip beneath the CTA buttons.

**Added a second canvas (`cv-hsky`) behind the headline block**, sized every time it draws to
exactly the text block's own rendered height — `textZone.offsetTop + textZone.offsetHeight`,
measured against `.hero` — so it covers the section's top padding too and butts against the
circuit canvas below with no gap. Both canvases share the *exact same* `SKY_TOP`/`SKY_HORIZON`
hex values, hoisted to module scope for that reason: the seam between them has to be invisible,
and "the same literal colour on both sides" is the only way to guarantee that rather than eyeball
it. Clouds are scattered through the whole height with a seeded pseudo-random walk (same
technique as the tree-line fix above), not confined to one row.

The headline sits at `z-index:1` above the sky canvas at `z-index:0`; `.hero`'s own CSS
background is the sky-top colour as a **no-JS fallback**, so a page with JavaScript disabled
still shows blue sky and legible text rather than a colour mismatch.

**Verified:** headline, emphasis word, lede and ghost button contrast all re-checked against the
*actual* sky colour (not assumed paper) — all pass AA, worst case 3.65 on the emphasis word
against large-text's 3.0 threshold. Canvas buffer confirmed resizing correctly at every width
(taller on mobile, where the headline wraps to three lines and the block is taller). No
overflow at 375–1920. No-JS fallback screenshotted and confirmed legible.

## The light variant — cleanup pass

User: *"not sure about the trees — i like the light theme but needs some cleanup."* Two real
defects, both invisible against the old dark ground and both exposed by moving to daylight:

- **The GP band's tree line was one shape repeated at a fixed 11px interval** — identical
  canopy, identical spacing, reading as a picket fence rather than trees. It was disguised
  against a near-black void; against open blue sky the repetition became the most obvious
  thing in the frame. Replaced with three canopy shapes (round bush, tall conifer, low shrub)
  chosen by a seeded pseudo-random walk, at 7–12px irregular spacing — never a fixed grid. The
  trackside scene's own tree line was checked and left alone: it's a continuous silhouette
  with a jagged skyline, not repeated icons, and reads as a real forest edge already.
- **The sky's dither pattern became a visible checkerboard.** `dither()` scatters pixels of a
  second colour to soften a seam between two bands — built and tuned for dark tones, where the
  effect is subtle. On light pastel blue the same technique produced an obvious grid artifact.
  Removed in both canvases; the sky now commits to clean flat bands, which reads as deliberate
  pixel art rather than a broken gradient.

One bug during the tree fix, caught by re-rendering rather than trusting the code: the first
rewrite placed the new trees at the wrong baseline (`T-3` instead of `T-20`), which drew them
in a sliver immediately overpainted by the grandstands drawn right after — so they simply
vanished. Fixed by matching the original trunk geometry's ground line exactly.

## The light variant — correction

The first pass kept the hero and Grand Prix band dark as a deliberate "night session" bookend.
User feedback: *"looks the same"* — correct, because the hero is the first (and often only)
screen anyone actually sees, and it hadn't changed. The reasoning wasn't wrong in isolation, but
it answered a question nobody asked: the user said **whole page**, and the hero is part of the
page. Fixed by retuning it rather than defending the original call.

**Hero and finish are now light**, matching everything else. The Grand Prix band and trackside
scene were repainted for **daytime** instead of night — a real change, not a palette swap:

- Sky fill in both canvases: from near-black/dusk-purple to a day-blue gradient, with a few
  drawn clouds replacing the star speckle
- Floodlights: the lamp still stands, but the glow cone is gone and the bulbs read as unlit
  glass rather than lit yellow — lights aren't visibly on in daylight
- The gravel run-off at the two fast corners: was a near-black night shade, now a sandy tan —
  what a real gravel trap actually looks like
- Grandstands, garages, the paddock helipad: **unchanged**. They're dark silhouettes either
  way — a shadowed structure against a blue sky reads exactly like one against a dark one, so
  nothing there needed retuning

**Only two dark elements remain, both consoles:** the terminal in the hero and the ticket
board in the crew section. Same principle as before, just no longer sharing space with a dark
page — now they're islands, which is a clearer example of the idea, not a weaker one.

## The light variant

`bobbycode-racetrack-light.html` — same markup, same canvases, same content, only the CSS
changed. Published as its own artifact so the dark version keeps its own URL and stays the
default.

**The mechanism, not a rewrite:** three sections (`sectors`, `who`, `consulting`) already carry
a `.paddock` class that flips them to paper-on-ink — built and proven correct across many
rounds. The light variant applies that exact same class to the three sections that were
previously riding on the dark page default (`crew`, the quote, `rules`), then flips `body`
itself from dark to light. Nothing about `.paddock`'s internals changed.

**What stays dark, and why it's a decision, not a shortcut:**

| Element | Stays | Reason |
|---|---|---|
| Hero + Grand Prix band + trackside dusk canvas | dark | It is a **night session** — real Grands Prix run at night (Singapore, Bahrain, Las Vegas). One deliberate dark bookend at the top. |
| The ticket board | dark | It is a **console**, like the terminal already is. A lit screen reads as a lit screen regardless of the page around it — same principle as `.term`, which was already theme-independent before this change. |
| Nav bar, footer | dark | Already fully self-scoped before this change (their own explicit `background` and `color`, never inherited from `body`) — untouched, no work needed. |
| `.mech` / `.rule` cards (crew, rules) | dark | Small asphalt tiles, already self-scoped with `background:var(--tar)` — untouched. On the new light section background they read as **more** distinct, not less. |
| The kerbed rail down the page | dark | It paints its own opaque asphalt fill regardless of what's behind it — asphalt doesn't change colour with the page theme. Required zero changes. |

**What actually needed new CSS** (component-level fixes only, no canvas changes):

- `body` background/text flipped to paper/ink-2
- `.hero`, `.finish`, `.board` — each needed one `color` restore, since they used to get their
  text colour free from the (then-dark) `body` cascade and now sit as dark exceptions
  requiring their own default
- `:focus-visible` outline moved from `--flag-y` (fails on paper) to `--kerb-r` (passes on
  both grounds) — a real correctness fix, not light-variant-specific
- `.paddock .tabs / .tab / .tab[aria-selected]` — the crew section's stage filter sits directly
  on the section ground, not inside a card, so it needed the same ink treatment `.paddock`
  gives everything else
- `.paddock .quote blockquote / cite` — same reason; the pull quote has no card wrapper
- `.paddock .crew, .paddock .rules` — their grid-gap hairline swapped from `--line` (white,
  meant for dark grounds) to `--line-ink` (dark, meant for light) — `.who`'s grid already used
  the correct token, which is what surfaced the pattern

**Verified** at 375/620/768/1024/1440/1920 — no overflow; every text/background pair
composited and measured, all pass AA (worst case 4.94, the install button, and 4.98, the
footer meta line — both checked, not assumed); tap targets ≥44px including the pseudo-element
expanders; tabs driven by tap; readable with JavaScript off; identical section/canvas/article
count confirms no structural drift from the dark version.

## Alternatives on the table (2026-08-25)

The user asked to see other options, keeping pixels and the race. Four directions are built and
published side by side at `direction-lineup.html` — the current build included, at the same size,
so the comparison is fair.

| | Direction | Ground | Reference | Risk |
|---|---|---|---|---|
| **A** | Attract mode | black + `#600070` | Super Sprint attract screen, sampled | the loud one |
| **B** | Pit wall | near-black, cool | F1 timing tower semantics | the sober one |
| **C** | Entry list | white + `#0C5645` | Goodwood Revival entry list PDF | the quiet one |
| **D** | The circuit | asphalt `#241D2E` | the current build | the most built |

Each has a teardown on file, was scored against the slop checklist, and was rendered and
measured at 375 / 768 / 1024 / 1440 / 1920 before being shown. Parity, not a favourite plus
three sketches.

## Changelog

- **2026-08-25 · v1** — railcode band structure repainted as a candy racetrack. Direction,
  fidelity, headline and structure chosen by the user; Sugar Rush added by the user mid-session.
- **2026-08-25 · v1 build** — review pill repaletted out of green (drift, caught by grepping
  shipped colours against this file); H1 capped at 52px; board rows moved into the markup.
- **2026-08-25 · v2** — user asked for less resemblance to railcode, different colours, and a
  racetrack that actually reads. Ground moved to asphalt sampled from Super Sprint; horizontal
  bands replaced with a continuous vertical circuit; typeface, CTA and grid all changed; candy
  demoted from ground to cast. Direction and palette delegated to me and chosen as recorded.
- **2026-08-25 · v2.1** — user: *"i like the race track in the hero better — just make it clear
  on what it is"* and *"maybe a top point of view or angle to tell its a race track"*. Added the
  labelled top-down track map as the hero's anchor, plus a separate portrait circuit for screens
  under 1040px. Terminal gained two lines and the hero grid moved to `align-items:start` so the
  map no longer sat under a false gap.
- **2026-08-25 · v2.1 build** — map labels were positioned against the whole `<figure>`
  (canvas *and* caption), so every one landed low; wrapped the canvas in its own positioning
  context. Kerbs cut 3px → 2px and red frequency 50% → 33%, which had turned the map into an
  outline. Chicane kerbs filled the gap the track routes around; that gap is now run-off gravel.
  Canvas given intrinsic `width`/`height` attributes so it holds its aspect with JavaScript off
  instead of collapsing to a 2:1 blank box.
- **2026-08-25 · v2.3** — user: *"span the track from one side of the page to the other with the
  curves"* and *"add cars racing in it … think big F1 event like at monaco"*, after correctly
  rejecting a raised track on pillars as a roller coaster. Hero rebuilt as a full-bleed Grand Prix
  circuit: spline curves, kerb-coded sectors, a running field, and the venue around it.
- **2026-08-25 · v2.9** — user: *"maybe the night theme looks better."* Backported both fixes
  from the light build into the dark version: the varied tree line (was the same repeated
  picket-fence shape, just less visible against near-black) and the hero-as-one-image canvas,
  using `C.void` and the trackside scene's existing star technique instead of the day sky.
- **2026-08-25 · v2.8** — user: *"the whole hero should be an image ... not limited to under
  the headline."* Added a sky canvas behind the headline block, sized to the text's own
  rendered height every draw, sharing exact sky-colour constants with the circuit canvas below
  so the two read as one uninterrupted image. No-JS fallback added to `.hero`'s CSS background.
- **2026-08-25 · v2.7** — user: *"not sure about the trees ... needs some cleanup"*. Varied the
  GP band's tree line (was one shape on an 11px grid); removed the sky dither in both canvases
  after it produced a visible checkerboard on light pastel tones instead of a soft gradient.
  One self-caught bug: the tree rewrite's first pass used the wrong baseline and drew the new
  trees into a strip the grandstands immediately painted over — invisible until re-rendered.
- **2026-08-25 · v2.6** — user: *"looks the same"*, correctly rejecting the night-session hero
  as indistinguishable from the dark build. Hero and finish flipped to light; Grand Prix band
  and trackside scene repainted for daytime (sky, clouds, unlit floodlights, sandy gravel).
  Structures needed no changes — dark silhouettes read the same against either sky. Terminal and
  ticket board remain the only dark elements, now genuinely functioning as consoles rather than
  blending into a dark page.
- **2026-08-25 · v2.5** — user: *"what about a lighter version"*, clarified via question to
  mean the whole page on a light ground. Built as a separate file
  (`bobbycode-racetrack-light.html`) rather than overwriting the dark build, reusing the
  existing `.paddock` light-mode mechanism as the new base rather than inventing a parallel
  system. Zero canvas/JS changes were needed — every fix was CSS-only, because the dark cards
  (`.mech`, `.rule`, `.board`, `.term`, the rail) were already self-scoped and independent of
  the page's dominant theme.
- **2026-08-25 · v2.4** — user: *"can we make the cars look more like F1 cars"*. The field was
  coloured rectangles; it is now a proper top-down single-seater sprite. Two passes were needed:
  the first had dark wings that vanished against the tarmac and stubby 1.4 : 1 proportions, and
  the second had tyres floating detached from the body until suspension links were added.
- **2026-08-25 · v2.3 build** — the straight-length floor was a hard 96 logical px, so at 375px
  (`lw` 188) the right-hand anchor fell *left* of the left-hand one and the geometry inverted.
  Complex width is now a share of the canvas with a guard. The pit lane was computing its own
  anchors and had to be fed the same ones.
- **2026-08-25 · v2.2** — user: *"maybe we can add more details and other parts of the track
  like railcode has the amusement park"* and *"the long running track maybe can start later in
  the page and not in the hero"*. The hero moved out of `.course` so the rail now begins at a new
  full-bleed trackside band, and that band is the circuit's populated world. Hero map enriched
  with grandstand, trees, barriers and marshal posts.
- **2026-08-25 · v2.2 build** — the band was given a fixed CSS height against a 4× buffer, which
  squashed it vertically only; it now sizes from its own aspect. `dither()` had been dropped in
  the v2 rewrite and the sky bands needed it back. Objects were colliding (transporter behind the
  gantry, floodlight inside the grandstand), so the scene was re-laid on a collision-free plan.
  Grandstand crowd rebuilt — random multicolour read as confetti, so each tier now has its own
  tone with occasional accents. Both new canvases given intrinsic `width`/`height` so they hold
  their aspect with JavaScript off instead of collapsing.
- **2026-08-25 · v2 build** — fixed a non-idempotent canvas measurement (the rail measured its
  own mutated width, so a second call drew at the wrong scale with two animation loops running);
  `22ch` on the quote resolved against the wrong font-size; `--faint` raised to clear AA; button
  text to pure white to clear AA on the unchanged brand red; `.nav-in` shorthand padding was
  zeroing `.wrap`'s horizontal padding and clipping the wordmark at 375px; footer heading level
  h4 → h3 to stop a skip; pavement layers respread because every one sat inside a 34-value range.
