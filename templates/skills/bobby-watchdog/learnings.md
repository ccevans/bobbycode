# Bobby Watchdog — Learnings

This file accumulates anti-patterns and best practices discovered during post-deploy verification. Check this file before starting work.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-watchdog "pattern" "description"` -->

### Testing only the happy path (seed)
**Pattern:** Watchdog only verifies that the main page loads without checking critical user flows, API endpoints, or error states.
**Fix:** Smoke test the core user journeys — auth, primary CRUD operations, and key API responses — not just the homepage.

## Best Practices
<!-- Document what works well -->

