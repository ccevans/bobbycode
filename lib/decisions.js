// lib/decisions.js
// The architectural decision log — `.bobby/decisions.yaml`.
//
// This file used to have no writer at all. It was seeded by `bobby init`, read
// by bobby-review in prose, and every entry in it was appended by an agent
// hand-editing YAML: no parse, no schema, no round-trip. That is where the
// malformed entries came from — an append that landed inside the previous
// entry and cost it its trailing keys, and one that deleted the commented
// example block the format was documented in. See TKT-063.
//
// So: one code path in, and it round-trips the document. Comments survive
// because we edit the parsed Document rather than concatenating text, and a
// file we cannot parse is an error rather than something to overwrite.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_TEMPLATE = path.join(__dirname, '..', 'templates', 'bobby', 'decisions.yaml');

// The entry shape documented in the seed's own header. Order matters: entries
// are written in this order so the log reads consistently however it was added.
export const DECISION_KEYS = ['id', 'fact', 'decided', 'ticket', 'why', 'supersedes', 'invalidated'];

/** The seed text every decisions.yaml starts from — one source, so studio and init agree. */
export function seedText() {
  return fs.readFileSync(SEED_TEMPLATE, 'utf8');
}

/** Write the seed to `file` unless it already exists. Returns true if it wrote. */
export function seedDecisionsFile(file) {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, seedText(), 'utf8');
  return true;
}

/**
 * Parse the log, refusing to guess. A file that does not parse throws rather
 * than being silently replaced — losing a decision log to a stray colon is
 * exactly the failure this module exists to prevent.
 */
export function readDecisionsDoc(file) {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : seedText();
  const doc = YAML.parseDocument(raw);
  if (doc.errors.length) {
    throw new Error(`${file} is not valid YAML: ${doc.errors[0].message}`);
  }
  return doc;
}

/**
 * The decisions as plain objects, newest last.
 *
 * Tolerates the legacy `decisions: []` mapping that `lib/studio.js` used to
 * seed, so a studio created before TKT-063 still reads. New files are always
 * the bare sequence the seed documents.
 */
export function readDecisions(file) {
  const value = readDecisionsDoc(file).toJS();
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.decisions)) return value.decisions;
  if (value == null) return [];
  throw new Error(`${file} should hold a list of decisions, found ${typeof value}`);
}

function assertKebab(id) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Decision id '${id}' must be kebab-case (lowercase, digits, dashes)`);
  }
}

/**
 * Append one decision, preserving every existing entry and the file's comments.
 *
 * @param {string} file
 * @param {object} entry - { id, fact, why, ticket?, decided?, supersedes? }
 * @returns {object} the entry as written
 */
export function appendDecision(file, entry) {
  const { id, fact, why } = entry;
  for (const [name, value] of Object.entries({ id, fact, why })) {
    if (!value || !String(value).trim()) throw new Error(`Decision needs a ${name}`);
  }
  assertKebab(id);

  const doc = readDecisionsDoc(file);
  const existing = readDecisions(file);
  if (existing.some(d => d && d.id === id)) {
    throw new Error(`Decision '${id}' already exists. Supersede it instead: --id <new-id> --supersedes ${id}`);
  }
  if (entry.supersedes && !existing.some(d => d && d.id === entry.supersedes)) {
    throw new Error(`Cannot supersede '${entry.supersedes}' — no decision with that id`);
  }

  const written = {
    id,
    fact: String(fact),
    decided: entry.decided || new Date().toISOString().slice(0, 10),
    ticket: entry.ticket || 'arch',
    why: String(why),
    supersedes: entry.supersedes || null,
    invalidated: null,
  };

  // Editing the parsed document is what keeps the header comments and every
  // prior entry's keys intact — the hand-edits this replaces did neither.
  const node = doc.createNode(written);
  // Match the quoting the log already uses, so an appended entry and a
  // historical one produce the same shape of diff.
  for (const key of ['fact', 'decided', 'why']) {
    const scalar = node.get(key, true);
    if (scalar) scalar.type = 'QUOTE_DOUBLE';
  }

  const seq = Array.isArray(doc.contents?.items) && doc.contents.items.every(i => !i.key)
    ? doc.contents
    : null;
  if (seq) {
    seq.items.push(node);
  } else if (doc.contents == null || doc.toJS() == null) {
    doc.contents = doc.createNode([]);
    doc.contents.items.push(node);
  } else {
    // Legacy `decisions: []` mapping — append in place, schema unchanged, so a
    // studio created before TKT-063 keeps working instead of being rewritten.
    const list = doc.get('decisions');
    if (!list) throw new Error(`${file} should hold a list of decisions`);
    list.items.push(node);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }), 'utf8');
  return written;
}
