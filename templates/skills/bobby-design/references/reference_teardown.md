# Reference Teardown → Design Doc

How to turn an inspiration site into hard numbers, and then build only from those numbers.

**Why this exists.** Prose impressions of a reference — "restrained," "confident," "warm" — are too vague to constrain a build. You can write "restrained" and then ship dark industrial blocks and still feel you honoured the reference. **Extracted values cannot be argued with.** A `1.08` line-height and a `#FAFAF8` ground either made it into the build or they did not.

**The rule this whole document exists to enforce:**

> Once the design doc is written, **the new design may only use values from the design doc.** New values require a stated reason.

---

## Step 0 — RENDER IT AND LOOK AT IT. Always. First.

**This is the most important step in this document, and it is the one most likely to be skipped
in favour of clever greps.** Everything after this is refinement. If you only do one thing, do
this one.

Source analysis tells you what is *declared*. It cannot tell you what the page *is*. A teardown
built from source alone will confidently describe a page that does not exist — and because every
value in it is citable, it looks like rigour.

```bash
python3 - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto("<url>", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(3000)                      # let JS render and fonts settle
    pg.screenshot(path="ref-top.png")
    for i, y in enumerate([900, 1900, 3200, 4500]):
        pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"ref-{i}.png")
    print(pg.evaluate("""()=>{const o=[];document.querySelectorAll('h1,h2,h3').forEach(e=>{
      const s=getComputedStyle(e); if(e.innerText.trim())
      o.push([e.tagName, s.fontFamily.split(',')[0], s.fontSize, s.color]);});return o.slice(0,10)}"""))
    b.close()
PY
```

**Then actually read the images.** Not the filenames — the pictures. Write down what you see:
the hero's background, whether it is illustrated or flat, what anchors it, what moves, what the
display face looks like, where the colour lives.

**Computed styles beat declared styles.** `getComputedStyle` on rendered headings gives you the
typeface that actually shipped — including webfonts loaded by JS that appear nowhere in source.

### Why this is non-negotiable

A real teardown done from `curl` alone reported: *pure white ground, restrained palette of white
plus one grey plus one blue, no motion, Inter headings, alternating white bands.*

The rendered page was: **a full-bleed illustrated dusk-sky gradient — blue to pink to orange —
with animated flickering stars, an illustrated landscape with a small robot character, a large
editorial serif display face, and a product screenshot overlapping the hero's bottom edge.**

Wrong on every axis, with confident citations for each error. The white-and-grey it "found" was
from sections below the fold that were never even looked at.

### JS-rendered sites (Framer, Webflow, React, Next)

For these, **static HTML is a shell** and contains almost none of the design. Greps over it
return near-empty results — and empty results read as "the design doesn't have this," which is
how you conclude "nothing moves" about a page with an animated star field.

**Absence of evidence in static HTML is not evidence of absence in the design.** Never report a
negative ("no motion", "restrained palette") from source alone. Report it only from the render,
or mark it `unknown`.

Also: **resolve token indirection.** `background-color: var(--token-a463fa7a-…)` is not a value.
If you cannot resolve it, it is `unknown`, not absent.

---

## Step 1 — Get the declared implementation

Now that you know what the page *is*, source tells you how it was built.

**Do not rely on a page-fetching tool that converts to markdown** — that strips `<link>` tags and
every stylesheet with them. You need raw source, which means shell.

### The commands that work

**1. Pull the raw HTML.**

```bash
curl -sL --max-time 25 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" <url> -o page.html
wc -c page.html
```

A user-agent is required; many hosts refuse the default curl agent.

**2. Find the stylesheets.**

```bash
grep -oE '<link[^>]*rel="stylesheet"[^>]*>|<style[^>]*>' page.html | head -20
```

**3. Fetch the CSS and make it readable** (production CSS is minified onto one line):

```bash
curl -sL --max-time 25 -A "Mozilla/5.0" "<css-url>" -o site.css
cat site.css | sed 's/}/}\n/g' | head -80
```

**4. Extract the token system — the highest-value grep there is:**

```bash
grep -oE '\-\-[a-zA-Z0-9-]+: *[^;}]{1,60}' site.css | sort -u | head -60
```

A `:root` custom-property block *is* the design system, handed to you. Sites frequently have far fewer colors than you would guess — five is common.

**5. Count value frequency to find the real scale.** The most-used values *are* the system; outliers are one-offs.

