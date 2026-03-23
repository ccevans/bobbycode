# Bobby Test — Learnings

This file accumulates anti-patterns and best practices discovered during QE testing.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-test "pattern" "description"` -->

## Testing only the read path (2026-03-23)

In TKT-139–143, testers loaded pages and checked CSS tokens but never clicked Save or changed a color. If an AC says "colors update consistently," you must actually change a color and verify. Default values proving correct does not mean the feature works — it only means the defaults are correct.

## Best Practices
<!-- Document what works well -->
