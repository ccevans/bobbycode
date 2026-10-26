> **SUPERSEDED for TKT-005 (Feature view).** The user asked for real, openable, live-renderable
> references instead of physical-artifact reconstructions. This teardown is retained for its
> thinking but is **not** part of the active reference set. Active set: `teardown-gitlab-pipelines.md`,
> `teardown-github-actions.md`, `teardown-statuspage.md`, `teardown-plausible-live.md`.

# Teardown — Apollo Mission Operations Control Room (MOCR)

**Reference type:** physical/historical specimen. Rendered from an Apollo 11 photograph and
cross-checked against NASA and operational-history sources. `observed` = from the photo; `cited` = documented.

## The four citation fields

| Field | |
|---|---|
| **Name** | The **Mission Operations Control Room (MOCR / "Mission Control")**, Christopher C. Kraft Jr. Mission Control Center, Houston — Apollo era. |
| **Source** | Specimen image: `Mission_Operations_Control_Room_at_the_conclusion_of_Apollo_11.jpg` (Wikimedia). History: [NASA – Apollo Mission Control Restoration](https://www.nasa.gov/johnson/history/apollo-mcc-restoration/) · [How the Big Boards Worked](https://apollo11space.com/how-mission-controls-big-displays-worked-a-look-at-nasas-big-boards/index.html) · [NASA flight-control positions](https://en.wikipedia.org/wiki/List_of_NASA%27s_flight_control_positions). |
| **What's good (the thinking)** | The room is built around **one decision made by one person on the advice of many.** Rows of consoles each own a slice of telemetry; a shared **"big board"** at the front holds the state everyone references — mission time, trajectory, event status — so no single console has to carry it. And progress is gated by the **GO / NO-GO poll**: before the mission advances, the Flight Director polls each station, each answers GO or NO-GO, and *nothing proceeds without the call*. The human is not a spectator to automation — the human is the gate. |
| **What we take** | The **big-board summary** (the feature's mission state, read first), the **console-per-ticket** grid where each child ticket owns a compact readout with a status light, and — the signature — the **GO / NO-GO gate**: the one primary action reframed as the flight-director's call. |

## Extracted values

### Colour
- **Room:** dark, but this is a *lighting* choice for CRT legibility in 1969, **not** a palette we inherit. The consoles themselves are **light institutional grey-green metal** `observed ≈ #8C9A94 / #B7BEB8` — that is the surface we translate to a light theme.
- **Status lights / event indicators:** small, saturated, few — amber, green, red event lamps on the boards and console edges `observed`. Colour = state, and it is *tiny and sparse* against the neutral metal.
- **Big board:** dark field with mission graphics and numeric event-status columns top-left `observed`.

### Type
- **Readouts:** fixed-width numeric event/telemetry counters — monospace, aligned columns `observed/cited`.
- **Labels:** engraved console nomenclature, plain grotesque, functional `estimated`.

### Shape / layout
- **Composition:** **big board across the front** (shared summary), then **tiered rows of identical console stations** angled toward it `observed`. Every station is the same module; identity comes from *what it's monitoring*, not from decoration.
- **Console module:** a small CRT + a bank of labelled buttons/lamps + a work surface `observed`. This is the template for a per-ticket "console card": compact readout, current stage, last event, one status lamp.
- **The gate is procedural, not visual chrome:** GO/NO-GO is an *event*, a poll that opens and closes — the design cue is "the room is holding for a call."

### Motion
- Event counters tick; status lamps change discretely. No decorative motion whatsoever — every change is data `observed`.

## The true feel
Calm competence under load. The room is dense with instruments yet feels *orderly*, because the
hierarchy is absolute: big board = shared truth, consoles = owned detail, Flight Director = the
decision. For the Feature view: **the solo dev is the Flight Director. The agents run the consoles.
The screen exists so that when a gate opens, the call is obvious and one click makes it.**

## Inherited rules (hard constraints if this direction is chosen)
1. A **big-board summary** of the whole feature is read first, top of screen (Briefing register).
2. Child tickets are **identical console modules** — same shape, differentiated only by their live data.
3. The primary action is the **GO / NO-GO gate**: Approve / Send back, framed as the director's call.
4. Colour = state only: **small, saturated, sparse** status lamps on an otherwise light institutional-neutral ground. No purple.
5. Translate the room to **light** — grey-green/paper console metal, not the 1969 dark room. Dark was a CRT constraint, not the design.
