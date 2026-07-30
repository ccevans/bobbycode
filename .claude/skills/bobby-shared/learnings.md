# Bobby Shared — Cross-Agent Learnings

All Bobby agents load this file in addition to their own learnings.md.

---

## PROBLEM — Recurring Bugs & Gotchas

### vacuous-truth-all-empty-array
**`[].all?` / `[].every()` vacuous truth**: `collection.all? { ... }` (Ruby) and `collection.every(...)` (JS) return `true` on an empty collection — when emptiness should fail a validation check, guard with `collection.any? && collection.all? { ... }` (Ruby) or `collection.length > 0 && collection.every(...)` (JS). Always add a test for the empty-collection case; it won't be covered by "all valid" or "some invalid" examples alone.

### n-plus-one-per-item-method
**N+1 in per-item methods**: When a method is called once per item in a collection, any DB/API call inside it is an N+1. Before adding a new query inside a loop, look for existing memoized caches that already hold the data — reading from a cache costs zero extra calls. Flag any loop-internal fetches in review even when not currently broken.

### silent-rescue-no-logging
**Silent rescue blocks**: A rescue/catch that returns a default without logging makes production failures invisible. Always log the error: `Rails.logger.warn("Failed to ...: #{e.message}")` (Ruby), `console.error('Failed to ...', e)` (JS). Bare `rescue` (Ruby) catches the same exceptions but signals carelessness — be explicit with `rescue StandardError => e`.

### no-io-inside-transactions
**HTTP inside DB transaction**: Any network call (external API, HTTP client) inside a database transaction holds DB locks for the full round-trip duration. Under load this cascades into lock contention. Fix: extract the call to a local variable before the transaction block.

### identity-field-leak-cross-resource
**Identity field leak when copying records between resources**: Using records from resource A as seed data for resource B causes the edit payload to contain IDs from the wrong resource. Normalize first: strip `id`, `_destroy`, and other identity/persisted fields before using as selectable options or form state.

### ui-only-field-in-api-payload
**UI-only fields leaking into API payloads**: Client-only flags (`_isHighlighted`, `_notInList`, etc.) added to objects that are later spread into request bodies cause API 422/unknown-attribute errors. Two mitigations: (a) only set the flag when meaningful, (b) destructure/strip before building the request payload. Audit every `...obj` spread that flows into an API request.

### hardcoded-literal-not-data-derived
**Hardcoded literal instead of data-derived value**: Passing hardcoded `false` or `true` where the value should be computed from available context causes wrong behavior in edge cases. Always derive from data — if the data isn't in scope, pass it down from the parent that has it.

### blocked-ui-no-explanation
**Blocked UI without user explanation**: A permanently disabled button with no error message is a silent failure. Any blocked/disabled state that can persist due to an async error must be accompanied by a visible explanation and ideally a retry option.

### error-state-treated-as-safe
**Error state treated as safe**: `!data && !isLoading` (or similar) means the fetch has failed — not that it's safe to proceed. When validation depends on remote data, treat error/failure state as a hard block, not a pass-through. Block the action and surface an error instead of silently skipping validation.

### visual-indicator-no-a11y
**Visual indicator without accessible label**: Non-text indicators (icons, color coding, asterisks) are invisible to screen readers. Any non-interactive element used as a status indicator must include `aria-label` or `title` describing what it means.

### unnecessary-query-no-skip
**Unnecessary query when data isn't used**: If a query's result is only consumed by a feature that's hidden or inactive, add a `skip` condition matching the actual usage gate. Fetching data unnecessarily degrades performance and wastes network budget.

### arel-sql-not-join-safe
**(Rails) Unqualified column names in raw SQL**: `Arel.sql("col DESC")` is injection-safe but unqualified. When the scope is chained on a joined relation, Postgres raises `column reference is ambiguous`. Prefer `arel_table[:col].desc` which emits fully-qualified SQL and is join-safe.

### unscoped-find-by-in-integration-spec
**(Rails) Unscoped `find_by` in integration specs**: `find_by(field: value)` without scoping to the created record's ID is order-dependent — if another test left a matching record in the DB, the assertion targets the wrong one. Always scope by the created ID. Grep for bare `find_by` calls in integration specs using non-unique field criteria.

### ruby-local-method-name-shadow
**(Ruby) `x = x` local variable shadowing**: Assigning a method result to a same-named local (`suffix = suffix`) silently returns nil — Ruby defines the local as soon as `=` is parsed, so the RHS resolves to the (nil) local, not the method. Use a different local name.

### rtk-query-skip-exhaustiveness
**(RTK Query) Skip exhaustiveness gap**: When multiple queries have `skip` conditions, verify that every valid component state has at least one active query — gaps leave the UI with empty data and no error shown. Use `skipToken` instead of `!` non-null assertions for conditional query args.

### unused-prop-in-interface
**(TypeScript) Unused prop in component interface**: A prop declared in the interface, destructured in the function signature, and referenced only in a comment is dead code. Verify every destructured prop is actually used in the JSX or logic, not just in the type definition.

---

## PATTERN — Proven Approaches

### eager-load-gap
**Eager-load gap (future optimization risk)**: A fetch or association access outside the current eager-load scope is a lazy load — fine at low volume but becomes a hot-path issue as usage grows. Flag it in review even when not currently broken: note which eager-load call it should be added to and why it wasn't.

<!-- bobby learn bobby-shared adds entries below this line -->
