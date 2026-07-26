// lib/packs.js
// Packs are what turn Bobby from "generic guards" into "you are building a
// multi-tenant SaaS, and here is what finished looks like".
//
// A pack is a directory that knows a domain: the checks that domain demands,
// the roadmap to a complete product, and optional scaffolds to skip the boring
// parts. Packs are data, not code — declarative so they are safe to install
// from anywhere and cheap to write without touching the CLI.
//
//   my-pack/
//     pack.yml        meta + checks + roadmap
//     scaffolds/      optional files copied in by `bobby pack apply`
//
// Discovery order (later wins on id collision): built-ins, then ~/.bobby/packs,
// then .bobby/packs inside the project.
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BUILT_IN_PACKS_DIR = path.join(__dirname, '..', 'packs');
export const GLOBAL_PACKS_DIR = path.join(os.homedir(), '.bobby', 'packs');
export const PROJECT_PACKS_DIR = '.bobby/packs';

const VALID_AREAS = ['security', 'reliability', 'operability', 'change-safety', 'product', 'data'];
const VALID_SEVERITY = ['critical', 'high', 'medium', 'low'];

/** Every directory Bobby looks in for packs, lowest precedence first. */
export function packSearchPaths(root = null) {
  const paths = [BUILT_IN_PACKS_DIR, GLOBAL_PACKS_DIR];
  if (root) paths.push(path.join(root, PROJECT_PACKS_DIR));
  return paths;
}

