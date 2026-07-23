// In-memory notes store. Kept separate so features can extend it cleanly.
let notes = [];
let nextId = 1;

export function reset() { notes = []; nextId = 1; }
export function all() { return notes.slice(); }
export function get(id) { return notes.find(n => n.id === id) || null; }

export function create({ title, body = '' }) {
  const note = { id: nextId++, title, body, created: '2026-01-01' };
  notes.push(note);
  return note;
}
