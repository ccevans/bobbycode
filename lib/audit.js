// lib/audit.js
// Production-readiness audit: scores a codebase against the guards that separate
// "it works on my machine" from "I can put customers on this".
//
// Every check is deterministic and local — no model calls, no network. A check
// either finds evidence in the repo or it doesn't, so two runs on the same tree
// always agree and the score can be trusted as a baseline to improve against.
import fs from 'fs';
import path from 'path';
import { packChecksFor } from './packs.js';

export const AREAS = {
  security: 'Security',
  reliability: 'Reliability',
  operability: 'Operability',
  'change-safety': 'Change safety',
  // Packs add domain dimensions: is the product actually complete, and is the
  // data model right for this kind of business?
  product: 'Product completeness',
  data: 'Data & tenancy',
  revenue: 'Revenue',
};

const SEVERITY_WEIGHT = { critical: 5, high: 3, medium: 2, low: 1 };

/** Files that are almost certainly not the app: deps, build output, VCS. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.venv', 'venv', '__pycache__', '.bobby', 'vendor', 'target', '.turbo',
]);

// Greppable text: code, but also the schema, config, and docs files where the
// evidence for a check often lives (a tenant column in .sql, a restore
// procedure in .md, a service definition in .yml).
const SOURCE_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java', '.php',
  '.sql', '.prisma', '.graphql', '.md', '.json', '.yml', '.yaml', '.toml', '.sh', '.env.example',
]);

/**
 * Reads the repo once so checks can query a snapshot instead of hitting the
 * disk each — an audit of a large tree stays fast and every check sees the
 * same picture.
 */
export function scanRepo(root, { maxFiles = 4000 } = {}) {
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 8 || files.length >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.env.example') {
        if (!['.gitignore', '.dockerignore'].includes(entry.name)) continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        files.push(path.relative(root, full));
      }
    }
  };
  walk(root, 0);

  const pkgPath = path.join(root, 'package.json');
  let pkg = null;
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
  }

  return {
    root,
    files,
    pkg,
    scripts: (pkg && pkg.scripts) || {},
    deps: { ...((pkg && pkg.dependencies) || {}), ...((pkg && pkg.devDependencies) || {}) },
    has: (rel) => fs.existsSync(path.join(root, rel)),
    /** Files matching a regex against their repo-relative path. */
    match: (re) => files.filter((f) => re.test(f)),
    /** True when any source file's contents match — the "is this wired up?" test. */
    grep(re, { limit = 1200, filter = null } = {}) {
      const candidates = files
        .filter((f) => SOURCE_EXT.has(path.extname(f)))
        .filter((f) => (filter ? filter.test(f) : true))
        .slice(0, limit);
      for (const rel of candidates) {
        try {
          if (re.test(fs.readFileSync(path.join(root, rel), 'utf8'))) return rel;
        } catch { /* unreadable file is not evidence */ }
      }
      return null;
    },
  };
}

/**
 * The checklist. Each check reports `pass` when it finds evidence of the guard.
 * `applies` keeps a check from firing on a repo where it makes no sense (no
 * point demanding webhook idempotency from a project with no webhooks).
 */
