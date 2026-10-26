# Teardown — GitHub Actions run list (live, light theme)

**Openable:** <https://github.com/vercel/next.js/actions> — public, no login. Rendered live 2026-08-02,
`colorScheme: light`. Screenshot: `.bobby/design/shots/ghactions-run.png`.
**Extraction:** `extracted` = live computed styles / `:root`. `observed` = read from the screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | GitHub Actions — "All workflows" run list (GitHub Primer, light). |
| **Source** | <https://github.com/vercel/next.js/actions> |
| **What's good (the thinking)** | It shows **the exact gate we need, in a shipping product, in light theme**: a run waiting on a human reads **"Action required"** with an amber ⚠ glyph — the literal "waiting on you." Each run is a row: **status glyph → title + run# + trigger → branch pill → timestamp + duration** with a clock. The left rail lists the workflows (= the stages). Live state is a small in-glyph spinner ("In progress"), resolved states a solid check / red slash. |
| **What we take** | The **"Action required" gate treatment** as the morphing-action cue; the **row anatomy** (status glyph + identity + branch + elapsed); **Mona Sans** as a distinctive non-slop face; Primer's **real motion easings** for honest state-change. |

## Extracted values

### Colour — `extracted`
- **Page canvas:** `#F6F8FA` (rgb 246 248 250) — GitHub's classic light canvas, **blue-biased** light neutral (not grey, not cream). Surfaces `#FFFFFF`.
- **Ink:** `#1F2328` (rgb 31 35 40). Muted `#59636E` (rgb 89 99 110) `extracted`.
- **State glyphs (`observed`):** success = solid green check `≈#1A7F37`; in-progress = amber/brown spinner dot; **Action required = amber ⚠ triangle** `≈#9A6700` on soft amber; neutral/skipped = grey circle-slash.
- **Amber "needs attention" tonal** (from sibling Primer status banner, `extracted` on Cloudflare/GH status): bg `#FEF7E0`, text `#7A5300` — same tint-bg + dark-text pattern as GitLab.

### Type — `extracted`
- **Face:** `"Mona Sans VF"` (GitHub's variable grotesque) — distinctive, **not** on any slop list.
- **Sizes:** body 14px; row title 14–16px / 600; meta 12px / 400 muted. **Raise to 16px floor for our build.**

### Surface & motion — `extracted`
- **Radii:** buttons/pills `6px`; branch tags rounded.
- **Motion token set is a gift:** `--base-duration-{50…1000}` and named easings — `--base-easing-easeOut: cubic-bezier(.3, .8, .6, 1)`, `--base-easing-easeInOut: cubic-bezier(.6, 0, .2, 1)`. Use these exact curves for the honest state-change transition (replaces the pulse).
- **No left-stripe.** State is the leading glyph; rows are separated by hairlines only `observed`.

## The true feel
Quiet institutional clarity. Each row answers "what state, whose, how long, and does it need me?" in one
line. The **amber "Action required"** is the one thing that reaches out for the human — everything else
recedes. That single reach-out is the model for our morphing gate. `observed`.

## Inherited rules (if this anchors the direction)
1. The gate reads **"Action required"** — an amber tonal cue where the morphing action lives.
2. Row anatomy = **status glyph → identity → branch/context → elapsed** with a clock; mono/tabular figures for durations.
3. Ground `#F6F8FA` (blue-biased light), surfaces white, ink `#1F2328`.
4. Motion uses Primer's `easeOut cubic-bezier(.3,.8,.6,1)` on discrete state change — no ambient pulse.
5. Mona Sans (or an equivalent distinctive grotesque) — never Inter/Geist; body ≥16px.
