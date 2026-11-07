# Teardown — Atlassian Statuspage (GitHub / Cloudflare status, live, light)

**Openable:** <https://www.githubstatus.com/> and <https://www.cloudflarestatus.com/> — public, no login.
Rendered live 2026-08-02, `colorScheme: light`. Screenshots: `.bobby/design/shots/ghstatus.png`,
`.bobby/design/shots/cfstatus.png`. **Extraction:** `extracted` = live computed styles / `:root`; `observed` = screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | Atlassian Statuspage (the hosted-status pattern), as used by GitHub Status and Cloudflare Status. |
| **Source** | <https://www.githubstatus.com/> · <https://www.cloudflarestatus.com/> |
| **What's good (the thinking)** | It is a **briefing, not a dashboard.** One **full-width banner** answers the only question that matters first — *"All Systems Operational"* (or a coloured "minor incident" banner) — so the state is legible before you read anything. Below, each component is a **row with a 90-day timeline bar** and its own status glyph; incidents are an **ordered sequence of update stages** (Investigating → Identified → Monitoring → Resolved) with **monospace timestamps**. Summary first, detail on demand. |
| **What we take** | The **one bold at-a-glance banner** as the "what needs me" lead; the **component-row + progress-bar** treatment for per-ticket stage progress; **mono timestamps**; the **ordered-update-stages** model for the gate history. |

## Extracted values

### Colour — `extracted`
- **Page canvas:** `#F6F8FA` (GitHub) / `#F7F7F8` (Cloudflare) — light, faintly cool. Surfaces / component cards `#FFFFFF`.
- **Ink:** `#24292E` (GitHub) / `#1D1F20` (Cloudflare). Muted `#6A737D` `extracted`.
- **Operational banner:** solid green `≈#28A745` (rgb 40 167 69), white text `observed/extracted`.
- **"Minor incident" banner (Cloudflare, `extracted`):** amber tonal — bg `#FEF7E0`, text `#7A5300`, radius `8px`. Same tint-bg + dark-text discipline as GitLab/GitHub.
- **Timeline bars:** dense vertical ticks, green = up, amber/red = degraded/down `observed`.

### Type — `extracted`
- **Faces:** `--font-stack-a: "Atlassian Sans"` for text; **`--font-stack-b: "Atlassian Mono"`** for timestamps/figures — mono is a *deliberate role*, not decoration.
- **Sizes:** page-status headline 32px / 500; section 28px / 500; timestamps 13–14px mono `extracted`. **Raise small text to floor for our build.**

### Surface & motion
- **Radii:** banner/cards `4–8px` `extracted`.
- **The banner is the only loud element**; component rows are quiet white cards with hairlines `observed`.
- No ambient motion; state is stated, not animated `observed`.

## The true feel
Reassurance by hierarchy. The giant green (or amber) bar means you can look away in half a second, or that
you can't — and *that* is the entire value. Everything under the banner is reference detail you only read
if the banner told you to. For the Feature view this is the "what needs me" register done right: **one
loud line about the whole feature, then quiet per-ticket rows.** `observed`.

## Inherited rules (if this anchors the direction)
1. Lead with **one full-width banner** stating the feature's whole state ("Review needed" / "All clear — building").
2. Colour of the banner = the state (green clear / amber tonal needs-you); everything below is quiet white rows.
3. **Mono for timestamps and figures** (Atlassian Mono → our mono stack).
4. Per-ticket progress = a **component-row bar**, ordered stages; gate history = an ordered update list.
5. Ground `#F6F8FA`/`#F7F7F8`, surfaces white, ink `#24292E`; small text raised to the 16px floor.
