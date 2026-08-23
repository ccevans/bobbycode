// test/lib/target-matrix.test.js — the contract every target must satisfy (BOB-078).
//
// Each target had hand-written tests, so a contract violation in one went
// unnoticed in the others: scaffolded agents referenced CLAUDE.md on targets
// that never write it, and the bug shipped broken in Cline for its entire life.
// This suite iterates the registry itself — a new target registered in
// lib/targets/index.js runs every invariant with zero test edits, which is what
// lets codex and agents-md land pre-verified (BOB-079/081).
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TARGETS, getTarget } from '../../lib/targets/index.js';
import { scaffoldProject } from '../../commands/init.js';
import { buildSingleAgentPrompt } from '../../lib/workflow.js';

const walk = (dir) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

const baseConfig = (target) => ({
  project: 'matrix-test', stack: 'generic', target,
  tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
  health_checks: [], areas: [], commands: {},
});

// A target's DISTINCTIVE artifacts — the ones that identify it and no other.
// AGENTS.md is deliberately not distinctive: cursor writes it as its rules file
// and the agents-md target will share it — that is the convention's whole point.
const DISTINCTIVE = {
  'claude-code': ['CLAUDE.md', '.claude'],
  'cline': ['.clinerules', '.clineignore'],
  'cursor': ['.cursor'],
  'codex': ['.codex'],
  'agents-md': ['.agents'],
};

test('the leakage map covers every registered target — a new target cannot skip it', () => {
  // Deleting one entry left 40/40 green (review F2): a target absent from the
  // map has its artifacts checked as leakage in NO other target, silently.
  expect(Object.keys(DISTINCTIVE).sort()).toEqual([...TARGETS].sort());
});

describe.each(TARGETS)('target contract: %s', (name) => {
  let tmp;
  const t = getTarget(name);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), `bobby-matrix-${name}-`));
    scaffoldProject(tmp, baseConfig(name));
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('every declared path exists and was written to', () => {
    const p = t.paths();
    for (const key of ['agents', 'skills', 'commands']) {
      const dir = path.join(tmp, p[key]);
      expect(fs.existsSync(dir)).toBe(true);
      expect(walk(dir).length).toBeGreaterThan(0);
    }
    expect(fs.existsSync(path.join(tmp, p.rules))).toBe(true);
  });

  test('nothing leaks from another target — the scaffold writes ITS world only', () => {
    for (const [other, artifacts] of Object.entries(DISTINCTIVE)) {
      if (other === name) continue;
      for (const artifact of artifacts) {
        // Shared conventions are exempt by construction: only artifacts THIS
        // target does not also own count as leakage.
        const ownedHere = Object.values(t.paths()).some((own) => own === artifact || own.startsWith(artifact + '/'))
          || (t.extraPaths?.() || []).includes(artifact);
        if (ownedHere) continue;
        expect({ artifact, exists: fs.existsSync(path.join(tmp, artifact)) })
          .toEqual({ artifact, exists: false });
      }
    }
  });

  test('no scaffolded file names another target\'s rules file — the CLAUDE.md-class bug', () => {
    const ownRules = path.basename(t.paths().rules);
    const foreignRules = TARGETS.filter((o) => o !== name)
      .map((o) => getTarget(o).paths().rules)
      .filter((r) => path.basename(r) !== ownRules)          // shared names exempt
      .filter((r) => path.basename(r) !== 'rules.md');       // too generic to grep for
    const p = t.paths();
    const files = ['agents', 'skills', 'commands']
      .flatMap((key) => walk(path.join(tmp, p[key])))
      .concat([path.join(tmp, p.rules)].filter((f) => fs.existsSync(f)));
    const offenders = [];
    for (const f of files) {
      const body = fs.readFileSync(f, 'utf8');
      for (const foreign of foreignRules) {
        if (body.includes(path.basename(foreign))) offenders.push(`${path.relative(tmp, f)} names ${path.basename(foreign)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the rules file names the target itself', () => {
    const rules = fs.readFileSync(path.join(tmp, t.paths().rules), 'utf8');
    expect(rules).toContain(t.displayName());
  });

  test('generated prompts point at THIS target\'s agents path and no other\'s', () => {
    const prompt = buildSingleAgentPrompt('bobby-build', 'TKT-001',
      path.join(tmp, '.bobby/tickets'), t.paths().agents, false, false, 'reviewing');
    expect(prompt).toContain(t.paths().agents);
    for (const other of TARGETS.filter((o) => o !== name)) {
      const foreign = getTarget(other).paths().agents;
      if (foreign === t.paths().agents) continue;
      expect(prompt).not.toContain(foreign);
    }
  });

  test('transformCommand is total and idempotent over every shipped command', () => {
    const dir = path.join(tmp, t.paths().commands);
    for (const f of walk(dir)) {
      const body = fs.readFileSync(f, 'utf8');
      // Already transformed at scaffold time: transforming again must be a
      // no-op, or the adapter mangles content on any re-scaffold.
      expect(t.transformCommand(body)).toBe(body);
    }
  });

  test('scaffolded commands carry frontmatter iff the target declares it parses them', () => {
    // The ticket's invariant, not a proxy: idempotency is satisfied trivially
    // by the identity function, so disabling a strip left the matrix green
    // (review F1 / mutation M3). The adapter DECLARES the property and the
    // matrix asserts the shipped files against the declaration.
    const keeps = t.keepsCommandFrontmatter();
    const dir = path.join(tmp, t.paths().commands);
    const files = walk(dir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    const withFm = files.filter((f) => /^---\r?\n/.test(fs.readFileSync(f, 'utf8')));
    if (keeps) {
      expect(withFm.length).toBeGreaterThan(0);
    } else {
      expect(withFm.map((f) => path.relative(tmp, f))).toEqual([]);
    }
  });

  test('the scaffolded agents cite THIS target\'s rules file — the positive half', () => {
    // Invariant 3 is purely negative (no FOREIGN rules file named); retiring
    // the hand-written cursor test lost the positive half, so a template that
    // dropped the safety-rules pointer entirely passed every leg (review F3b).
    const agents = walk(path.join(tmp, t.paths().agents));
    const ownRules = path.basename(t.paths().rules);
    const citing = agents.filter((f) => fs.readFileSync(f, 'utf8').includes(ownRules));
    expect(citing.length).toBeGreaterThan(0);
  });

  test('extraPaths and scaffoldExtras agree, and re-scaffold is idempotent', () => {
    for (const extra of t.extraPaths?.() || []) {
      expect(fs.existsSync(path.join(tmp, extra))).toBe(true);
    }
    const before = Object.fromEntries((t.extraPaths?.() || [])
      .map((e) => [e, fs.readFileSync(path.join(tmp, e), 'utf8')]));
    scaffoldProject(tmp, baseConfig(name), { writeConfig: false });
    for (const [extra, content] of Object.entries(before)) {
      expect(fs.readFileSync(path.join(tmp, extra), 'utf8')).toBe(content);
    }
  });

  test('a pre-existing rules file is backed up and merged, never clobbered', () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), `bobby-matrix2-${name}-`));
    try {
      const rulesPath = path.join(fresh, t.paths().rules);
      fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
      fs.writeFileSync(rulesPath, '# My precious hand-written rules\nNever delete this.\n');
      scaffoldProject(fresh, baseConfig(name));

      expect(fs.existsSync(rulesPath + '.pre-bobby')).toBe(true);
      expect(fs.readFileSync(rulesPath + '.pre-bobby', 'utf8')).toContain('My precious');
      expect(fs.readFileSync(rulesPath, 'utf8')).toContain('Never delete this.');
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true });
    }
  });
});
