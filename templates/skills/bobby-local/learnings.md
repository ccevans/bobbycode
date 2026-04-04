# Bobby Local — Learnings

This file accumulates anti-patterns and best practices discovered during local environment setup. Check this file before running any setup action.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-local "pattern" "description"` -->

### Destroying database volumes without confirmation (seed)
**Pattern:** Running `docker compose down -v` or `rails db:reset` without asking the user first, wiping billing plans and tenant data.
**Fix:** Always confirm destructive database operations with the user. Use `rails db:prepare` (idempotent) instead of `db:reset`.

### Skipping health checks after setup (seed)
**Pattern:** Declaring setup complete without verifying services are actually running and responding.
**Fix:** Always run health checks after any setup action and report the results.

## Best Practices
<!-- Document what works well -->