```bash
grep -oE 'font-size: *[0-9.]+(px|rem)' site.css | sort | uniq -c | sort -rn | head -12
grep -oE 'border-radius: *[0-9.]+(px|rem)' site.css | sort | uniq -c | sort -rn | head -8
grep -oE 'background-color: *(rgb\([^)]*\)|#[0-9a-fA-F]{3,8})' site.css | sort | uniq -c | sort -rn | head -10
grep -oE 'font-family:[^;"}]{1,70}' site.css | sort | uniq -c | sort -rn | head -8
```

**6. Read the structural rules.** Grep the readable CSS for `height`, `overflow`, `scroll-snap`, `position:fixed`, `display:grid`, and `@media`. This is where the facts live that prose analysis cannot see.

**7. Reconstruct the LAYOUT — tokens are paint, not architecture.**

This is the step most likely to be skipped, and skipping it means you extract a palette and still have no idea what the page *looks like*. Colours and fonts do not tell you that content sits left and a device anchors the centre.

Many sites put layout in **inline styles**, so grep the HTML, not only the CSS:

```bash
grep -oE 'style="[^"]{40,220}"' page.html | grep -iE 'grid|flex|position|aspect-ratio|width|transform' | head -20
grep -oE 'grid-template-columns:[^;"]{1,60}' page.html | sort -u
grep -oE '<(video|img|canvas|svg)[^>]{0,160}>' page.html | head -12
```

Write down:

- **The column structure and its proportions.** `grid-template-columns: 20% 55% 25%` is a fact; "asymmetric" is not.
- **The visual anchor.** What is the hero object — a device mockup, a video, a photo, type alone? Where does it sit? How big is it relative to the page?
- **Where the text lives** relative to that anchor, and how it is aligned.
- **Page padding and the outer frame.**
- **What is empty.** Deliberate void is a design decision; note its size and position.

**8. Capture MOTION as experienced, not as keyframe names.**

```bash
grep -oE 'transition:[^;"]{1,70}' page.html | sort | uniq -c | sort -rn | head -12
grep -oE 'transform:[^;"]{1,50}' page.html | sort -u | head -12
grep -oE '@keyframes [a-zA-Z]+' site.css
```

Record the **durations, easings, distances, and what triggers them** — "copy cross-fades over 500ms while rising 12px" is usable; "has animations" is not. Note interactive affordances too: a pagination control that stretches from `6px` to `20px` over `350ms` is a designed detail worth inheriting.

**8b. Extract the VISUAL SYSTEM — the greps that find character, not tokens.**

Token histograms describe a stylesheet. These five signals describe a *design*, and they work
even on builder-generated markup where token counting fails:

```bash
# 1. THE ANCHOR — image dimensions tell you what the page is actually built around
grep -oE '<img[^>]{0,300}' page.html | grep -oE '(width|height|alt)="[^"]{0,60}' | head -20
grep -oE '(framerusercontent|cdn)[^"]{0,60}\.(webp|png|jpg|svg)' page.html | sort -u | head
```
A `2592×1676` image is a **product screenshot** and it is probably the whole point of the page.
A `184×2` is a divider. Dimensions distinguish an anchor from a decoration instantly.

```bash
# 2. BACKGROUNDS IN DOCUMENT ORDER — never frequency. Order reveals the section rhythm.
grep -oE 'background-color:[^;"}]{1,32}' page.html | head -20
```
Frequency says "mostly white." Order says "**alternates white / #F7F7F7 band to band**" — a
completely different instruction, and only one of them is the design.

```bash
# 3. CONTAINER WIDTHS — the real layout grid
grep -oE 'max-width: *[0-9]+px' page.html | sort | uniq -c | sort -rn | head -6
```
Repeated values are the grid: e.g. `1199px` content container inside a `1727px` outer, with a
`809px` text measure.

```bash
# 4. SHADOWS — where the craft usually hides
grep -oE 'box-shadow:[^;"}]{1,90}' page.html | sort -u | head -8
```
The single highest-signal grep on a polished site. A `0 0 0 5px #F7F7F7` ring is a *photo mat
around screenshots* — a signature detail. Multi-layer shadows with fractional offsets and
negative spread are deliberate physical modelling, and they are the difference between
"designed" and "has a drop shadow."

```bash
# 5. GRADIENTS — usually masks and fades, not decoration
grep -oE '(linear|radial)-gradient\([^)]{1,90}\)' page.html | sort -u | head
```
`linear-gradient(180deg, rgba(255,255,255,0) …)` is a screenshot **fading into the page ground**
rather than ending on a hard edge — a technique, not a colour.

