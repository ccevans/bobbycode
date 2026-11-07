# Teardown — gumroad.com

**Method:** Playwright render at 1440×900 + computed-style extraction · **Confidence:** high

## The true feel

**Loud, flat, and completely unafraid.** A cream sheet with hot-pink coins tumbling across
it and a 96px headline in the middle. There is not a single shadow on the page — depth is
refused outright, so everything sits on one plane and the only hierarchy is *size* and
*contrast*. It reads like a poster, not an interface. The confidence comes from how much
is left out: no gradients, no elevation, no ornament, one typeface doing all the work.

## Layout

| | |
|---|---|
| **Container** | `1152px` outer · `896px` · `768px` · `672px` text |
| **Grid** | `544px 544px` — equal halves, no dominant column |
| **Structure** | Centred hero, scattered decorative objects, then hard-bordered content cards |
| **Anchor** | Big flat vector coins (~968×1214) scattered *behind and around* the type |

## Colour — 4 values, no gradients

| Value | Role |
|---|---|
| `#F4F4F0` | Cream ground |
| `#FFFFFF` | Card surface |
| `rgb(255,201,0)` | Yellow accent |
| `#000000` | Ink, borders, filled buttons |

Plus the hot-pink object fill. **No gradient anywhere.**

## Type — one face, no exceptions

**`ABC Favorit`** only. 14 / 16 / 18 / 20 / 24 / 36px body-and-UI, **96px** display.
Weights 400 / 500 / 700. No serif, no mono, no second family.

## Surface

- **`box-shadow`: none. Zero. On the entire page.** This is the defining decision.
- Radius: **full pill** (the `3.3e7px` idiom, 129 uses) for buttons and tags · `4px` · `16px` · `24px`
- One asymmetric radius — `24px 24px 24px 4px`, a speech-bubble corner
- Hard `1px` black borders instead of elevation

## Motion

`0.15s cubic-bezier(.4,0,.2,1)` — snappy and short. A `0.2s` transform variant. Nothing ambient.

## Inherited rules

1. **No shadows at all.** Borders and contrast do the work.
2. One typeface, no exceptions.
3. Display type genuinely huge (96px) against small body (16–18px).
4. Four colours, no gradients.
5. Full-pill or hard-square — with one asymmetric corner as a signature.
6. Motion is 150ms and functional.
