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

### Ranking performance gaps by page count (seed)
**Pattern:** Applying the accessibility priority rule — most pages affected wins — to the
performance pillar. Accessibility failures are template-uniform, so blast radius is right. But
a perf opportunity has a size, so a 3 KB unused-JS gap on 500 pages floated above a 700 KB
image on 9, and the report told people to fix the wrong thing first.
**Fix:** The runner captures each opportunity's savings (`overallSavingsBytes`/`Ms`, or a
byte-unit `numericValue`) and ranks perf proposals by a BLENDED impact, above the other
pillars. Bytes alone buried a 300 ms render-blocking gap behind a trivial one; ms alone would
bury a 133 KB image behind a 70 ms one. So each of bytes and ms is normalized against the
largest gap in the set and summed, so a gap leading on either axis ranks high. Shared-shell
perf savings are a max across templates, not a sum: a user pays the shell once.

### Proposing diagnostic audits as if they were fixes (seed)
**Pattern:** `mainthread-work-breakdown`, `largest-contentful-paint-element`, `dom-size` and
the Lighthouse 12 `*-insight` audits all carry `details.items`, so `items.length > 0` promoted
them to actionable gaps. But they DESCRIBE the page (work split by category, which element is
the LCP) or DUPLICATE a classic opportunity (`render-blocking-insight` restates
`render-blocking-resources`). They are also noisy: main-thread and DOM-size scored 1 on one run
and 0 on the next in the same sitting. Filing them is busywork, and the `-insight` duplicates
double-file the same fix.
**Fix:** `isDiagnostic` routes any `-insight` audit plus a small set of descriptive audits to
REPORTED, NOT PROPOSED. Fix the classic opportunity they point at, not the diagnostic. Keep
genuinely actionable audits that only look diagnostic (`lcp-lazy-loaded`, `bf-cache`) as gaps.

### Claiming a lab pass means real users pass CWV (seed)
**Pattern:** Reading "0 failing audits" off this lab runner and reporting that Core Web Vitals
are fine. PSI leads with CrUX **field** data; this tool only runs the Lighthouse lab pass. A
page can pass the lab and fail the field.
**Fix:** Keep lab and field claims separate. For "are real users failing CWV", read CrUX or
Search Console. This runner answers "what specific thing is wrong in the lab", not "what do
real users experience".

### Trusting one sampled URL for byte weight (seed)
**Pattern:** The runner samples one URL per template. For accessibility that is complete; for
byte weight it is not — one blog post ships a 450 KB hero and its neighbour ships none. A perf
ticket written off the default sample can miss the pages that actually carry the weight.
**Fix:** When a perf gap is about content weight, name the specific heavy URL and re-run with
`--page=<template>` against a known-heavy path, rather than trusting the first sitemap entry.

## Best Practices

### Report what you did not file
Stating "these timing-derived audits failed and I deliberately did not ticket them" is what
makes the tickets you did file credible.