**8c. If the reference runs a METAPHOR, extract what makes it legible.**

Some designs are built on a conceit — the site is an operating system, a newspaper, a
terminal, a filing cabinet, a book. For these, the components are the easy part and the
**staging** is the whole thing. Copy the components without the staging and you get a page
with a title bar on it, not a desktop.

Write down, explicitly:

| Field | Example — "the site is a desktop OS" |
|---|---|
| **The conceit** | This is an OS desktop, and the page is a window open on it |
| **The frame** | A **wallpaper** — an actual scene, not a tint — visible on *all sides* |
| **The staging** | The content window **floats**, with desktop showing around it. It is not full-bleed. |
| **The furniture** | Taskbar/dock · menu bar · desktop icons *on the wallpaper* · min/max/close |
| **The give-away** | A **second window peeking out behind** — one cheap element that makes it unmistakable |
| **What breaks it** | Content going edge-to-edge; icons in a padded sidebar rather than on the wallpaper |

**Affordances must behave in-world.** A metaphor is a *promise about behaviour*, and every
control that looks in-world has to act in-world. A desktop icon that scrolls to an anchor is
not a desktop icon — it is a link wearing a costume, and one click destroys the illusion the
whole design is built on.

| Looks like | Must actually |
|---|---|
| Desktop icon | **Open a window** — not scroll, not navigate |
| Close / minimise | Close or minimise **that** window |
| Taskbar item | Focus or restore its window |
| Tab | Switch panels |
| Folder, file, drawer | Open |

**If a control cannot behave in-world, remove it.** A dead close button is worse than no
close button — it proves the metaphor is decoration.

**The 3-second test is static and therefore not enough.** It checks whether the metaphor
*reads*; it cannot check whether it *survives contact*. Add the behavioural pass: **click
every in-world control and confirm it does the in-world thing.** Drive it in the harness —
open a window, close it, click the taskbar — and assert the state, exactly as you would test
any other interaction.

**The 3-second test:** show the render to someone with no context. If they cannot name the
metaphor unprompted, it is not built yet. Components are necessary; staging is what
communicates. Most of the legibility lives in **one or two cheap cues** — find them and
build those first, before any of the detail.

**Then write the "true feel" paragraph.** One paragraph naming where the energy actually lives:
*"Quiet page, loud product — the layout is deliberately unremarkable so the screenshots and the
voice do all the work."* If you cannot write that sentence, you have not understood the
reference yet, no matter how many values you collected.

**9. Look at the rendered page.** CSS and DOM give you the skeleton; they do not tell you how it *feels* at speed. If a browser tool is available, load the page and screenshot it. If not, say in the doc that the layout was reconstructed from source and mark the feel **unverified**.

### Know the site type

- **Framer / Webflow / Wix — CSS extraction does NOT work. Do not try.** These builders emit thousands of generated inline style declarations, one per element. Frequency-counting them tells you about *the builder's renderer*, not about the design. You will get a font list, a background colour, and a scatter of radius values — and if you build from that you will produce a generic page with none of the reference's actual character, while believing you extracted its system.

  **What to do instead:** treat the site as **visual-only**. Load the rendered page and read the *composition* — section order, what anchors each screen, where imagery sits, how dense it is, what the hero actually shows. Record the tokens you can confirm, mark everything else `unknown — builder-generated markup`, and say plainly that the teardown is visual rather than extracted. A visual teardown you are honest about beats a token dump you mistake for a system.

  **Tell-tale:** if `page.html` is 300KB+ with hundreds of distinct inline `--token` values and no linked stylesheet holding a `:root` block, you are in this case.
- **Next.js / bundled** — a small global CSS chunk holds `:root` tokens; per-component styles live in other chunks. You may get tokens and structure but not the full type scale. Say so.
- **JS-rendered SPA** — CSS may not be reachable at all. Mark the whole doc `estimated` and lean on visual inspection.

### Why this matters more than it sounds

Prose analysis of a reference will tell you it feels "restrained." Reading its CSS tells you that **the desktop layout does not scroll at all** (`height:100dvh; overflow:hidden`) and that mobile is a `scroll-snap-type: y mandatory` deck of full-height sections. That is the single most important fact about the design, it is invisible from the outside, and no amount of describing the page will surface it.

If a site blocks fetching, say so in the doc and mark the affected values **estimated**. Never silently guess — a labelled estimate can be corrected later; an unlabelled one becomes a fake fact.

---

## Step 2 — Fill in the design doc

Write it out. Every field gets a real value or an explicit `unknown / estimated`.

