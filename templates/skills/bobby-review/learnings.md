# Bobby Review — Learnings

This file accumulates anti-patterns and best practices discovered during peer reviews.

## Anti-Patterns
<!-- New learnings are added below this line by `bobby learn bobby-review "pattern" "description"` -->

### Reviewing the wrong diff (seed)
**Pattern:** Using `git diff` (working tree vs HEAD) instead of `git diff main...HEAD` (full branch diff). Since the build agent commits everything, `git diff` returns nothing — so the reviewer thinks nothing changed and rubber-stamps.
**Fix:** Always use `git diff main...HEAD` for the branch diff and `git log --oneline main..HEAD` for the commit list.

### Rubber-stamp approval (seed)
**Pattern:** Approving after only reading the diff hunks without reading the full files around the changes. Misses broken callers, incompatible interfaces, and context that makes the change incorrect.
**Fix:** For every changed file, read the full file — not just the diff. Understand the context before judging the change.

### Skipping caller verification (seed)
**Pattern:** A function signature or return type changes but the reviewer doesn't check whether existing callers still work. Breaks surface later as runtime errors.
**Fix:** For every modified function/component/API, grep for its callers and verify they're compatible with the new behavior.

### Approving without running tests (seed)
**Pattern:** Review agent approves code based on reading the diff alone, without actually running the test suite.
**Fix:** Always run tests and lint. Show the output. If tests can't run, mark the review as BLOCKED.

### Vague rejections (seed)
**Pattern:** Rejection comments like "code doesn't work" or "needs fixes" that give the build agent nothing actionable.
**Fix:** Every rejection must specify: which AC failed, what the expected behavior was, what actually happened, and where in the code to look.

### boolean-flag-from-optional-id
**Deriving boolean flags from optional IDs**: `isSpecial = !!itemId` is `false` when `itemId` is `undefined`, which is also the case for new (unsaved) items — conflating the two cases causes wrong behavior. Pass an explicit boolean prop so the component doesn't need to infer intent from ID presence.

### rtk-query-isfetching-gap
**(RTK Query) isFetching gap**: When a UI action depends on multiple queries, every query's `isFetching` must be ORed into the disabled/loading state. Missing one means the action runs before data arrives, silently skipping validation that depends on the unloaded data.

### cell-renderer-on2-lookup
**O(n²) per-render lookup in list/table renderers**: `array.some(x => x.id === row.id)` inside a cell renderer runs for every row on every render. Precompute a `Set` of matching IDs via `useMemo` outside the renderer and check `set.has(id)` per cell — O(1) instead of O(n).

### stale-usememo-closure
**(React) Stale `useMemo`/`useCallback` closures**: Variables captured inside `useMemo`/`useCallback` but missing from the dependency array produce stale UI. Audit every variable in the callback body against the dep array — state, props, refs, and context all count.

### transformation-field-loss
**Field loss in transformation functions**: When data passes through a mapping/nesting function, extra fields on the input are silently dropped unless explicitly carried. Downstream consumers that rely on dropped fields never receive the data. Always trace what fields a transformation preserves vs drops.

### modal-state-not-reset-on-close
**State not reset on modal/dialog close**: State set during an open flow must be reset in the close handler. Skipping the reset means the next open inherits stale values and shows wrong behavior. Check every modal's close handler for state that was set on open.

### typescript-type-gap-runtime-prop
**(TypeScript) Type gaps on runtime properties**: Accessing a property that doesn't exist in the declared type causes silent `any` casts or type errors. Update the type definition first, then access the property — never cast to work around a missing type.

### unused-component-props
**Unused props in component interfaces**: A prop added to the interface and destructured but never referenced in the component body is dead code and signals incomplete implementation. Grep for the prop name — if it only appears in the interface definition and destructuring, flag it.

### null-unsafe-set-construction
**Null-unsafe `new Set()` construction**: `new Set(array.map(x => x.id))` where `id` can be `null` or `undefined` silently includes those values in the set. Filter before constructing: `new Set(array.map(x => x.id).filter(id => id != null))`.

### validation-async-error-bypass
**Validation bypass on async error state**: Checking only `isLoading` is insufficient — if a query errors, `isLoading` becomes false and `data` is undefined, silently treating all items as valid. Always check error state explicitly and block the action with a user-visible error message.

### rtk-query-skip-gated-data
**(RTK Query) Query fired for conditionally-gated data**: If a query's data is only consumed behind a feature gate, add a `skip` condition — otherwise the query fires for every instance even when the data is unused.

### accessibility-color-only-indicator
**Color-only indicators missing aria-label**: A span or icon that communicates meaning solely through color is inaccessible to screen readers. Add `aria-label` (or `title`) to any non-interactive indicator that conveys information — asterisks, badges, colored dots, etc.

### i18n-key-sort-order
**Translation keys added out of alphabetical order**: All locale files must be kept alphabetically sorted by key. Inserting a key without sorting causes drift. Add keys to ALL locale files simultaneously.

### product-data-cache-test-gap
**Split-query test coverage gap**: When a method is split into two queries (one cached, one per-item), check that both query paths have test coverage. A common gap is testing only the per-item path and omitting the shared cache path.

## Best Practices
<!-- Document what works well -->

### Read full files, not just diffs (seed)
**Practice:** Reading the entire file around a change reveals whether the new code fits with existing patterns, uses the right internal APIs, and doesn't duplicate existing functionality.

### Grep for callers before approving (seed)
**Practice:** Running a quick grep for every modified function's name catches broken consumers that the diff alone won't reveal. Takes 30 seconds, prevents production bugs.