export const CHECKS = [
  {
    id: 'secrets-not-committed',
    area: 'security',
    severity: 'critical',
    title: 'No committed secrets or .env files',
    why: 'A key in git history is a key you must rotate, and history is forever.',
    fix: 'Remove committed env files, add them to .gitignore, and rotate anything exposed.',
    run: (s) => {
      const committed = s.match(/(^|\/)\.env(\.|$)/).filter((f) => !/\.example$|\.sample$|\.template$/.test(f));
      const ignored = s.has('.gitignore') && /\.env/.test(fs.readFileSync(path.join(s.root, '.gitignore'), 'utf8'));
      return {
        pass: committed.length === 0 && ignored,
        detail: committed.length > 0
          ? `${committed.length} env file(s) present in the tree: ${committed.slice(0, 3).join(', ')}`
          : (ignored ? 'no env files tracked and .gitignore covers them' : '.gitignore does not mention .env'),
      };
    },
  },
  {
    id: 'security-headers',
    area: 'security',
    severity: 'high',
    title: 'Security headers / CSP are set',
    why: 'Without CSP and frame protection, one injected script or a clickjacked page is game over.',
    fix: 'Set CSP, X-Frame-Options, nosniff, and Referrer-Policy centrally (middleware or server config).',
    applies: (s) => s.pkg !== null,
    run: (s) => {
      const hit = s.grep(/content-security-policy|helmet\(|X-Frame-Options|frame-ancestors/i);
      return { pass: Boolean(hit) || Boolean(s.deps.helmet), detail: hit ? `set in ${hit}` : 'no CSP or frame protection found' };
    },
  },
  {
    id: 'rate-limiting',
    area: 'security',
    severity: 'high',
    title: 'Rate limiting on auth or public endpoints',
    why: 'Unlimited login attempts mean credential stuffing, and unlimited anything means an unbounded bill.',
    fix: 'Add a limiter on login, signup, password reset, and any expensive public route; return 429 with Retry-After.',
    applies: (s) => Boolean(s.grep(/login|signin|sign-in|auth|password/i)),
    run: (s) => {
      const hit = s.grep(/rate-?limit|rateLimit|429|Retry-After|throttle/i);
      return { pass: Boolean(hit), detail: hit ? `found in ${hit}` : 'no rate limiting found near auth routes' };
    },
  },
  {
    id: 'input-validation',
    area: 'security',
    severity: 'high',
    title: 'Input is validated at the boundary',
    why: 'Handlers that trust request bodies are how injection and corrupt data get in.',
    fix: 'Validate and coerce every request body/query with a schema at the edge of the app.',
    applies: (s) => Boolean(s.pkg),
    run: (s) => {
      const lib = ['zod', 'yup', 'joi', 'valibot', 'ajv', 'class-validator', 'superstruct', 'pydantic'].find((d) => s.deps[d]);
      const hand = s.grep(/typeof .*!==|Number\.isInteger|\.safeParse\(|validate\w*\(/);
      return { pass: Boolean(lib || hand), detail: lib ? `${lib} in dependencies` : (hand ? `hand-rolled checks in ${hand}` : 'no validation library or boundary checks found') };
    },
  },
  {
    id: 'dependency-audit',
    area: 'security',
    severity: 'medium',
    title: 'Dependency vulnerability scanning',
    why: 'Most breaches walk in through a dependency you never chose directly.',
    fix: 'Run `npm audit` (or Dependabot/Renovate) in CI and fail on high severity.',
    applies: (s) => Boolean(s.pkg),
    run: (s) => {
      const ci = s.match(/^\.github\/(workflows|dependabot)/);
      const inCi = ci.some((f) => {
        try { return /audit|dependabot|snyk|renovate/i.test(fs.readFileSync(path.join(s.root, f), 'utf8')); } catch { return false; }
      });
      return { pass: inCi || s.has('.github/dependabot.yml'), detail: inCi ? 'audit or bot configured' : 'no dependency scanning in CI' };
    },
  },
  {
    id: 'config-validation',
    area: 'reliability',
    severity: 'high',
    title: 'Configuration is validated at startup',
    why: 'A missing env var should stop a deploy, not surface as `undefined` in a payment handler at 3am.',
    fix: 'Declare every env var in one typed spec and fail fast at boot when production config is wrong.',
    applies: (s) => Boolean(s.grep(/process\.env|os\.environ|ENV\[/)),
    run: (s) => {
      const hit = s.grep(/envSchema|ENV_SPEC|validateEnv|checkEnv|envalid|t3-env|parseEnv/i);
      return { pass: Boolean(hit) || Boolean(s.deps.envalid || s.deps['@t3-oss/env-nextjs']), detail: hit ? `validated in ${hit}` : 'env vars are read raw with no validation' };
    },
  },
  {
    id: 'error-handling',
    area: 'reliability',
    severity: 'medium',
    title: 'Errors are handled, not swallowed',
    why: 'Empty catch blocks turn a loud failure into silent data loss.',
    fix: 'Handle or rethrow in every catch; add an error boundary/handler at the top level.',
    applies: (s) => Boolean(s.pkg),
    run: (s) => {
      const swallowed = s.grep(/catch\s*\([^)]*\)\s*\{\s*\}/);
      return { pass: !swallowed, detail: swallowed ? `empty catch block in ${swallowed}` : 'no empty catch blocks found' };
    },
  },
  {
    id: 'timeouts',
    area: 'reliability',
    severity: 'medium',
    title: 'Outbound calls have timeouts',
    why: 'A hung third-party call with no timeout takes your app down with it.',
    fix: 'Set explicit timeouts (and retries where safe) on every outbound HTTP/database call.',
    applies: (s) => Boolean(s.grep(/fetch\(|axios|got\(|requests\.get|http\.request/)),
    run: (s) => {
      const hit = s.grep(/timeout|AbortSignal\.timeout|AbortController|signal:/i);
      return { pass: Boolean(hit), detail: hit ? `timeouts set in ${hit}` : 'outbound calls found with no timeout' };
    },
  },
  {
    id: 'webhook-idempotency',
    area: 'reliability',
    severity: 'high',
    title: 'Webhooks verify signatures and are idempotent',
    why: 'Providers retry. An unverified or non-idempotent webhook means forged or double-applied money events.',
    fix: 'Verify the signature on every webhook and make handlers safe to run twice.',
    applies: (s) => Boolean(s.grep(/webhook/i)),
    run: (s) => {
      const sig = s.grep(/constructEvent|verif\w*Signature|hmac|signature/i, { filter: /webhook|stripe|hook/i });
      return { pass: Boolean(sig), detail: sig ? `signature verified in ${sig}` : 'webhook handler with no signature verification' };
    },
  },
  {
    id: 'structured-logging',
    area: 'operability',
    severity: 'medium',
    title: 'Structured logging',
    why: 'When production breaks you get one shot at the logs; `console.log` strings are not searchable.',
    fix: 'Emit JSON logs with levels through one logger module.',
    applies: (s) => Boolean(s.pkg),
    run: (s) => {
      const lib = ['pino', 'winston', 'bunyan', 'loglevel', 'structlog'].find((d) => s.deps[d]);
      // A project's own logger counts: a module named log/logger that emits
      // levelled, structured lines is the guard — the library is incidental.
      const own = s.grep(/\b(log|logger)\.(debug|info|warn|error)\(|["']level["']\s*:/)
        || (s.match(/(^|\/)(log|logger|logging)\.(js|ts|py|rb|go)$/)[0] || null);
      return { pass: Boolean(lib || own), detail: lib ? `${lib} in dependencies` : (own ? `logger used in ${own}` : 'only ad-hoc console logging found') };
    },
  },
  {
    id: 'request-correlation',
    area: 'operability',
    severity: 'low',
    title: 'Requests carry a correlation id',
    why: 'Without a request id you cannot follow one user\'s failure across services or log lines.',
    fix: 'Generate or reuse an x-request-id per request, attach it to every log line, echo it on the response.',
    applies: (s) => Boolean(s.grep(/express|fastify|next|http\.createServer|flask|django/i)),
    run: (s) => {
      const hit = s.grep(/x-request-id|requestId|correlationId|traceId/i);
      return { pass: Boolean(hit), detail: hit ? `correlation id in ${hit}` : 'no request correlation id found' };
    },
  },
  {
    id: 'secret-redaction',
    area: 'operability',
    severity: 'high',
    title: 'Secrets and PII are redacted from logs',
    why: 'Logged tokens and emails leak through every downstream log sink and backup.',
    fix: 'Redact secret-shaped fields and personal data in the logger itself, not at each call site.',
    applies: (s) => Boolean(s.grep(/logger\.|console\.(log|error|info)/)),
    run: (s) => {
      const hit = s.grep(/redact|\*\*\*|maskS|sanitiz/i);
      return { pass: Boolean(hit), detail: hit ? `redaction in ${hit}` : 'no log redaction found' };
    },
  },
  {
    id: 'health-check',
    area: 'operability',
    severity: 'medium',
    title: 'Health/readiness endpoint',
    why: 'Your platform needs a truthful way to ask "is this instance serving?" before sending traffic.',
    fix: 'Expose /health that checks real dependencies, and point the platform health check at it.',
    applies: (s) => Boolean(s.grep(/express|fastify|next|http\.createServer|flask|django/i)),
    run: (s) => {
      const hit = s.grep(/['"`]\/(health|healthz|readyz|ping|status)['"`]/) || (s.match(/health/i).length > 0 ? s.match(/health/i)[0] : null);
      return { pass: Boolean(hit), detail: hit ? `health route in ${hit}` : 'no health or readiness endpoint found' };
    },
  },
  {
    id: 'automated-tests',
    area: 'change-safety',
    severity: 'critical',
    title: 'Automated tests exist',
    why: 'Without tests every change is a gamble, and agents have nothing to prove their work against.',
    fix: 'Add tests for the critical paths first: auth, money, and data writes.',
    run: (s) => {
      const files = s.match(/(^|\/)(test|tests|spec|__tests__)\/|\.(test|spec)\.[jt]sx?$|_test\.(py|go)$/);
      return { pass: files.length > 0, detail: files.length > 0 ? `${files.length} test file(s)` : 'no test files found' };
    },
  },
  {
    id: 'test-command',
    area: 'change-safety',
    severity: 'high',
    title: 'A single command runs the tests',
    why: 'If the suite is not one command, CI cannot run it and neither will you.',
    fix: 'Wire a `test` script that runs the whole suite and exits non-zero on failure.',
    applies: (s) => Boolean(s.pkg),
    run: (s) => {
      const t = s.scripts.test;
      const real = t && !/no test specified|exit 1/.test(t);
      return { pass: Boolean(real), detail: real ? `npm test → ${t}` : 'no usable test script in package.json' };
    },
  },
  {
    id: 'ci-pipeline',
    area: 'change-safety',
    severity: 'high',
    title: 'CI runs on every push',
    why: 'Gates that only run on your laptop are gates that get skipped on the day it matters.',
    fix: 'Add a CI workflow that installs, builds, and runs the tests on push and pull request.',
    run: (s) => {
      const wf = s.match(/^\.github\/workflows\/.*\.ya?ml$/);
      const other = ['.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'Jenkinsfile'].filter((f) => s.has(f));
      return { pass: wf.length > 0 || other.length > 0, detail: wf.length > 0 ? `${wf.length} workflow(s)` : (other.length > 0 ? other[0] : 'no CI configuration found') };
    },
  },
  {
    id: 'typecheck-or-lint',
    area: 'change-safety',
    severity: 'medium',
    title: 'Static analysis (typecheck or lint)',
    why: 'The cheapest bugs to fix are the ones a compiler finds before review.',
    fix: 'Add a typecheck or lint script and run it in CI.',
    applies: (s) => Boolean(s.pkg),
    run: (s) => {
      const has = Boolean(s.scripts.lint || s.scripts.typecheck || s.scripts['check-types'] || s.has('tsconfig.json') || s.has('eslint.config.js') || s.has('.eslintrc.json'));
      return { pass: has, detail: has ? 'typecheck or lint configured' : 'no lint or typecheck configured' };
    },
  },
  {
    id: 'readme-runbook',
    area: 'change-safety',
    severity: 'low',
    title: 'README explains how to run and deploy',
    why: 'Future-you (or a buyer, or a contractor) needs to start this app without archaeology.',
    fix: 'Document setup, required env vars, how to run tests, and how to deploy.',
    run: (s) => {
      const readme = s.match(/^README(\.md)?$/i)[0];
      if (!readme) return { pass: false, detail: 'no README' };
      const text = fs.readFileSync(path.join(s.root, readme), 'utf8');
      const covered = /install|setup/i.test(text) && /(deploy|production)/i.test(text);
      return { pass: covered, detail: covered ? 'covers setup and deploy' : 'README is missing setup or deploy instructions' };
    },
  },
];

/**
 * Runs the checklist. Returns findings (failed checks), passes, and a 0-100
 * score weighted by severity — a critical gap costs five times a cosmetic one.
 */
export function auditRepo(root, { checks = CHECKS, packs = [] } = {}) {
  const snapshot = scanRepo(root);
  // Pack checks are appended, never replace the baseline: a domain pack tells
  // you what a multi-tenant SaaS needs *on top of* being a sound codebase.
  if (packs.length > 0) checks = [...checks, ...packChecksFor(packs)];
  const findings = [];
  const passed = [];
  const skipped = [];

  for (const check of checks) {
    if (check.applies && !safe(() => check.applies(snapshot), false)) {
      skipped.push({ id: check.id, title: check.title });
      continue;
    }
    const result = safe(() => check.run(snapshot), { pass: false, detail: 'check could not run' });
    const entry = { ...pick(check), detail: result.detail };
    if (result.pass) passed.push(entry); else findings.push(entry);
  }

  const scored = [...findings, ...passed];
  const total = scored.reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0);
  const earned = passed.reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0);
  const score = total === 0 ? 100 : Math.round((earned / total) * 100);

  const byArea = {};
  for (const key of Object.keys(AREAS)) {
    const inArea = scored.filter((c) => c.area === key);
    const passedInArea = inArea.filter((c) => passed.some((p) => p.id === c.id));
    const areaTotal = inArea.reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0);
    const areaEarned = passedInArea.reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0);
    byArea[key] = {
      label: AREAS[key],
      score: areaTotal === 0 ? null : Math.round((areaEarned / areaTotal) * 100),
      passed: passedInArea.length,
      total: inArea.length,
    };
  }

  findings.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
  return { score, grade: gradeFor(score), findings, passed, skipped, byArea, fileCount: snapshot.files.length };
}

export function gradeFor(score) {
  if (score >= 90) return 'production-ready';
  if (score >= 70) return 'nearly there';
  if (score >= 40) return 'needs hardening';
  return 'prototype';
}

/** Turns a finding into ticket fields, so `--tickets` seeds work you can run. */
export function findingToTicket(finding) {
  return {
    title: finding.title.replace(/^No /, 'Add ').replace(/ (exist|are set|is set)$/, ''),
    type: 'improvement',
    priority: finding.severity === 'critical' ? 'critical' : finding.severity === 'high' ? 'high' : 'medium',
    area: finding.area,
    // Security work gets the workflow with a security stage; everything else
    // rides the default plan → build → review → test.
    workflow: finding.area === 'security' ? 'secure' : 'default',
    description: [
      `**Gap found by \`bobby audit\`:** ${finding.title}`,
      '',
      `**Why it matters:** ${finding.why}`,
      '',
      `**What the audit saw:** ${finding.detail}`,
      '',
      `**Suggested fix:** ${finding.fix}`,
    ].join('\n'),
    criteria: [
      finding.fix,
      'The guard is covered by a test or an executable check, not just described.',
      'Existing behaviour still works: full test suite and any project checks pass.',
      `Re-running \`bobby audit\` no longer reports "${finding.title}".`,
    ],
  };
}

function pick(check) {
  return { id: check.id, area: check.area, severity: check.severity, title: check.title, why: check.why, fix: check.fix };
}

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
