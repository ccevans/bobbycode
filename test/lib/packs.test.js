// test/lib/packs.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadPack, evaluateRule, packChecksFor, remainingRoadmap, listPacks } from '../../lib/packs.js';
import { scanRepo, auditRepo } from '../../lib/audit.js';

describe('packs', () => {
  let tmpDir;
  // Packs live outside the repo they score (in real use: .bobby/packs, which the
  // scanner skips) — keeping them apart here stops a pack matching its own YAML.
  let packHome;
  const write = (rel, content) => {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };
  const packDir = () => path.join(packHome, 'my-pack');
  const writePack = (yaml) => {
    fs.mkdirSync(packDir(), { recursive: true });
    fs.writeFileSync(path.join(packDir(), 'pack.yml'), yaml, 'utf8');
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-packs-'));
    packHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-packhome-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(packHome, { recursive: true, force: true });
  });

  describe('loadPack', () => {
    it('loads meta, checks, and roadmap and namespaces check ids by pack', () => {
      writePack(`
id: demo
name: Demo Pack
version: 2.1.0
domain: Testing
checks:
  - id: has-tenant
    area: data
    severity: critical
    title: Rows carry a tenant id
    why: Shared tables without a tenant column leak across customers.
    fix: Add tenant_id and filter every query by it.
    detect:
      grep: "tenant_id"
roadmap:
  - title: Add tenant scoping
    priority: high
    criteria: ["every query filters by tenant"]
`);
      const pack = loadPack(packDir());

      expect(pack.id).toBe('demo');
      expect(pack.version).toBe('2.1.0');
      expect(pack.checks).toHaveLength(1);
      // Namespacing keeps two packs from colliding on a common check name.
      expect(pack.checks[0].id).toBe('demo/has-tenant');
      expect(pack.roadmap[0].criteria).toEqual(['every query filters by tenant']);
    });

    it('defaults security checks to the secure workflow', () => {
      writePack(`
id: demo
name: Demo
checks:
  - id: a
    area: security
    title: Secure thing
    detect: { grep: "x" }
  - id: b
    area: product
    title: Product thing
    detect: { grep: "y" }
`);
      const pack = loadPack(packDir());
      expect(pack.checks.find((c) => c.localId === 'a').workflow).toBe('secure');
      expect(pack.checks.find((c) => c.localId === 'b').workflow).toBe('default');
    });

    it('rejects a malformed pack with a message naming the problem', () => {
      writePack('id: demo\nname: Demo\nchecks:\n  - id: a\n    title: No detect rule\n');
      expect(() => loadPack(packDir())).toThrow(/detect/);

      writePack('id: demo\nname: Demo\nchecks:\n  - id: a\n    title: T\n    area: nonsense\n    detect: { grep: "x" }\n');
      expect(() => loadPack(packDir())).toThrow(/unknown area/);

      writePack('name: Demo\nchecks: []\nroadmap:\n  - description: no title\n');
      expect(() => loadPack(packDir())).toThrow(/title/);
    });

    it('refuses a pack with no pack.yml', () => {
      fs.mkdirSync(packDir(), { recursive: true });
      expect(() => loadPack(packDir())).toThrow(/No pack.yml/);
    });
  });

  describe('evaluateRule', () => {
    const snapshotOf = (files) => {
      for (const [rel, content] of Object.entries(files)) write(rel, content);
      return scanRepo(tmpDir);
    };

    it('matches grep, file, dep, and script rules', () => {
      const s = snapshotOf({
        'package.json': JSON.stringify({ dependencies: { stripe: '^1' }, scripts: { 'test:e2e': 'playwright' } }),
        'db/schema.js': 'export const users = table({ tenant_id: text() });',
      });

      expect(evaluateRule({ grep: 'tenant_id' }, s).pass).toBe(true);
      expect(evaluateRule({ grep: 'nothing_here' }, s).pass).toBe(false);
      expect(evaluateRule({ file: 'db/schema' }, s).pass).toBe(true);
      expect(evaluateRule({ dep: 'stripe' }, s).pass).toBe(true);
      expect(evaluateRule({ dep: ['nope', 'stripe'] }, s).pass).toBe(true);
      expect(evaluateRule({ script: 'test:e2e' }, s).pass).toBe(true);
      expect(evaluateRule({ script: 'missing' }, s).pass).toBe(false);
    });

    it('scopes grep to matching paths with `in`', () => {
      const s = snapshotOf({
        'package.json': '{}',
        'docs/notes.js': 'tenant_id lives in the schema',
        'db/schema.js': 'export const t = 1;',
      });

      expect(evaluateRule({ grep: 'tenant_id', in: 'db' }, s).pass).toBe(false);
      expect(evaluateRule({ grep: 'tenant_id', in: 'docs' }, s).pass).toBe(true);
    });

    it('composes with anyOf, allOf, and none', () => {
      const s = snapshotOf({
        'package.json': JSON.stringify({ dependencies: { stripe: '^1' } }),
        'app.js': 'createCheckoutSession();',
      });

      expect(evaluateRule({ anyOf: [{ grep: 'nope' }, { dep: 'stripe' }] }, s).pass).toBe(true);
      expect(evaluateRule({ anyOf: [{ grep: 'nope' }, { dep: 'missing' }] }, s).pass).toBe(false);
      expect(evaluateRule({ allOf: [{ dep: 'stripe' }, { grep: 'createCheckoutSession' }] }, s).pass).toBe(true);
      expect(evaluateRule({ allOf: [{ dep: 'stripe' }, { grep: 'missing' }] }, s).pass).toBe(false);
      // `none` is how a pack asserts something must NOT be there.
      expect(evaluateRule({ none: { grep: 'process.env.SECRET' } }, s).pass).toBe(true);
      expect(evaluateRule({ none: { grep: 'createCheckoutSession' } }, s).pass).toBe(false);
    });

    it('never throws on a broken regex or unknown rule', () => {
      const s = snapshotOf({ 'package.json': '{}' });
      expect(evaluateRule({ grep: '([unclosed' }, s).pass).toBe(false);
      expect(evaluateRule({ mystery: true }, s).pass).toBe(false);
      expect(evaluateRule(null, s).pass).toBe(false);
    });
  });

  describe('audit integration', () => {
    it('adds pack checks on top of the baseline without replacing it', () => {
      write('package.json', '{"name":"x"}');
      writePack(`
id: demo
name: Demo
checks:
  - id: tenant-scoping
    area: data
    severity: critical
    title: Rows carry a tenant id
    detect: { grep: "tenant_id" }
`);
      const pack = loadPack(packDir());

      const baseline = auditRepo(tmpDir);
      const withPack = auditRepo(tmpDir, { packs: [pack] });

      const ids = [...withPack.findings, ...withPack.passed].map((c) => c.id);
      expect(ids).toContain('demo/tenant-scoping');
      // Baseline checks are still scored.
      expect(ids).toContain('automated-tests');
      expect(withPack.byArea.data.total).toBeGreaterThan(baseline.byArea.data.total);
    });

    it('honours a pack check\'s appliesWhen', () => {
      write('package.json', '{"name":"x"}');
      write('src/app.js', 'const x = 1;');
      writePack(`
id: demo
name: Demo
checks:
  - id: only-for-stripe
    area: product
    title: Needs Stripe
    appliesWhen: { dep: "stripe" }
    detect: { grep: "checkout" }
`);
      const result = auditRepo(tmpDir, { packs: [loadPack(packDir())] });
      expect(result.skipped.map((s) => s.id)).toContain('demo/only-for-stripe');
    });

    it('packChecksFor produces runnable checks', () => {
      writePack(`
id: demo
name: Demo
checks:
  - id: a
    area: product
    title: T
    detect: { grep: "hello" }
`);
      write('src/x.js', 'hello world');
      const checks = packChecksFor([loadPack(packDir())]);
      const snapshot = scanRepo(tmpDir);

      expect(checks).toHaveLength(1);
      expect(checks[0].run(snapshot).pass).toBe(true);
    });
  });

  describe('remainingRoadmap', () => {
    it('drops items the repo already satisfies', () => {
      write('package.json', '{"name":"x"}');
      write('db/schema.js', 'users table with tenant_id');
      writePack(`
id: demo
name: Demo
roadmap:
  - title: Add tenancy
    skipWhen: { grep: "tenant_id" }
  - title: Add billing
    skipWhen: { grep: "stripe" }
  - title: Always needed
`);
      const remaining = remainingRoadmap(loadPack(packDir()), scanRepo(tmpDir));

      expect(remaining.map((r) => r.title)).toEqual(['Add billing', 'Always needed']);
    });
  });

  describe('built-in packs', () => {
    it('ships a valid saas-starter pack', () => {
      const pack = listPacks().find((p) => p.id === 'saas-starter');

      expect(pack).toBeTruthy();
      expect(pack.checks.length).toBeGreaterThan(3);
      expect(pack.roadmap.length).toBeGreaterThan(2);
      // Every shipped check must be runnable, not just parseable.
      write('package.json', '{"name":"x"}');
      const snapshot = scanRepo(tmpDir);
      for (const check of packChecksFor([pack])) {
        expect(() => check.run(snapshot)).not.toThrow();
      }
    });
  });
});
