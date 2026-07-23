# Fixture 03 — pagination with bounds (edge / ambiguous)

**Difficulty:** hardest — a feature with unstated defaults the implementer must choose sensibly, plus hostile inputs that must not crash.

## Task
Add pagination to `GET /notes`.

## Acceptance criteria
- [ ] `GET /notes` supports `?limit` and `?offset` query params.
- [ ] Defaults: `limit` defaults to **20**, `offset` defaults to **0**. So `GET /notes` with 25 notes returns the first 20.
- [ ] `limit` is capped at a maximum of **100** (a larger request returns at most 100).
- [ ] Bad or hostile params must **not crash** the server: negative, zero, non-numeric (`?limit=abc`), or absurd values must fall back to sane behavior and still return HTTP **200** with a JSON array.
- [ ] `?offset` skips that many notes; out-of-range offset returns an empty array, not an error.
- [ ] Existing behavior otherwise unchanged; add behavioral tests; `node --test` passes.
