// test/lib/agents-md-target.test.js
//
// The generic tier's contract is mostly about what it does NOT claim.
// Shared adapter invariants live in target-matrix.test.js.

import { getTarget, TARGETS } from '../../lib/targets/index.js';
import { resolveExecutor } from '../../lib/dashboard/executor.js';

describe('agents-md target', () => {
  const target = getTarget('agents-md');

  test('is registered', () => {
    expect(TARGETS).toContain('agents-md');
  });

  test('uses the cross-tool roots verified in shipped binaries', () => {
    const p = target.paths();
    // Cursor 3.13's skill-root array contains ".agents/skills/"; Codex uses
    // the adjacent ".agents/plugins". AGENTS.md is verified in both.
    expect(p.rules).toBe('AGENTS.md');
    expect(p.skills).toBe('.agents/skills');
  });

  test('writes nothing tool-specific', () => {
    const p = target.paths();
    for (const v of Object.values(p)) {
      expect(v).not.toMatch(/\.cursor|\.claude|\.codex|\.clinerules/);
    }
    expect(target.extraPaths()).toEqual([]);
  });

  test('claims no subagent support', () => {
    // No cross-tool subagent convention exists; prompts reference agents by path.
    expect(target.supportsSubagents()).toBe(false);
  });

  test('derives no dashboard executor — it is not a specific CLI', () => {
    // A dedicated target (cursor, codex) implies its CLI. This tier does not,
    // so the dashboard stays on claude unless dashboard.executor says otherwise.
    expect(resolveExecutor({ target: 'agents-md' }).name).toBe('claude');
    expect(resolveExecutor({ target: 'agents-md', dashboard: { executor: 'codex' } }).name)
      .toBe('codex');
  });

  test('strips command frontmatter — no generic tool parses it', () => {
    expect(target.transformCommand('---\ndescription: "D"\n---\n\nBody.\n'))
      .toBe('_D_\n\nBody.\n');
  });
});
