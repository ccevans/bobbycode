# Reference Set — bobbycode homepage (round 2)

**Job:** design-research · **Selected by:** agent (user asked for new ideas)
**Method:** all four rendered with Playwright at 1440×900 and read, plus computed heading styles.

> Round 1 used rfeasley.io + useportal.net (see `teardown-useportal.md`). This round
> deliberately ranges **outside the minimal-website cluster** and outside dev-tool norms.

---

## The set

| Reference | Source | What's good — the *thinking* | What we take |
|---|---|---|---|
| **Stripe Press** | [press.stripe.com](https://press.stripe.com/) | The catalogue **is** the hero. Books are rendered as physical spines stacked in perspective — no headline, no pitch, just the objects. It trusts the work to sell itself. | The product's *parts* as tangible objects you can see all at once. |
| **Railway** | [railway.com](https://railway.com/) | A painterly illustrated night sky under a serif headline — infrastructure marketed as *calm* rather than powerful. "Ship software peacefully" is a feeling, not a feature. | Atmosphere as the emotional argument; serif on dark; product UI overlapping the fold. |
| **Are.na** | [are.na](https://www.are.na/) | **Refuses the marketing page entirely.** No hero, no headline, no CTA band — a numbered list in body text: *"Are.na is: 1. online software for… 2. a toolkit for…"*. The confidence is in not performing. | Permission to state plainly and skip the whole hero apparatus. |
| **Basecamp** | [basecamp.com](https://basecamp.com/) | Opinionated and text-forward, with real typographic investment — four licensed faces, OKLCH colour, a semantic ink ramp. Design as argument, not decoration. | A proper ink hierarchy; type doing the persuading. |

## Extracted at a glance

| | Ground | Display face | Shape |
|---|---|---|---|
| Stripe Press | `rgb(32,24,25)` warm black | Ivar Headline (serif) | Object stack, perspective |
| Railway | `rgb(19,17,28)` blue-black | IBM Plex Serif 54px | Illustrated sky + overlapping UI |
| Are.na | `#FFFFFF` | *no display face at all* | Narrow text column |
| Basecamp | `oklch(.9856 .0084 56.32)` warm off-white | Graphik 42px | Editorial, horizontal snap |

## Category norm

Dev-tool homepages split three ways: sterile minimal (Linear/Vercel), retro-terminal
(black + green), and AI-purple gradient. All three are defaults.

## How this will differ

Not one of these four is a dev-tool page. Three of them lead with something other than a
pitch — objects, atmosphere, or a plain list — and the fourth leads with typography.
For Bobby, whose product *is* six roles filled by one name, that opens a direction the
first round never reached: **show the crew as things, not as claims.**
