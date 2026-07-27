# Style Directory

A catalogue of **studied** design systems — each one rendered, examined and cited. Use it to
give a user real options instead of inventing directions from taste.

---

## What this is for, and what it is NOT

**It is for:** the case where the user supplies no references. Instead of picking from your own
taste — which produces the AI default — you pick from a documented, cited library and show them
the range.

**It is NOT a menu of vibes.** Three hard rules:

1. **Never build from this file alone.** An entry is a *lead*, not a teardown. Once the user
   picks a direction, go and run the real teardown against the live site
   (`reference_teardown.md`). Sites change; the entry may be stale.
2. **The user's own references always outrank the directory.** If they name sites, those are
   the set — the directory is not a reason to add to it.
3. **Confidence is recorded per entry.** "Fully extracted" means computed styles were pulled;
   "observed" means it was rendered and read but not fully extracted. Do not present an
   observed entry as if its values are verified.

**Adding an entry:** render it, read it, record the same fields. No entry from memory.

---

## Quick index by register

| Want… | Look at |
|---|---|
| Quiet, editorial, confident | rfeasley · Are.na · Basecamp |
| Warm, illustrated, human | Portal · Fly.io · Railway |
| Loud, flat, unafraid | Gumroad |
| A committed metaphor | PostHog |
| Objects as the hero | Stripe Press |
| Dense operator UI | Plausible · Grafana · Linear · Raycast |

---

## 1 · Fixed Stage — *rfeasley.io*
**Confidence:** fully extracted · **Register:** portfolio, quiet, severe

> One device on an empty field, name in the far margin, copy in the other. The confidence is in
> how little is present.

- **Ground** `#F5F4F1` warm off-white · **5 colours total**, no accent, no gradient
- **Type** Geist Sans only — *no monospace anywhere*
- **Layout** `268 / 739 / 336` — name left, device centre, **content right**
- **Motion** copy cross-fades `500ms` while rising `12px`; pagination dashes stretch `6→20px`
- **Structure** desktop does **not scroll**; mobile is a separate scroll-snap DOM tree
- **Best for** portfolios, single-product pages where the work speaks
- **Watch** the empty space is the design; filling it destroys it

## 2 · Illustrated Atmosphere — *useportal.net*
**Confidence:** fully extracted · **Register:** warm, dreamy, consumer-friendly

> A dusk sky with flickering stars and a small robot. The atmosphere does the emotional work;
> the layout underneath is calm.

- **Ground** full-bleed gradient — blue → periwinkle → pink → orange; body calms to near-white
- **Type** `Perfectly Nineties` serif display (48/36px) + Inter body
- **Motion** ambient star flicker; colour transitions `400ms cubic-bezier(.44,0,.56,1)`
- **Signature** product screenshot **overlapping the hero's bottom edge**
- **Best for** products that need to feel human rather than technical
- **Watch** two zones — saturated hero, quiet body. Do not carry the gradient everywhere

## 3 · Flat & Loud — *gumroad.com*
**Confidence:** fully extracted · **Register:** bold, poster-like, unafraid

> Depth refused outright. Everything on one plane; the only hierarchy is size and contrast.

- **Ground** `#F4F4F0` cream · white surfaces · yellow `rgb(255,201,0)` · hot pink · black
- **Type** `ABC Favorit` only — **96px** display against 16–18px body
- **Shadow** **none, anywhere.** Hard 1–2px black borders do all elevation
- **Radius** full-pill, plus `24px 24px 24px 4px` speech-bubble corner as a signature
- **Motion** `0.15s cubic-bezier(.4,0,.2,1)` — snappy, functional
- **Best for** a product with one big claim; anything that should feel confident, not corporate
- **Watch** no shadows means *no* shadows — one soft drop shadow breaks the whole system

## 4 · The Metaphor — *posthog.com*
**Confidence:** fully extracted · **Register:** playful, committed, idiosyncratic

> The website is an operating system. Wallpaper, desktop icons, content inside a draggable
> window. It works because the entire chrome is in on it.

