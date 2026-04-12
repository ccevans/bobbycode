# Bobby Local — Learnings

This file accumulates anti-patterns and best practices discovered during local environment setup. Check this file before running any setup action.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-local "pattern" "description"` -->

### Destroying database volumes without confirmation (seed)
**Pattern:** Running `docker compose down -v` or destructive database reset commands without asking the user first, wiping all local data.
**Fix:** Always confirm destructive database operations with the user. Use safe, idempotent setup commands (e.g., `rails db:prepare`, `prisma migrate deploy`) instead of destructive resets.

### Skipping health checks after setup (seed)
**Pattern:** Declaring setup complete without verifying services are actually running and responding.
**Fix:** Always run health checks after any setup action and report the results.

## Best Practices
<!-- Document what works well -->
