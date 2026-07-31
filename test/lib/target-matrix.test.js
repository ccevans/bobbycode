// test/lib/target-matrix.test.js
//
// The contract every harness adapter must satisfy, run against every target in
// the registry. Adding a target to lib/targets/index.js runs this whole suite
// against it with no test edits — that is the point.
//
// This exists because per-target hand-written tests let the same bug live in
// one target and not another: scaffolded agents referenced `CLAUDE.md`
// literally, which broke every non-Claude-Code target, and shipped in Cline for
// its entire life because only Cursor ever got a sweep test for it.
//
// Target-specific quirks (Cursor's frontmatter transform edge cases, Cline's
// .clineignore contents) stay in targets.test.js. Only shared invariants
// belong here.

import { TARGETS, getTarget } from '../../lib/targets/index.js';
import { scaffoldProject } from '../../commands/init.js';
import {
  buildSingleAgentPrompt,
  buildBatchStagePrompt,
  buildOrchestrationPrompt,
  DEFAULT_WORKFLOW,
} from '../../lib/workflow.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_CONFIG = {
  project: 'matrix-app',
  stack: 'nextjs',
  health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
  areas: ['auth'],
  commands: { dev: 'npm run dev', test: 'npm test' },
  tickets_dir: '.bobby/tickets',
  ticket_prefix: 'TKT',
};

/** Every .md file under dir, recursively. */
function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** Every scaffolded markdown file for a target: its four paths, deduped. */
function scaffoldedMarkdown(rootDir, paths) {
  const files = new Set();
  for (const rel of [paths.skills, paths.agents, paths.commands]) {
    markdownFiles(path.join(rootDir, rel)).forEach(f => files.add(f));
  }
  const rules = path.join(rootDir, paths.rules);
  if (fs.existsSync(rules) && fs.statSync(rules).isFile()) files.add(rules);
  return [...files];
}

