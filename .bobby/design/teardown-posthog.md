# Teardown — posthog.com

**Method:** Playwright render at 1440×900 + computed-style extraction · **Confidence:** high

## The true feel

**The website is an operating system.** An illustrated hillside is the desktop wallpaper,
icons run down *both* edges like a Finder sidebar, and the actual page content lives inside
a draggable window with minimise and close buttons. Key phrases are marker-penned. A
hedgehog sits in the shrubbery. It is the most committed metaphor on the web — and it works
because the whole chrome is in on it, not just a motif bolted to a normal page.

## Layout

| | |
|---|---|
| **Container** | `1780px` outer · `1024px` content · `448px` text |
| **Icon rails** | `112px` columns (26 uses) — desktop icons down both left and right |
| **Grid** | Equal halves (`473px 473px`, `489px 489px`) and `50px 200px 200px 200px` |
| **Anchor** | The window itself, holding a large product shot (~1555×1262) |

## Colour

| Value | Role |
|---|---|
| `#EEEFE9` | Warm off-white — the "wallpaper" ground |
| `rgba(229,231,224, .75 / .4 / .2)` | **Translucent frosted panels**, three depths |
| `rgb(245,78,0)` | Orange accent (active tabs, CTAs) |
| `#FDFDF8` / `#FFFFFF` | Window surfaces |
| `#000000` | Ink |

The translucency is the elevation system — layered glass over an illustrated backdrop
rather than shadows.

## Type — one face, deliberately small

**`RoundHog`** only. 14 / 15 / 16 / 18px UI and body, `30px` h2. Weights 500 / 600 / 700.
A rounded custom grotesque; the friendliness is in the letterforms, not in ornament.

## Surface

- Shadows effectively **none** (transparent stacks only)
- Radius: `2px` · `4px` · `6px` — **tiny**, because it is imitating OS chrome
- `6px 6px 0 0` — tab tops
- `40%` and `9999px` — circular icon badges
- Marker-pen highlight behind key phrases

## Motion

`opacity 0.7s cubic-bezier(0,0,.2,1)` — slow, soft fades · `transform 0.2s` for interaction.
Fast on input, slow on ambience.

## Inherited rules

1. **Commit the metaphor completely** — chrome, navigation and content all obey it.
2. Translucent layered panels instead of shadows.
3. One rounded typeface at small sizes; friendliness from letterforms.
4. Tiny radii (2–6px) for anything imitating an interface.
5. Illustrated background, functional foreground.
6. Marker-pen emphasis instead of bold or colour.
