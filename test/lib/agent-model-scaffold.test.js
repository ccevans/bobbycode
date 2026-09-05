// test/lib/agent-model-scaffold.test.js
//
// The per-stage model reaches the file the harness actually launches an agent
// from (BOB-135).
//
// The executor path is only half of it. Most stages are run from the CLI —
// `bobby run review` prints a prompt that a Claude Code session dispatches to
// `.claude/agents/bobby-review.md`. If that file names no model, the stage
// inherits whatever model the operator's session happened to be on, and the
// tiers in the registry are an opinion with no effect on the common path.
import fs from 'fs';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import { scaffoldProject } from '../../commands/init.js';
import { AGENT_REGISTRY } from '../../lib/agent-registry.js';
import { agentKeyForFile } from '../../lib/models.js';

let tmpDir;

const baseConfig = {
  project: 'test-app', stack: 'generic',
  tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
  health_checks: [], areas: [], commands: {},
};

/** Scaffold, then read the frontmatter of every agent file that was written. */
function scaffoldAgents(extra = {}) {
  scaffoldProject(tmpDir, { ...baseConfig, ...extra });
  const target = extra.target === 'cursor' ? path.join('.cursor', 'agents')
    : extra.target === 'codex' ? path.join('.codex', 'agents')
    : path.join('.claude', 'agents');
  const dir = path.join(tmpDir, target);
  const out = {};
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    out[file.replace(/\.md$/, '')] = matter(fs.readFileSync(path.join(dir, file), 'utf8')).data;
  }
  return out;
}

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-agent-model-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('scaffolded agent files carry their stage model', () => {
  test('every shipped agent file names the model its registry tier asks for', () => {
    const agents = scaffoldAgents();
    // Every scaffolded file traces back to a registry entry — a file that does
    // not is the real finding here, so it is asserted rather than skipped.
    for (const [file, front] of Object.entries(agents)) {
      const key = agentKeyForFile(file);
      expect(`${file} → ${key}`).not.toContain('null');
      expect(`${file}: ${front.model}`).toBe(`${file}: ${AGENT_REGISTRY[key].tier}`);
    }
  });

  test('the files do not all say the same thing', () => {
    const models = new Set(Object.values(scaffoldAgents()).map(f => f.model));
    expect([...models].sort()).toEqual(['haiku', 'opus', 'sonnet']);
  });

  test('the model sits alongside the name and description, not instead of them', () => {
    const front = scaffoldAgents()['bobby-review'];
    expect(front.name).toBe('bobby-review');
    expect(front.description).toBeTruthy();
    expect(front.model).toBe('opus');
  });

  test('a project that names its own models gets those', () => {
    const agents = scaffoldAgents({ models: { review: 'haiku', default: 'opus' } });
    expect(agents['bobby-review'].model).toBe('haiku');
    expect(agents['bobby-build'].model).toBe('opus');
  });

  test('inherit writes no model line at all', () => {
    const agents = scaffoldAgents({ models: { default: 'inherit' } });
    for (const front of Object.values(agents)) {
      expect(front.model).toBeUndefined();
    }
  });

  // Cursor parses subagent frontmatter too, but with its own model names.
  // Bobby does not write a name it has not verified against the real binary,
  // so a cursor project gets no model line until it names one itself.
  test('a harness Bobby has not verified gets no model line', () => {
    const agents = scaffoldAgents({ target: 'cursor' });
    expect(Object.keys(agents).length).toBeGreaterThan(0);
    for (const front of Object.values(agents)) {
      expect(front.model).toBeUndefined();
    }
  });
});
