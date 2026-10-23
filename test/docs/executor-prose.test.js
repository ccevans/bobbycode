// test/docs/executor-prose.test.js — the README's Executor prose stays honest (BOB-134).
//
// BOB-082's support-matrix suite guards the TABLE, which is why the table
// stayed current while the free prose in the Dashboard section drifted three
// flavors behind (it still said claude/cursor-agent after codex and opencode
// shipped). This suite anchors the same registry — EXECUTOR_NAMES — against
// the three prose spots the drift hit, so the next flavor added cannot leave
// them stale again:
//
//   1. the **Executor.** paragraph (which flavors the dashboard drives),
//   2. the YAML example's `executor:` inline comment (the enumerated set),
//   3. the **Permission posture** paragraph (how each flavor gets its mode).
//
// Same philosophy as the matrix parser: deliberately dumb and anchored.
// Sections are keyed on their bold lead-ins, names on backticks, and the YAML
// comment on its `executor:` line — free-text wording edits never break this
// suite, only dropping a flavor (or the anchor itself) does.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EXECUTOR_NAMES } from '../../lib/dashboard/executor.js';

const README_PATH = fileURLToPath(new URL('../../README.md', import.meta.url));
const readme = fs.readFileSync(README_PATH, 'utf8');

/**
 * Slice the README between two anchor strings (start inclusive, end
 * exclusive). Returns null when either anchor is missing, so a reworded
 * anchor fails loudly in the anchor test instead of vacuously passing the
 * content checks on an empty string.
 */
function sliceBetween(text, startAnchor, endAnchor) {
  const start = text.indexOf(startAnchor);
  if (start === -1) return null;
  const end = text.indexOf(endAnchor, start + startAnchor.length);
  if (end === -1) return null;
  return text.slice(start, end);
}

// The whole Dashboard executor region: prose, YAML example, posture paragraph.
const EXECUTOR_ANCHOR = '**Executor.**';
const POSTURE_ANCHOR = '**Permission posture';
const REGION_END = '**When a run does nothing.**';

const executorProse = sliceBetween(readme, EXECUTOR_ANCHOR, '```yaml');
const postureProse = sliceBetween(readme, POSTURE_ANCHOR, REGION_END);
const executorRegion = sliceBetween(readme, EXECUTOR_ANCHOR, REGION_END);

test('the README carries the anchored Executor and Permission posture paragraphs', () => {
  expect(executorProse).not.toBeNull();
  expect(postureProse).not.toBeNull();
});

/** The backticked names a stretch of markdown mentions, filtered to registry names. */
function flavorsNamedIn(text) {
  const named = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  return EXECUTOR_NAMES.filter((name) => named.includes(name));
}

// --- 1: the Executor paragraph names every drivable flavor ------------------

test('the Executor prose names every registered flavor', () => {
  expect(flavorsNamedIn(executorProse).sort()).toEqual([...EXECUTOR_NAMES].sort());
});

// --- 2: the YAML comment enumerates exactly the registry --------------------

/**
 * The set a `executor:` inline comment enumerates: the ` | `-separated names
 * after the `#`, stopping at the first token that is not a bare name (the
 * custom-binary-path affordance lives on a continuation line).
 */
function commentedSet(text) {
  const line = text.split('\n').find((l) => /^\s*executor:.*#/.test(l));
  if (!line) return null;
  return line
    .slice(line.indexOf('#') + 1)
    .split('|')
    .map((t) => t.trim())
    .filter((t) => /^[a-z][a-z0-9-]*$/.test(t));
}

test('the YAML example comment enumerates exactly the registered flavors', () => {
  expect(commentedSet(executorRegion)).not.toBeNull();
  expect([...commentedSet(executorRegion)].sort()).toEqual([...EXECUTOR_NAMES].sort());
});

test('the comment check bites on a stale enumeration (negative control)', () => {
  // The pre-BOB-134 comment, verbatim — the drift this suite exists to catch.
  const stale = '  executor: cursor-agent           # claude | cursor-agent | /abs/path/to/a/binary';
  expect([...commentedSet(stale)].sort()).not.toEqual([...EXECUTOR_NAMES].sort());
});

// --- 3: the posture paragraph covers every flavor's mapping -----------------

test('the Permission posture prose maps every registered flavor', () => {
  // Each flavor must at least be named — a new executor whose permission
  // mapping is not written into this paragraph fails here, which is exactly
  // the BOB-134 gap (the paragraph mapped claude and cursor-agent and read as
  // a complete list while codex and opencode existed).
  expect(flavorsNamedIn(postureProse).sort()).toEqual([...EXECUTOR_NAMES].sort());
});
