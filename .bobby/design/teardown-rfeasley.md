# Teardown — rfeasley.io

**Method:** Playwright render at 1440×900 + computed grid + `curl` of the global stylesheet
**Site type:** Next.js — small global CSS chunk holds the tokens; component styles are inline
**Confidence:** high on tokens, layout and structure · type scale partial (component chunks)

> Written retroactively. Mockup A was built from this render, but the teardown was never filed
> — leaving A the only direction without recorded provenance. Fixed here.

## The true feel

**Sophistication through subtraction.** A near-empty warm-white field with a single phone
holding one bold, saturated app screen, a name in the far left margin and a short paragraph
in the far right. There is no hero, no pitch, no navigation to speak of. The confidence is in
how little is present — the work is the only loud thing on the page, and everything else gets
out of its way.

## Layout — the architecture

| | |
|---|---|
| **Grid** | `268.797px 739.188px 336px` at 1440 — roughly **19 / 51 / 23** |
| **Left (268px)** | **Name only.** "Robert Feasley" / "Work" in grey beneath. Nothing else. |
| **Centre (739px)** | The device — the entire visual anchor |
| **Right (336px)** | **The actual content** — a bold one-line thesis plus a short paragraph |
| **Page frame** | `padding: 52px 48px` · `height: 100dvh` |
| **Footer** | Tiny grey credit line, bottom-left: "Built with Claude · Codex · Vercel" |

**Content sits on the RIGHT.** The left column is identity, not copy — the single most
counter-intuitive fact about this layout and the easiest thing to get backwards.

## The anchor

A phone with a **thick black bezel**, outer radius `46px`, inner screen `36px`, portrait
`aspect-ratio ≈ .62`, roughly `710px` tall. Inside: a **solid saturated colour** (bold blue)
with large white text — "Readiness score / 89". Real app captures, one per project.

## Colour — five values, total

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F5F4F1` | Warm off-white ground |
| `--text-primary` | `#1A1A1A` | Ink |
| `--text-muted` | `#999999` | Secondary |
| `--text-subtle` | `#CCCCCC` | Inactive pagination |
| `--frame` | `#0D0D0D` | Device bezel |

Plus whatever colour the app screen itself carries. **No gradients. No accent colour at all** —
links are ink.

## Type

**`Geist Sans`** (variable, weights 100–900) with an `Arial` fallback carrying
`ascent-override: 94.56%` and `size-adjust: 106.28%` — a deliberate fallback-matching setup.
**One family. No monospace anywhere.**

Sizes are notably small: the name ~28px, the thesis line ~15–16px bold, body ~14–15px.

## Structure — the defining decision

```css
html, body { height: 100% }
@media (min-width: 768px) { html, body { height: 100dvh; overflow: hidden } }
```

**The desktop page does not scroll.** It is one fixed composition; state changes in place.

Mobile is a **separate DOM tree** (`.desktop-layout` / `.mobile-layout`) using
`scroll-snap-type: y mandatory` with `.mobile-section { height: 100dvh }`. Two trees, because
a fixed state-switcher cannot work on touch.

## Motion

- Copy panels **cross-fade over `500ms ease` while rising `12px`** (inactive sit at
  `translateY(calc(-50% + 12px))`, `opacity: 0`)
- Pagination is **dashes, not dots**: `6px × 2px` inactive, stretching to `20px × 2px` active
  over `350ms ease`
- Video autoplays muted and looped inside the device
- Keyframes present: `mobileChevronPulse`, `mobileChevronHaloPulse`, `videoLoadingSpin`

## Inherited rules

1. Content on the **right**; the left column is identity only
2. Five colours, no accent, no gradient
3. One typeface, **no monospace in the chrome**
4. A device with a thick bezel holding **one bold saturated screen**
5. Fixed composition on desktop; separate scroll-snap tree on mobile
6. `500ms` cross-fade with a `12px` rise; dashes that stretch `6 → 20px`
7. Enormous empty space — most of the page is deliberately nothing

## Deviations taken in Mockup A

- `--mut` raised from `#999` to `#8A8880` — `#999` on `#F5F4F1` fails WCAG AA for body text
- Device screen text raised to clear the **13px floor**; phone roster trimmed from 7 rows to 5
  so it stays readable at 224px wide
- No viewport units or `overflow:hidden` at page level — the build may be embedded in an
  auto-height iframe, where both break
