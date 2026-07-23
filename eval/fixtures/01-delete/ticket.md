# Fixture 01 — DELETE endpoint (moderate)

**Difficulty:** moderate — a new endpoint that mutates state, plus a not-found path, without regressing existing routes.

## Task
Add `DELETE /notes/:id` to the notes API.

## Acceptance criteria
- [ ] `DELETE /notes/:id` removes the note and returns HTTP **204** with an empty body.
- [ ] `DELETE /notes/:id` for an id that doesn't exist returns HTTP **404** with `{"error":"not found"}`.
- [ ] After deleting a note, `GET /notes/:id` for that id returns **404**, and it no longer appears in `GET /notes`.
- [ ] All existing endpoints (`GET /notes`, `POST /notes`, `GET /notes/:id`) behave exactly as before.
- [ ] Add behavioral tests for the new endpoint; the full `node --test` suite passes.
