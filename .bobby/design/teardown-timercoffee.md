# Teardown — Timer.Coffee (guided pour-over brew timeline)

- **Name:** Timer.Coffee — open-source coffee timer / guided brew (web + apps)
- **Source URL:** <https://www.timer.coffee/> (marketing, with in-mockup app screens) · web app <https://app.timer.coffee/>
- **Rendered:** 2026-08-02, 1440×900, `colorScheme: light`, Playwright. Screenshots: `shots/timercoffee.png` (marketing + app mockups), `shots/timercoffee-app.png` (web app method picker).

## What's good — the *thinking*
A brew recipe is a **timed sequence of named steps** — bloom → pour → wait → swirl → drawdown — and
the app renders it as a **guided run, not a checklist**. The in-app screen (visible in the marketing
mockup) shows the whole vocabulary we need, in a craft/kitchen register:
- a **"Step 1/8"** counter — *which stage of how many*,
- a **big circular countdown ring** ("5/10 s") filling for the **current** step only,
- one **plain-language instruction** for right now ("Pre-wet with 60.0g water"),
- a **"Next:" peek** at the upcoming step ("Swirl brewer until the slurry…").

That is exactly the Feature view's problem re-cast as *making coffee*: one stage is live and gets the
big timer; the rest are context; there's always a "now" and a "next." It reads as warm and human, the
opposite of a CI graph — a solo builder tending a pour, not monitoring a control room. The method
picker ("What do you brew with?" → Hario V60 / Aeropress, drawn line icons) is calm, white, unhurried.

## What we take
The **"one live step gets a big countdown ring, everything else is now/next context"** pattern, and the
**Step N/M** counter as the honest progress read. Re-cast for us: the running stage (build/review/…)
gets the ring + the plain-language line ("Claude is reviewing 3 of 4 tickets"); the gate is the ring
completing → "taste / serve" (Approve / Merge). We take the *pattern and the warm making-voice* — **not**
the marketing page's typography (it's set in **Inter**, a slop face — dropped).

## Extraction confidence
- **App pattern (step counter, ring, now/next, method icons):** `observed` (from the in-mockup app screen; the web app root is a method picker, brew screen is behind a recipe selection).
- **Marketing tokens:** `extracted` but **mostly rejected** (Inter).

## Exact tokens
| Token | Value | Confidence |
|---|---|---|
| Marketing ground | `#FFFFFF` (top band `#F3F3F5`) | extracted |
| Marketing display | **Inter**, H1 64px / 700, black `#000` (**rejected — slop face**) | extracted (computed) |
| App screen ground | white | observed |
| Step counter | "Step 1/8" — small, top of screen | observed |
| Countdown ring | large circular progress, **orange** stroke ≈ `#E8863C` on grey track, "5/10 s" centred | observed |
| Current instruction | one plain sentence, dark ink | observed |
| "Next:" peek | muted, single upcoming line at the bottom | observed |
| Method icons | thin monoline drawings (V60, Aeropress, Chemex…) | observed |
| Brew-method card | white, hairline border, icon-over-label | observed |

## The signature move
**One big countdown ring for the step you're on, a "Step N/M" counter, a plain-language "now", and a
quiet "Next:" peek** — progress as *tending one live step of a recipe*, in a warm kitchen voice.