export function listPacks(root = null) {
  const byId = new Map();
  for (const dir of packSearchPaths(root)) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pack = safeLoad(path.join(dir, entry.name));
      if (pack) byId.set(pack.id, pack);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function findPack(id, root = null) {
  return listPacks(root).find((p) => p.id === id) || null;
}

/** Reads and validates one pack directory. Throws with a fixable message. */
export function loadPack(dir) {
  const file = ['pack.yml', 'pack.yaml'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`No pack.yml in ${dir}`);

  let raw;
  try { raw = YAML.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new Error(`${path.basename(dir)}/pack.yml is not valid YAML: ${e.message}`);
  }
  if (!raw || typeof raw !== 'object') throw new Error(`${path.basename(dir)}/pack.yml is empty`);

  const id = raw.id || path.basename(dir);
  if (!raw.name) throw new Error(`Pack "${id}" is missing a name`);

  const checks = (raw.checks || []).map((c, i) => validateCheck(c, id, i));
  const roadmap = (raw.roadmap || []).map((r, i) => validateRoadmapItem(r, id, i));

  return {
    id,
    name: raw.name,
    description: raw.description || '',
    version: raw.version || '0.0.0',
    // What this pack is FOR — shown in listings so the buyer knows which to reach for.
    domain: raw.domain || '',
    appliesWhen: raw.appliesWhen || null,
    checks,
    roadmap,
    dir,
    scaffoldsDir: fs.existsSync(path.join(dir, 'scaffolds')) ? path.join(dir, 'scaffolds') : null,
  };
}

function safeLoad(dir) {
  try { return loadPack(dir); } catch { return null; }
}

function validateCheck(check, packId, index) {
  const where = `pack "${packId}" check #${index + 1}`;
  if (!check.id) throw new Error(`${where} is missing an id`);
  if (!check.title) throw new Error(`${where} (${check.id}) is missing a title`);
  const area = check.area || 'product';
  if (!VALID_AREAS.includes(area)) throw new Error(`${where} (${check.id}) has unknown area "${area}" — use one of: ${VALID_AREAS.join(', ')}`);
  const severity = check.severity || 'medium';
  if (!VALID_SEVERITY.includes(severity)) throw new Error(`${where} (${check.id}) has unknown severity "${severity}"`);
  if (!check.detect) throw new Error(`${where} (${check.id}) is missing a detect rule`);
  return {
    id: `${packId}/${check.id}`,
    localId: check.id,
    pack: packId,
    area,
    severity,
    title: check.title,
    why: check.why || '',
    fix: check.fix || '',
    detect: check.detect,
    appliesWhen: check.appliesWhen || null,
    workflow: check.workflow || (area === 'security' ? 'secure' : 'default'),
  };
}

function validateRoadmapItem(item, packId, index) {
  const where = `pack "${packId}" roadmap #${index + 1}`;
  if (!item.title) throw new Error(`${where} is missing a title`);
  return {
    title: item.title,
    description: item.description || '',
    criteria: item.criteria || [],
    priority: item.priority || 'medium',
    area: item.area || '',
    workflow: item.workflow || 'default',
    // Roadmap items can be skipped when the repo already has the thing.
    skipWhen: item.skipWhen || null,
  };
}

/**
 * Evaluates a declarative rule against a repo snapshot (see lib/audit.js).
 * Rules are intentionally small: a pack author describes evidence, not logic.
 *
 *   detect:
 *     anyOf:
 *       - grep: "tenant_id"
 *         in: "migrations|schema"
 *       - dep: "@casl/ability"
 *       - file: "lib/tenant"
 *       - script: "test:e2e"
 */
export function evaluateRule(rule, snapshot) {
  if (!rule) return { pass: false, detail: 'no rule' };

  if (rule.anyOf) {
    for (const sub of rule.anyOf) {
      const r = evaluateRule(sub, snapshot);
      if (r.pass) return r;
    }
    return { pass: false, detail: describeMiss(rule.anyOf) };
  }

  if (rule.allOf) {
    const misses = [];
    for (const sub of rule.allOf) {
      const r = evaluateRule(sub, snapshot);
      if (!r.pass) misses.push(r.detail);
    }
    return misses.length === 0
      ? { pass: true, detail: 'all required evidence present' }
      : { pass: false, detail: misses.join('; ') };
  }

  if (rule.none) {
    const r = evaluateRule(rule.none, snapshot);
    return r.pass
      ? { pass: false, detail: `found what should not be there (${r.detail})` }
      : { pass: true, detail: 'absent, as required' };
  }

  if (rule.grep) {
    const re = toRegExp(rule.grep);
    if (!re) return { pass: false, detail: `invalid grep pattern: ${rule.grep}` };
    const filter = rule.in ? toRegExp(rule.in) : null;
    const hit = snapshot.grep(re, filter ? { filter } : {});
    return hit ? { pass: true, detail: `found in ${hit}` } : { pass: false, detail: `no match for /${rule.grep}/${rule.in ? ` in ${rule.in}` : ''}` };
  }

  if (rule.file) {
    const re = toRegExp(rule.file);
    const hits = re ? snapshot.match(re) : [];
    return hits.length > 0 ? { pass: true, detail: hits[0] } : { pass: false, detail: `no file matching ${rule.file}` };
  }

  if (rule.dep) {
    const deps = Array.isArray(rule.dep) ? rule.dep : [rule.dep];
    const found = deps.find((d) => snapshot.deps[d]);
    return found ? { pass: true, detail: `${found} in dependencies` } : { pass: false, detail: `none of: ${deps.join(', ')}` };
  }

  if (rule.script) {
    const has = Boolean(snapshot.scripts[rule.script]);
    return has ? { pass: true, detail: `npm script "${rule.script}"` } : { pass: false, detail: `no "${rule.script}" script` };
  }

  return { pass: false, detail: 'unrecognised rule' };
}

function describeMiss(subs) {
  const parts = subs.map((s) => s.grep ? `/${s.grep}/` : s.dep ? `dep ${Array.isArray(s.dep) ? s.dep.join('|') : s.dep}` : s.file ? `file ${s.file}` : s.script ? `script ${s.script}` : 'rule');
  return `none found: ${parts.slice(0, 3).join(', ')}${parts.length > 3 ? `, +${parts.length - 3} more` : ''}`;
}

function toRegExp(pattern) {
  try { return new RegExp(pattern, 'i'); } catch { return null; }
}

/** Pack checks in the shape lib/audit.js runs. */
export function packChecksFor(packs) {
  return packs.flatMap((pack) => pack.checks.map((check) => ({
    id: check.id,
    area: check.area,
    severity: check.severity,
    title: check.title,
    why: check.why,
    fix: check.fix,
    pack: pack.id,
    packName: pack.name,
    workflow: check.workflow,
    applies: check.appliesWhen ? (s) => evaluateRule(check.appliesWhen, s).pass : undefined,
    run: (s) => evaluateRule(check.detect, s),
  })));
}

/** Roadmap items still missing from this repo — the path to "finished". */
export function remainingRoadmap(pack, snapshot) {
  return pack.roadmap.filter((item) => !(item.skipWhen && evaluateRule(item.skipWhen, snapshot).pass));
}