describe.each(TARGETS)('target contract: %s', (name) => {
  const target = getTarget(name);
  const paths = target.paths();
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `bobby-matrix-${name}-`));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('adapter shape', () => {
    test('exposes the full adapter interface', () => {
      expect(target.name).toBe(name);
      expect(typeof target.displayName()).toBe('string');
      expect(target.displayName().length).toBeGreaterThan(0);
      expect(typeof target.supportsSubagents()).toBe('boolean');
      expect(typeof target.promptHint()).toBe('string');
      expect(typeof target.transformCommand).toBe('function');
      expect(Array.isArray(target.extraPaths())).toBe(true);
      expect(typeof target.scaffoldExtras).toBe('function');
    });

    test('declares all four scaffold paths as relative paths', () => {
      for (const key of ['agents', 'skills', 'commands', 'rules']) {
        expect(typeof paths[key]).toBe('string');
        expect(paths[key].length).toBeGreaterThan(0);
        expect(path.isAbsolute(paths[key])).toBe(false);
      }
    });
  });

  describe('scaffold', () => {
    test('writes every declared path', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      for (const key of ['agents', 'skills', 'commands', 'rules']) {
        expect(fs.existsSync(path.join(tmpDir, paths[key]))).toBe(true);
      }
    });

    test('creates every path declared by extraPaths()', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      for (const extra of target.extraPaths()) {
        expect(fs.existsSync(path.join(tmpDir, extra))).toBe(true);
      }
    });

    test('writes nothing into another target\'s directories', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });

      const ownRoots = new Set(
        [...Object.values(paths), ...target.extraPaths()].map(p => p.split('/')[0])
      );
      const foreignRoots = new Set();
      for (const other of TARGETS) {
        if (other === name) continue;
        const op = getTarget(other).paths();
        for (const p of [...Object.values(op), ...getTarget(other).extraPaths()]) {
          const root = p.split('/')[0];
          if (!ownRoots.has(root)) foreignRoots.add(root);
        }
      }

      for (const root of foreignRoots) {
        expect({ target: name, leaked: root, exists: fs.existsSync(path.join(tmpDir, root)) })
          .toEqual({ target: name, leaked: root, exists: false });
      }
    });

    test('no scaffolded file references another target\'s rules file', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });

      // The bug this suite exists for: agents told the model to "follow the
      // Safety Rules in CLAUDE.md" on targets that never write CLAUDE.md.
      const foreignRules = TARGETS
        .filter(t => t !== name)
        .map(t => getTarget(t).paths().rules)
        .filter(r => r !== paths.rules);

      const offenders = [];
      for (const file of scaffoldedMarkdown(tmpDir, paths)) {
        const content = fs.readFileSync(file, 'utf8');
        for (const foreign of foreignRules) {
          if (content.includes(foreign)) {
            offenders.push(`${path.relative(tmpDir, file)} → ${foreign}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    test('rules file names this target, not a hardcoded harness', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      const rules = fs.readFileSync(path.join(tmpDir, paths.rules), 'utf8');
      expect(rules).toContain(target.displayName());
    });

    test('skills and agents reference this target\'s own paths', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      const buildAgent = path.join(tmpDir, paths.agents, 'bobby-build.md');
      const buildSkill = path.join(tmpDir, paths.skills, 'bobby-build', 'SKILL.md');
      expect(fs.readFileSync(buildAgent, 'utf8')).toContain(paths.skills);
      expect(fs.readFileSync(buildSkill, 'utf8')).toContain(paths.skills);
    });

    test('scaffolds hooks only where they are supported', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });

      // hooks/ and .claude/settings.json are Claude Code mechanisms. Any other
      // target that ships them — or documents them in its rules file — is
      // pointing users at machinery that will never fire.
      const isClaudeCode = name === 'claude-code';
      expect(fs.existsSync(path.join(tmpDir, 'hooks'))).toBe(isClaudeCode);
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(isClaudeCode);

      const rules = fs.readFileSync(path.join(tmpDir, paths.rules), 'utf8');
      expect({ target: name, documentsHooks: rules.includes('## Hooks') })
        .toEqual({ target: name, documentsHooks: isClaudeCode });
    });

    test('is idempotent — rescaffolding does not duplicate extras', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      const after1 = target.extraPaths().map(p =>
        fs.readFileSync(path.join(tmpDir, p), 'utf8'));

      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      const after2 = target.extraPaths().map(p =>
        fs.readFileSync(path.join(tmpDir, p), 'utf8'));

      expect(after2).toEqual(after1);
    });

    test('backs up and merges a pre-existing rules file', () => {
      const rulesPath = path.join(tmpDir, paths.rules);
      fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
      const sentinel = 'Always use tabs, never spaces.';
      fs.writeFileSync(rulesPath, `# My rules\n\n${sentinel}\n`, 'utf8');

      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });

      expect(fs.existsSync(`${rulesPath}.pre-bobby`)).toBe(true);
      expect(fs.readFileSync(`${rulesPath}.pre-bobby`, 'utf8')).toContain(sentinel);
      // User content must survive the merge, not just the backup.
      expect(fs.readFileSync(rulesPath, 'utf8')).toContain(sentinel);
    });
  });

  describe('generated commands', () => {
    test('transformCommand is pure and stable', () => {
      const input = '---\ndescription: "D"\n---\n\nBody.\n';
      const once = target.transformCommand(input);
      expect(target.transformCommand(input)).toBe(once);
      expect(typeof once).toBe('string');
      expect(once).toContain('Body.');
    });

    test('scaffolded command files match the adapter\'s own transform', () => {
      scaffoldProject(tmpDir, { ...BASE_CONFIG, target: name });
      const dir = path.join(tmpDir, paths.commands);
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      expect(files.length).toBeGreaterThan(0);

      // Whatever the adapter does to frontmatter, the files on disk must agree
      // with it — a target that strips frontmatter must have none left.
      const stripsFrontmatter = !target.transformCommand(
        '---\ndescription: "D"\n---\n\nBody.\n'
      ).startsWith('---');
      for (const f of files) {
        const content = fs.readFileSync(path.join(dir, f), 'utf8');
        expect({ file: f, startsWithFm: content.startsWith('---') })
          .toEqual({ file: f, startsWithFm: !stripsFrontmatter });
      }
    });
  });

  describe('generated prompts', () => {
    const foreignAgentPaths = () => TARGETS
      .filter(t => t !== name)
      .map(t => getTarget(t).paths().agents)
      .filter(p => p !== paths.agents);

    test.each([
      ['buildSingleAgentPrompt', () =>
        buildSingleAgentPrompt('bobby-plan', 'TKT-001', '.bobby/tickets', paths.agents)],
      ['buildBatchStagePrompt', () =>
        buildBatchStagePrompt('bobby-plan', ['TKT-001'], '.bobby/tickets', 'none', paths.agents)],
      ['buildOrchestrationPrompt', () =>
        buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, paths.agents)],
    ])('%s uses this target\'s agents path only', (_label, build) => {
      const prompt = build();
      expect(prompt).toContain(paths.agents);
      for (const foreign of foreignAgentPaths()) {
        expect({ prompt: _label, leaked: foreign, found: prompt.includes(foreign) })
          .toEqual({ prompt: _label, leaked: foreign, found: false });
      }
    });
  });
});

describe('target registry', () => {
  test('every registered target is retrievable and self-consistent', () => {
    expect(TARGETS.length).toBeGreaterThanOrEqual(3);
    for (const name of TARGETS) {
      expect(getTarget(name).name).toBe(name);
    }
  });

  test('no two targets share a rules file and agents path combination', () => {
    // Two targets may share a rules file (AGENTS.md is a cross-tool standard),
    // but they must be distinguishable somewhere, or scaffolding one would be
    // indistinguishable from the other.
    const seen = new Map();
    for (const name of TARGETS) {
      const p = getTarget(name).paths();
      const key = `${p.rules}|${p.agents}|${p.skills}|${p.commands}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, name);
    }
  });
});