```markdown
# Design Doc — extracted from <name>

Source:      <url>
Method:      <fetched stylesheet | inline styles | estimated from render>
Confidence:  <high | mixed | low — say which parts are estimated>

## Type
Families:        <exact stacks, incl. fallbacks>
Display size:    <value, and how it scales — clamp? breakpoints?>
Body size:       <value>
Small/label:     <value>
Weights used:    <the actual set — e.g. 400, 600 only>
Line-heights:    <display / body / small>
Letter-spacing:  <per level — note negative tracking on display>
Measure:         <max line length on body copy, in ch or px>
Case treatment:  <any uppercase + tracking on labels>

## Color
<every value, with role and where it appears>
Distinct count:  <how many colors total — usually far fewer than expected>
Accent usage:    <where it appears, and how sparingly>
Theme handling:  <how dark mode is done, or single-theme>

## Space
Scale:           <the actual repeating values>
Section rhythm:  <padding above/below sections>
Gaps:            <between elements, between groups>
Container:       <max-width + gutter values>

## Surface
Border widths:   <values + colors>
Radius:          <every distinct value — often 0>
Shadows:         <exact, or "none">

## Motion — as experienced
Durations:       <ms, per element type>
Easing:          <curves>
Transitions:     <what changes, and by how much — "copy cross-fades 500ms while rising 12px">
Affordances:     <how controls behave — "pagination dashes stretch 6px → 20px over 350ms">
Autoplay:        <video/animation that runs unprompted>
What is still:   <what deliberately does not move>
Scroll behavior: <from the JS>

## The true feel
<One paragraph: where does the energy live? What is doing the work, and what is
deliberately getting out of the way? If you cannot write this, you have not
understood the reference yet.>

## Layout — the architecture
Container grid:   <repeated max-widths — outer / content / text measure>
Section rhythm:   <do grounds alternate? extracted in DOCUMENT ORDER, not frequency>
Screenshot / image treatment: <rings, mats, fades, radii on media>
Column structure: <exact — e.g. "grid-template-columns: 20% 55% 25%">
Page frame:       <outer padding, max-width, fixed vs scrolling>
Visual anchor:    <the hero object: device mockup / video / photo / type — and its size + position>
Text placement:   <where copy sits relative to the anchor, and its alignment>
Empty space:      <where the deliberate void is, and how much>
Section marking:  <numbering, eyebrows, rules — the actual device>
Nav & footer:     <treatment>
Responsive shift: <how the whole composition changes at breakpoints>

## Inherited rules
The 5–10 hard constraints the new design must obey. Be specific and testable:
1. Body copy never exceeds <N>ch
2. Only <N> distinct colors on the page
3. Radius is always <N>
4. Display tracking is negative, labels are positive
5. …
```

---

## Step 2b — Vet the extracted traits with the user

**Extraction tells you what the reference does. It does not tell you what the user liked.** Those are different, and assuming they are the same is how you honour a trait they never noticed while dropping the one that made them send the link.

Before building anything, surface **3–5 concrete traits per reference** and let them react.

### How to run it

- **Translate every value into plain language.** "`height:100dvh; overflow:hidden`" becomes *"the page doesn't scroll — it's one fixed screen."* Users cannot react to CSS.
- **Say which traits are load-bearing.** Structural choices (no-scroll, snap sections, a fixed frame) change the entire build. Cosmetic ones (a radius value, an exact off-white) do not. Tell them which is which so they spend their attention correctly.
- **Ask what they would change**, not only what they like. "Love it but that colour is wrong" is common and useful.
- **Never ask them to author.** Not "what radius do you want?" but "Portal is very round — is that part of what you like, or incidental?"

### The output

For each reference, a short list:

| Trait | Verdict |
|---|---|
| Three columns, 20/55/25 — text left, device centre, right side empty | keep / drop / unsure |
| A device mockup as the visual anchor, playing video | keep / drop / unsure |
| Copy cross-fades over 500ms while rising 12px | keep / drop / unsure |
| Desktop doesn't scroll — one fixed screen | keep / drop / unsure |
| Only five colours in the entire site | keep / drop / unsure |
| Warm off-white ground, not pure white | keep / drop / unsure |

**Cover all four dimensions, not just colour and type.** A vetting list made only of tokens will miss the things people actually respond to:

1. **Layout** — the composition, the anchor, what is empty
2. **Motion and feel** — how it transitions, how fast, what moves
3. **Colour and type** — the tokens
4. **Structure** — scrolling behaviour, sectioning

