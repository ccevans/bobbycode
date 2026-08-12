// test/lib/decisions.test.js
import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { appendDecision, readDecisions, seedDecisionsFile, seedText } from '../../lib/decisions.js';

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-decisions-'));
  file = path.join(dir, 'decisions.yaml');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const decision = (over = {}) => ({
  id: 'no-direct-db-in-components',
  fact: 'Never call the database directly from UI components.',
  why: 'Breaks separation of concerns and makes testing hard.',
  ticket: 'TKT-001',
  ...over,
});

describe('decisions log', () => {
  test('seeds a file that parses to an empty log', () => {
    expect(seedDecisionsFile(file)).toBe(true);
    expect(readDecisions(file)).toEqual([]);
  });

  test('seeding is a no-op when the file already exists', () => {
    fs.writeFileSync(file, '- id: keep-me\n  fact: "x"\n  why: "y"\n');
    expect(seedDecisionsFile(file)).toBe(false);
    expect(readDecisions(file)[0].id).toBe('keep-me');
  });

  test('the seed no longer claims bobby learn updates it', () => {
    // The false line that sent agents to a command which never opened this
    // file, and so left hand-editing as the only way in. TKT-063.
    expect(seedText()).not.toMatch(/Updated via `bobby learn`/);
    expect(seedText()).toContain('bobby decision add');
  });

  test('appends an entry with all seven documented keys', () => {
    seedDecisionsFile(file);
    const written = appendDecision(file, decision());
    expect(Object.keys(written)).toEqual([
      'id', 'fact', 'decided', 'ticket', 'why', 'supersedes', 'invalidated',
    ]);
    expect(readDecisions(file)).toEqual([written]);
  });

  test('defaults decided to today and ticket to arch', () => {
    seedDecisionsFile(file);
    const written = appendDecision(file, { id: 'a-choice', fact: 'f', why: 'w' });
    expect(written.ticket).toBe('arch');
    expect(written.decided).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The defect this module exists for: an append that landed inside the
  // previous entry and cost it its trailing keys.
  test('appending preserves the previous entry, trailing keys and all', () => {
    seedDecisionsFile(file);
    const first = appendDecision(file, decision({ id: 'first-choice' }));
    appendDecision(file, decision({ id: 'second-choice' }));

    const all = readDecisions(file);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(first);
    expect(all[0].supersedes).toBeNull();
    expect(all[0].invalidated).toBeNull();
  });

  test('appending preserves the header comments', () => {
    seedDecisionsFile(file);
    appendDecision(file, decision());
    const raw = fs.readFileSync(file, 'utf8');
    // The format documentation lives above the document marker precisely so an
    // append cannot consume it — it was deleted once when it lived below.
    expect(raw).toContain('# Bobby Architectural Decision Log');
    expect(raw).toContain('bobby decision add');
  });

  test('refuses a duplicate id and points at supersedes', () => {
    seedDecisionsFile(file);
    appendDecision(file, decision());
    expect(() => appendDecision(file, decision())).toThrow(/already exists/);
    expect(() => appendDecision(file, decision())).toThrow(/--supersedes/);
  });

  test('refuses to supersede a decision that does not exist', () => {
    seedDecisionsFile(file);
    expect(() => appendDecision(file, decision({ supersedes: 'never-decided' })))
      .toThrow(/no decision with that id/);
  });

  test('requires id, fact and why', () => {
    seedDecisionsFile(file);
    expect(() => appendDecision(file, { fact: 'f', why: 'w' })).toThrow(/needs a id/);
    expect(() => appendDecision(file, { id: 'x', why: 'w' })).toThrow(/needs a fact/);
    expect(() => appendDecision(file, { id: 'x', fact: 'f' })).toThrow(/needs a why/);
  });

  test('requires a kebab-case id', () => {
    seedDecisionsFile(file);
    expect(() => appendDecision(file, decision({ id: 'Not Kebab' }))).toThrow(/kebab-case/);
  });

  // A stray colon should not cost anyone their decision log.
  test('a malformed log fails loudly instead of being overwritten', () => {
    const broken = '- id: one\n   fact: "bad indent\n  why: [\n';
    fs.writeFileSync(file, broken);
    expect(() => appendDecision(file, decision())).toThrow(/not valid YAML/);
    expect(fs.readFileSync(file, 'utf8')).toBe(broken);
  });

  test('reads the legacy `decisions: []` mapping a pre-TKT-063 studio seeded', () => {
    fs.writeFileSync(file, 'decisions: []\n');
    expect(readDecisions(file)).toEqual([]);
    const written = appendDecision(file, decision());
    expect(readDecisions(file)).toEqual([written]);
    // Appended in place — an existing studio keeps its shape rather than being
    // silently rewritten under it.
    expect(YAML.parse(fs.readFileSync(file, 'utf8')).decisions).toHaveLength(1);
  });

  test('rejects a log that is neither a list nor a decisions mapping', () => {
    fs.writeFileSync(file, 'just: a mapping\n');
    expect(() => readDecisions(file)).toThrow(/should hold a list of decisions/);
  });
});
