// test/docs/support-matrix.test.js — the README support matrix stays honest (BOB-082).
//
// Every adapter/executor ticket owes the matrix exactly one row (the row
// schema in the epic's feature-plan). This suite parses the shipped README
// table and asserts it against the live registries, so a missing row, a
// dishonest status token, or a canary claim with no YAML leg is a red PR —
// not a doc drift discovered by a burned user.
//
// The parser is deliberately dumb and anchored: rows are keyed on the
// backticked name in column 1, and only three fixed status tokens are
// load-bearing. Everything else in the cells is free text, so wording edits
// elsewhere never break this suite.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { TARGETS, getTarget } from '../../lib/targets/index.js';
import { EXECUTOR_NAMES } from '../../lib/dashboard/executor.js';

const README_PATH = fileURLToPath(new URL('../../README.md', import.meta.url));
const YAML_PATH = fileURLToPath(new URL('../../.github/workflows/flag-canary.yml', import.meta.url));

const readme = fs.readFileSync(README_PATH, 'utf8');
// Read as text, same as the canary registration test — no yaml dependency.
const canaryYaml = fs.readFileSync(YAML_PATH, 'utf8');
const canaryFlavors = [...canaryYaml.matchAll(/flavor: (\S+)/g)].map((m) => m[1]);

const HEADER = '| `target` | Tier | Dashboard | Verified | Canary |';
const STATUS_TOKENS = ['real-CLI', 'shipped-code', 'convention'];

/**
 * Parse a support-matrix table out of markdown text. Returns null when the
 * anchor header row is absent; otherwise { rows, names } where `names` keeps
 * every row occurrence (so duplicates are visible) and `rows` maps each
 * backticked target name to its trimmed cells.
 */
function parseMatrix(text) {
  const lines = text.split('\n');
  const start = lines.indexOf(HEADER);
  if (start === -1) return null;
  const rows = {};
  const names = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').map((c) => c.trim()).slice(1, -1);
    const name = cells[0]?.match(/^`([^`]+)`/)?.[1];
    if (!name) continue;
    names.push(name);
    rows[name] = {
      tier: cells[1],
      dashboard: cells[2],
      verified: cells[3],
      canary: cells[4],
      raw: lines[i],
    };
  }
  return { rows, names };
}

const matrix = parseMatrix(readme);

test('README carries the support-matrix table with the fixed header row', () => {
  expect(matrix).not.toBeNull();
});

// --- 1: completeness --------------------------------------------------------

test('every registered target has exactly one row, and no row exists for an unregistered target', () => {
  // Set equality both ways: a target without a row is an undocumented
  // adapter (the BOB-083/084 one-row obligation); a row without a target is
  // an unverifiable claim (this is also what keeps dissolved rows —
  // gemini/antigravity, per BOB-088 — from ever coming back).
  expect([...matrix.names].sort()).toEqual([...TARGETS].sort());
});

test('the completeness check bites on a missing row (negative control)', () => {
  const missingOne = [
    HEADER,
    '|---|---|---|---|---|',
    ...TARGETS.filter((n) => n !== 'cline')
      .map((n) => `| \`${n}\` | dedicated | — | convention — docs | — |`),
  ].join('\n');
  const parsed = parseMatrix(missingOne);
  expect([...parsed.names].sort()).not.toEqual([...TARGETS].sort());
});

// --- 2: verification vocabulary ---------------------------------------------

describe.each(TARGETS)('row honesty: %s', (name) => {
  const row = () => matrix.rows[name];

  test('Verified cell starts with one of the three status tokens', () => {
    expect(STATUS_TOKENS.some((t) => row().verified.startsWith(`${t} —`))).toBe(true);
  });

  test('real-CLI and shipped-code cells name dated/versioned evidence', () => {
    const v = row().verified;
    if (v.startsWith('convention')) return;
    // A version (1.2.3 / 2026.07.23) or an ISO date — bare "verified" is not
    // evidence (the ticket's reason for existing).
    expect(v).toMatch(/\d{4}-\d{2}-\d{2}|\d+\.\d+\.\d+/);
  });

  test('rows never claim subagents the adapter does not declare', () => {
    if (!getTarget(name).supportsSubagents()) {
      expect(row().raw).not.toMatch(/subagent/i);
    }
  });
});

// --- 3: executor <-> canary <-> YAML coherence ------------------------------

test('every executor flavor has a row marked weekly and a flag-canary.yml matrix entry', () => {
  for (const flavor of EXECUTOR_NAMES) {
    const holders = Object.entries(matrix.rows)
      .filter(([, r]) => r.dashboard.match(/`([^`]+)`/)?.[1] === flavor);
    expect({ flavor, rows: holders.map(([n]) => n) }).toEqual({ flavor, rows: [expect.any(String)] });
    expect({ flavor, canary: holders[0][1].canary }).toEqual({ flavor, canary: 'weekly' });
    expect({ flavor, inYaml: canaryFlavors.includes(flavor) }).toEqual({ flavor, inYaml: true });
  }
});

test('every weekly cell belongs to a registered executor flavor that the canary YAML probes', () => {
  for (const [name, row] of Object.entries(matrix.rows)) {
    if (row.canary !== 'weekly') {
      // No executor -> no canary claim: an em-dash or an honest
      // "not canaried: <reason>" only. Never a fake leg.
      expect({ name, canary: /^(—|not canaried: .+)$/.test(row.canary) })
        .toEqual({ name, canary: true });
      continue;
    }
    const flavor = row.dashboard.match(/`([^`]+)`/)?.[1];
    expect({ name, flavor, registered: EXECUTOR_NAMES.includes(flavor) })
      .toEqual({ name, flavor, registered: true });
    expect({ name, flavor, inYaml: canaryFlavors.includes(flavor) })
      .toEqual({ name, flavor, inYaml: true });
  }
});

// --- 4: claims-limited generic tier -----------------------------------------

test('the agents-md row claims rules + skills and nothing more', () => {
  const row = matrix.rows['agents-md'];
  expect(row.tier).toBe('generic');
  expect(row.dashboard).toBe('—');
  // The generic tier never claims parity, a dashboard, or subagents — the
  // exact overclaim the epic exists to prevent (AC2).
  expect(row.verified).not.toMatch(/parity|subagent|dashboard/i);
});
