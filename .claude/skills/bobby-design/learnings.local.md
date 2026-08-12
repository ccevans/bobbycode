# Design — This Project's Learnings

**This file is yours.** Bobby seeds it once and never writes it again — not on
re-scaffold, not on upgrade. `bobby learn bobby-design "pattern" "description"` adds here.

Shipped anti-patterns live in `learnings.md` and are refreshed on upgrade.
Anything you write there will be lost; write it here instead. Where the two
disagree, **this file wins**.

## Anti-Patterns
<!-- bobby learn bobby-design "pattern" "description" to add entries -->

- **tap targets measured without their hit-area overlay**: getBoundingClientRect() returns the PAINTED box, not the touch target. A 28px control with a `::after { position:absolute; inset:-8px }` overlay is a 44px target and passes; measuring the element alone reports it as a failure. Before filing a tap-target finding, look for a pseudo-element expander on the element and measure that. TKT-060 was filed against a control fixed the day before.
