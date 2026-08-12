# Review — This Project's Learnings

**This file is yours.** Bobby seeds it once and never writes it again — not on
re-scaffold, not on upgrade. `bobby learn bobby-review "pattern" "description"` adds here.

Shipped anti-patterns live in `learnings.md` and are refreshed on upgrade.
Anything you write there will be lost; write it here instead. Where the two
disagree, **this file wins**.

## Anti-Patterns
<!-- bobby learn bobby-review "pattern" "description" to add entries -->

- **await-transition-not-state**: Async tests that trigger a disconnect/restart and then wait for recovery with until(condition) are vacuous when the condition is ALREADY true at trigger time (the close/restart event has not dispatched yet) — the wait returns instantly, and a fixed sleep then races the real reconnect backoff, producing a test that fails on correct code or passes on broken code depending on jitter. Review rule: every wait-for-recovery must first await the DEPARTURE state (until(!online)) before awaiting the return (until(online)); flag any fixed-ms sleep that races a jittered/backoff timer; and check the failure path frees its servers/sockets (try/finally or --test-force-exit) — a hanging runner disguises the flake as a timeout. Verify red/green claims by running the committed test yourself on both sides of the fix; a claim of 'verified to fail' can be true for the wrong reason.

- **resubscribe-keyed-to-wrong-lifecycle**: When a transport/connection layer restores subscriptions on ITS OWN socket's onopen, check whose lifecycle the subscription state actually lives in. Server-side subscription state dies with the SERVER (host restart, upstream stream end) without the client socket ever closing — so onopen-only resubscribe leaves streams silently dead while presence shows online. Review checklist: for every resubscribe/replay path, enumerate the ways the far side can lose state while the near-side socket stays up, and check each one triggers recovery. Also grep for protocol frame types the sender emits (e.g. t:'end') that the receiver never handles — silently dropped control frames are how these gaps hide.
