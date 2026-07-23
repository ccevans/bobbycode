# Fixture 02 — validation + filtering (harder)

**Difficulty:** harder — two concerns in one ticket (input validation on write, query filtering on read), each with edge cases, without regressing existing behavior.

## Task
Harden and extend the notes API.

## Acceptance criteria
- [ ] `POST /notes` with a missing or empty/whitespace-only `title` returns HTTP **400** with `{"error":"title is required"}` and does **not** create a note.
- [ ] `POST /notes` with a valid title still returns **201** and creates the note (unchanged behavior).
- [ ] `GET /notes?q=<term>` returns only notes whose `title` contains `<term>`, **case-insensitively**.
- [ ] `GET /notes?q=<term>` with no matches returns an empty array `[]` and HTTP **200**.
- [ ] `GET /notes` with no `q` returns all notes (unchanged behavior).
- [ ] Add behavioral tests; the full `node --test` suite passes.
