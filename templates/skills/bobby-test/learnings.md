# Bobby Test — Learnings

This file accumulates anti-patterns and best practices discovered during QE testing.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-test "pattern" "description"` -->

## Falling back to running specs instead of live testing (2026-03-29)

The test agent's job is to verify through the live running application, not to run the test suite. The build agent writes specs (TDD) and the review agent runs them independently — running specs in the test stage is redundant. For non-UI features like background jobs, use CLI tools or equivalent to trigger the job and verify downstream effects (enqueued jobs, delivery records, database state). For API-only features, use `curl`. Never substitute spec runners for live app verification.

## Soft-passing ACs due to missing test data (2026-03-30)

The test agent said "AC PASS (conditional): No matching data in dev DB" instead of creating the test data needed to verify the full chain. "No data" is never a passing condition — it's the test agent's job to seed the required data (via API, CLI tools, admin UI) and run the full end-to-end. If you can't create the data (needs third-party tokens, prod-only infra), mark it BLOCKED with a specific reason. "No matching data" is not BLOCKED — it's a setup task.

## Only testing the happy path / AC checklist (2026-03-29)

Real QA pushes boundaries. If every AC passes on the first try with no edge cases explored, the testing was too shallow. Try empty inputs, double-submits, refresh-after-save, error states, boundary values, and unexpected state transitions. The goal is to find bugs, not to confirm the happy path works.

## Testing only the read path (2026-03-23)

Testers loaded pages and checked visual output but never clicked Save or changed a value. If an AC says "values update consistently," you must actually change a value and verify. Default values proving correct does not mean the feature works — it only means the defaults are correct.

## Best Practices
<!-- Document what works well -->

### Seed test data before testing, document what you created (2026-03-30)

Creating explicit test data (via API, CLI tools, or admin UI) and documenting it in results.md makes test results reproducible. Future testers can recreate the same conditions. Always note what was seeded and whether cleanup was done.

### Screenshot before AND after each action (2026-03-29)

Taking a baseline screenshot before interacting establishes what changed. Without a "before" shot, a "looks correct" screenshot proves nothing — you can't show what was different.

### Trace backend features all the way to the UI (2026-03-30)

When testing background jobs or API-only features, don't stop at "the job completed." Open the browser and verify the result is visible where a user would see it. This catches serialization bugs, cache staleness, and missing UI updates that the backend can't reveal.
