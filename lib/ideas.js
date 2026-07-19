// lib/ideas.js
// Lightweight idea capture — five-second jots that live outside the ticket
// board until you promote them into real tickets. Solo builders get ideas
// mid-task; capturing one must cost nothing and not disturb the board.
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Read all ideas from the ideas file. Returns [] if none.
 */
export function readIdeas(ideasFile) {
  if (!fs.existsSync(ideasFile)) return [];
  const data = YAML.parse(fs.readFileSync(ideasFile, 'utf8')) || {};
  return Array.isArray(data.ideas) ? data.ideas : [];
}

/**
 * Write the ideas list back to the ideas file.
 */
export function writeIdeas(ideasFile, ideas) {
  fs.mkdirSync(path.dirname(ideasFile), { recursive: true });
  fs.writeFileSync(ideasFile, YAML.stringify({ ideas }, { lineWidth: 120 }), 'utf8');
}

/**
 * Capture a new idea. Returns the created idea.
 */
export function addIdea(ideasFile, text) {
  if (!text || !text.trim()) throw new Error('Idea text is required');
  const ideas = readIdeas(ideasFile);
  const n = ideas.reduce((max, i) => Math.max(max, i.n || 0), 0) + 1;
  const idea = { n, text: text.trim(), created: today(), promoted: null };
  ideas.push(idea);
  writeIdeas(ideasFile, ideas);
  return idea;
}

/**
 * Find an idea by its number.
 */
export function findIdea(ideasFile, n) {
  return readIdeas(ideasFile).find(i => i.n === n) || null;
}

/**
 * List ideas. By default only open (unpromoted) ones; pass { all: true } for everything.
 */
export function listIdeas(ideasFile, { all = false } = {}) {
  const ideas = readIdeas(ideasFile);
  return all ? ideas : ideas.filter(i => !i.promoted);
}

/**
 * Mark an idea as promoted to a ticket.
 */
export function markPromoted(ideasFile, n, ticketId) {
  const ideas = readIdeas(ideasFile);
  const idea = ideas.find(i => i.n === n);
  if (!idea) throw new Error(`Idea #${n} not found`);
  idea.promoted = ticketId;
  idea.promoted_at = today();
  writeIdeas(ideasFile, ideas);
  return idea;
}

/**
 * Remove an idea by number. Returns the removed idea.
 */
export function removeIdea(ideasFile, n) {
  const ideas = readIdeas(ideasFile);
  const idx = ideas.findIndex(i => i.n === n);
  if (idx === -1) throw new Error(`Idea #${n} not found`);
  const [removed] = ideas.splice(idx, 1);
  writeIdeas(ideasFile, ideas);
  return removed;
}
