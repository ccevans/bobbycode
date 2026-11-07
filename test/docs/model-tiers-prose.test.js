// test/docs/model-tiers-prose.test.js — the README's tier table stays honest.
//
// The table lists every agent under its tier, which is a hand-copy of
// AGENT_REGISTRY and therefore drifts the moment an agent is added or
// retiered. This is the same treatment BOB-134 gave the Executor prose, and
// for the same reason: the registry is the source of truth, and the README is
// the copy nobody remembers to update.
//
// Deliberately dumb and anchored: the table is found by its header row and
// agents by their backticks, so rewording the prose around it never breaks
// this suite — only dropping an agent, or moving one, does.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AGENT_REGISTRY, VALID_AGENTS } from '../../lib/agent-registry.js';
import { MODEL_TIERS } from '../../lib/models.js';

const README_PATH = fileURLToPath(new URL('../../README.md', import.meta.url));
const readme = fs.readFileSync(README_PATH, 'utf8');

const TABLE_HEADER = '| Tier | The work | Agents |';

/** The table's rows, as { tier, agents } — null if the table is gone. */
const rows = (() => {
  const start = readme.indexOf(TABLE_HEADER);
  if (start === -1) return null;
  const block = readme.slice(start).split('\n\n')[0].split('\n');
  return block
    .filter(line => /^\| `(opus|sonnet|haiku)` \|/.test(line))
    .map((line) => {
      const cells = line.split('|').map(c => c.trim());
      return {
        tier: cells[1].replace(/`/g, ''),
        agents: [...cells[3].matchAll(/`([^`]+)`/g)].map(m => m[1]),
      };
    });
})();

test('the README carries the anchored tier table', () => {
  expect(rows).not.toBeNull();
  expect(rows.map(r => r.tier)).toEqual(MODEL_TIERS);
});

test('every agent is listed, exactly once', () => {
  const listed = rows.flatMap(r => r.agents);
  expect([...listed].sort()).toEqual([...VALID_AGENTS].sort());
  expect(new Set(listed).size).toBe(listed.length);
});

test('every agent is listed under the tier it actually declares', () => {
  for (const row of rows) {
    for (const agent of row.agents) {
      expect(`${agent}: ${AGENT_REGISTRY[agent]?.tier}`).toBe(`${agent}: ${row.tier}`);
    }
  }
});
