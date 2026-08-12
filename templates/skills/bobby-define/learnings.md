# Learnings — bobby-define

Shipped anti-patterns and best practices for product definition. Project-specific
learnings go in `learnings.local.md` (never overwritten on upgrade).

## Anti-Patterns

- **Features brainstormed instead of derived** — a feature that serves no journey
  step is decoration. Send it back to the journey or out of the map.
- **Personas with no proxy silently treated as facts** — mark them
  `Proxy: none — assumption` and say so at the gate.
- **A success metric that can't fail** ("users are happier") — one observable
  number or event, or it isn't a metric.
- **Skipping the gate because the founder seems busy** — the express path exists
  for that ("just draft it"); silently self-approving does not.

## Best Practices

- Quote the idea verbatim from the epic — paraphrase drifts toward what you'd
  rather build.
- The Non-goals written in Step 1 do their real work in Step 4: every Never row
  cites one.
- The drop-off column in journeys is where honest product thinking lives — if
  every step says "low risk", the journey hasn't been thought about.