Most people notice **layout and feel first** and could not name a hex code if asked. If your vetting list is all hex codes and font names, you are asking about the dimension they care least about.

This is what turns **merging two references into a decision rather than a guess.** Without it you are picking which reference wins each conflict on your own taste — which is the failure this whole document exists to prevent.

---

## Step 3 — Build only from the doc

- **Every value in the new design comes from the doc.** Colors, sizes, spacing, radius, durations.
- **Except the type-size floor, which always wins.** If the reference runs 10/12/14px body and label text, **do not inherit it.** Take its *proportions* and scale the whole system up so body clears 16px and nothing falls below 13px. Note it as a stated deviation. Readability is not a value to be inherited away.
- **A banned font in the reference is inheritable; a banned font from your own head is not.** If the teardown shows the user's reference using Inter or Geist, using it is honouring their taste. Reaching for it unprompted is the default failure. Say which case you are in.
- **You bring the content, the structure, and the idea.** You inherit the *system*, not the layout. This is the difference between learning from a reference and cloning it.
- **Deviating is allowed, but must be stated.** "The reference has no accent color; I am adding one, used once, because the roster needs a single point of emphasis." A written reason is fine. Silent drift is not.
- **Multiple references?** Write a doc for each, then reconcile into one merged doc before building — and note which reference won each conflict. **The user's step-2b verdicts decide the conflicts, not your taste.**
- **Preferred deliverable: one mockup per reference.** Render the user's real content in each reference's extracted system (minus anything they marked *drop*). Seeing their own site in each system is far easier to judge than swatches, and it makes "combine these two" a concrete instruction instead of a guess.

---

## Step 3b — Verify every part before you build

**A teardown with holes produces a design with invention in the holes.** Wherever a field is blank, your own taste fills it silently — which is the failure this whole document exists to prevent. So go field by field and confirm each one is either **extracted** or **explicitly marked unknown**. There is no third state.

| Dimension | Must have | Done |
|---|---|---|
| **Layout** | Exact column structure, page frame/padding, responsive shift | ☐ |
| **Anchor** | The hero object, its size, its position — or "none" | ☐ |
| **Text placement** | Where copy sits relative to the anchor, alignment | ☐ |
| **Empty space** | Where the deliberate void is, and how much | ☐ |
| **Transitions** | Duration, easing, **distance**, and trigger for each | ☐ |
| **Affordances** | How controls behave on hover/active/focus | ☐ |
| **Autoplay / ambient** | Anything moving without user input — or "none" | ☐ |
| **Scroll behaviour** | Snap, fixed, smooth, parallax — or "normal" | ☐ |
| **Colour** | Every value + role, and the total count | ☐ |
| **Type** | Families, scale, weights, line-heights, tracking, measure | ☐ |
| **Spacing** | The repeating scale, section rhythm, gaps | ☐ |
| **Surface** | Radius values, border weights, shadows | ☐ |

**A token list is not a teardown.** If the Layout, Anchor, and Transitions rows are empty, you have a palette and a font stack — not a design. Building from that produces a generic page in the reference's colours, which is the failure mode that looks most like success: you can cite every value and still have captured nothing the user recognises. **If those three rows cannot be filled, stop and go look at the rendered page.**

**The transitions-and-feel row is the one most often left blank, and it is the one users notice first.** "Has animations" is not an entry. An entry looks like: *"copy cross-fades 500ms ease while rising 12px; pagination dashes stretch 6px → 20px over 350ms; video autoplays muted on loop."*

If a dimension cannot be extracted, write `unknown — <why>` and say so when you present. A labelled hole is honest; a silent one becomes invention.

---

## Step 4 — Check the build against the doc

Before shipping, go field by field:

- [ ] Type scale matches, including line-heights and tracking
- [ ] Measure respected on body copy
- [ ] Color count is at or below the reference's
- [ ] Spacing rhythm matches
- [ ] Radius and border weights match
- [ ] Motion durations and easing match
- [ ] Every deviation has a written reason

**The family test:** put the build next to the reference. Could someone tell they belong together? If not, a value drifted — find it in the doc.

---

## What this does not license

This is **not** cloning. You are extracting a *system* — a type scale, a spacing rhythm, a colour discipline — the way a designer learns proportion from work they admire. What you must not take:

- The reference's content, copy, or images
- Its specific layout composition
- Its logo, brand marks, illustrations, or photography
- Anything that would make a viewer think the new page *is* that brand

Inherit the craft, not the identity. If the finished page could be mistaken for the reference's own site, you have gone too far.