- **Ground** `#EEEFE9` wallpaper · translucent panels at `.75/.4/.2` instead of shadows
- **Accent** `rgb(245,78,0)` orange · **Type** `RoundHog` only, deliberately small (14–18px)
- **Radius** `2/4/6px` — tiny, because it imitates OS chrome · tab tops `6px 6px 0 0`
- **Signature** marker-pen highlight behind key phrases
- **Best for** products with a strong personality that can carry a conceit end to end
- **Watch** staging is everything — a window on a full-bleed page is still a page. And every
  in-world control must *behave* in-world. See `reference_teardown.md` §8c

## 5 · Objects as Hero — *press.stripe.com*
**Confidence:** observed · **Register:** editorial, cinematic, catalogue

> The catalogue *is* the hero — books rendered as physical spines stacked in perspective. No
> headline, no pitch. It trusts the work to sell itself.

- **Ground** `rgb(32,24,25)` deep warm black · **Type** `Ivar Headline` serif
- **Signature** a stack of tangible objects, receding, each with its own colour and typography
- **Best for** anything with a *set* of things — a catalogue, a roster, a body of work
- **Watch** needs genuinely good object art; assembled shapes read as clip art

## 6 · Painterly Calm — *railway.com*
**Confidence:** observed · **Register:** technical product sold as calm

> Infrastructure marketed as peaceful. "Ship software peacefully" is a feeling, not a feature.

- **Ground** `rgb(19,17,28)` blue-black with painterly illustrated night sky
- **Type** `IBM Plex Serif` at 54px over the illustration
- **Signature** large product UI overlapping the fold
- **Best for** technical products whose pitch is *relief* rather than power

## 7 · Anti-Marketing — *are.na*
**Confidence:** observed · **Register:** plain, confident, contrarian

> Refuses the marketing page entirely. No hero, no headline — a numbered list in body text:
> *"Are.na is: 1. … 2. …"*. The confidence is in not performing.

- **Ground** `#FFFFFF` · narrow text column · essentially no display face
- **Best for** audiences allergic to marketing; tools whose users value substance
- **Watch** only works if the writing is genuinely good — there is nothing else to hide behind

## 8 · Typographic Argument — *basecamp.com*
**Confidence:** partially extracted (tokens yes, layout no) · **Register:** opinionated, text-forward

- **Colour** OKLCH throughout, with a semantic ink ramp `ink-1…ink-5` + hover variants
- **Type** four licensed faces — Graphik, Berkeley Mono, Monaspace, Sharpie
- **Radius** `0.75em` — em-based, so it scales with type size
- **Motion** `0.15s` / `0.3s` · horizontal `scroll-snap` for carousels
- **Best for** products whose argument is the content; strong-opinion brands

## 9 · Hand-Painted Whimsy — *fly.io*
**Confidence:** observed · **Register:** warm, crafted, characterful

- **Type** `Mackinac` serif at **120px**, left-aligned
- **Ground** pale watercolour wash — pink/blue ribbons
- **Signature** properly *illustrated* flying computers with beaks and wings
- **Best for** infrastructure or dev tools that want to feel human
- **Watch** requires real illustration. Do not attempt with assembled SVG primitives

---

## Dense operator UI

## 10 · Data Briefing — *plausible.io*
**Confidence:** fully extracted (live demo) · **Register:** analytics dashboard

> Answers the question before you ask it. Summary first, detail below, liveness as a fact.

- **Signature** stat-tile row with deltas · `● 44 current visitors` in the header ·
  **inline magnitude bars inside list rows** · tabbed triage panels
- **Best for** anything with a "what happened while I was away" shape
- **Watch** measure that the bars actually render — see `craft_principles.md` Part 6c

## 11 · App Shell — *play.grafana.org*
**Confidence:** observed · **Register:** operator console

- Collapsible sectioned nav · breadcrumb · ⌘K search · resizable panel grid
- **Ground** `rgb(17,18,23)` · **Best for** multi-view tools that need real navigation

## 12 · Dense & Calm — *linear.app*
**Confidence:** observed · **Register:** product UI, keyboard-first

- ~97 interactive controls on one screen that still feels calm — tiny type, tight rows,
  almost no borders
- **Best for** list-heavy tools · **Watch** density without hierarchy is just noise

## 13 · Local & Native — *raycast.com*
**Confidence:** observed · **Register:** local-first utility

- `rgb(7,8,10)` near-black, keyboard-first, unmistakably an app on a machine
- **Best for** anything that runs on the user's own computer and should say so
