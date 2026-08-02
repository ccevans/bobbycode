# Bobby Lighthouse Audit: Learnings

Anti-patterns discovered during audit work. Check before starting.
Also read `learnings.local.md`: `bobby learn` writes there, and it is never overwritten.

## Anti-Patterns

### Ticketing a score instead of an audit (seed)
**Pattern:** Filing "mobile performance dropped to 88" as a bug. Performance scores are
noisy, so the ticket is unfalsifiable and the next run "fixes" it.
**Fix:** Propose only on audits that fail with one or more DOM nodes or resources. Quote the
audit id, node count, and a sample selector. No failing audit means no ticket.

### Re-filing what is already open (seed)
**Pattern:** Every run proposes the same gaps, so the report becomes noise and people stop
reading it.
**Fix:** The runner dedupes against `.bobby/tickets` by audit id plus template and prints an
ALREADY TICKETED section. Never file anything listed there. If a ticket exists but is stale,
update it rather than opening a second.

### Auditing only the homepage (seed)
**Pattern:** Optimizing the one page you already know about while a large section of the site
sits unmeasured.
**Fix:** Sweep templates and rank by live URL count from the sitemap. A 2-point gap on 500
pages beats a 10-point gap on the homepage. Auto-discovery routinely surfaces sections nobody
had a ticket for.

### Trusting a report that measured the wrong URL (seed)
**Pattern:** A hand-rolled sweep ran every Lighthouse pass against an empty URL and still
printed success, because the loop variable was never set.
**Fix:** The runner asserts `report.requestedUrl` matches the requested URL and hard-fails on
mismatch. Never hand-roll a sweep without that check.

### A dedupe that silently matches nothing (seed)
**Pattern:** The ticket directory could not be found, so zero tickets loaded and every gap
looked new. A dedupe that matches nothing is worse than none: it looks like it worked.
**Fix:** The runner walks up to find `.bobby/tickets`, warns loudly when it finds none, and
takes `--tickets=<dir>` for layouts where the project is a sibling rather than an ancestor.

## Best Practices

### Report what you did not file
Stating "these timing-derived audits failed and I deliberately did not ticket them" is what
makes the tickets you did file credible.
