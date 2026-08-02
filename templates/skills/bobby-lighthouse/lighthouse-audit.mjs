#!/usr/bin/env node
/**
 * Four-pillar audit: read Performance, Accessibility, Best Practices and SEO across
 * the page TEMPLATES, identify gaps, and emit a machine-readable report a Bobby agent
 * turns into tickets.
 *
 * This is the gap-finding layer. `perf-lighthouse.mjs` measures and reports; it never
 * says what is wrong. This one classifies.
 *
 * ── Design rules, each one bought with a wasted run ──────────────────────────────
 *
 * 1. TICKET ON FAILING AUDITS, NEVER ON A SCORE.
 *    A score is an aggregate of noisy timings: mobile performance legitimately ranged
 *    83 to 95 on one URL in one sitting. A failing audit is a specific assertion about
 *    specific DOM nodes and does not move without a code change. So scores are reported
 *    for context and are NEVER the basis of a ticket. Only `gaps` become tickets.
 *
 * 2. WEIGHT BY PAGE COUNT, NOT BY SCORE.
 *    A 2-point accessibility gap on a template behind 523 URLs outranks a 10-point gap
 *    on one behind 9. The sitemap supplies the counts.
 *
 * 3. DEDUPE AGAINST EXISTING TICKETS.
 *    The failure mode of any auditor is re-filing what is already open. Every gap is
 *    checked against .bobby/tickets by audit id AND template before it is proposed.
 *
 * 4. PROVE THE CORPUS IS REAL.
 *    A sweep that measured an empty URL still printed "done" once. Every report is
 *    checked so its requestedUrl matches what was asked for, and a run with zero
 *    audited pages is a hard failure, not an empty pass.
 *
 * Usage:
 *   node scripts/audit-four-pillars.mjs                    # production, mobile, 3 runs
 *   node scripts/audit-four-pillars.mjs --runs=1           # quick look
 *   node scripts/audit-four-pillars.mjs --desktop
 *   node scripts/audit-four-pillars.mjs --url=http://localhost:3000
 *   node scripts/audit-four-pillars.mjs --page=directory   # one template
 *
 * Exit codes: 0 always. This is an analysis tool, not a gate. `perf:budget` gates.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.lighthouse');
/*
 * Walk up looking for .bobby/tickets rather than assuming it sits one level above.
 * Assuming `ROOT/../.bobby` is correct when the app is a subdirectory of the Bobby
 * project and WRONG inside a git worktree, where it silently resolved to nothing,
 * found zero tickets, and made every single gap look brand new. A dedupe that
 * quietly matches nothing is worse than no dedupe: it looks like it worked.
 */
function findTicketsDir(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, '.bobby', 'tickets');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
/*
 * No hardcoded site. Resolution order: --url, then BOBBY_AUDIT_URL, then
 * `lighthouse.base` in .bobbyrc.yml. A default pointing at one project's domain is
 * exactly what makes a tool unusable by anyone else.
 */
const DEFAULT_BASE = process.env.BOBBY_AUDIT_URL || null;

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/*
 * Real findings about somebody else's infrastructure. Filing these wastes a ticket and
 * teaches people the report is noise. Each carries a reason so a future reader can
 * challenge the suppression rather than trust it.
 */
const NOT_OURS = [
  { id: 'uses-long-cache-ttl', urlIncludes: '/_vercel/', why: 'Vercel sets that header, we cannot' },
  { id: 'errors-in-console', urlIncludes: '/_vercel/speed-insights', why: 'Vercel-only endpoint, 404s locally' },
];

function isNotOurs(auditId, samples) {
  return NOT_OURS.find((n) => n.id === auditId && samples.some((s) => s.includes(n.urlIncludes)));
}

/*
 * TEMPLATE DISCOVERY
 *
 * A template is a group of URLs rendered by the same code. Auditing one URL per
 * template and weighting by how many live URLs it covers is the whole point: it is
 * why a 2-point gap on a 500-page section outranks a 10-point gap on the homepage.
 *
 * Templates are resolved in this order, so this works on any project:
 *   1. `.bobbyrc.yml` under `lighthouse.pages` if you want to name them explicitly
 *   2. auto-discovery from /sitemap.xml, grouping URLs by their first path segment
 *   3. the homepage alone, if there is no sitemap
 *
 * Config shape:
 *   lighthouse:
 *     base: https://example.com
 *     pages:
 *       - { name: product, path: /products/widget, match: /products/ }
 *       - { name: article, path: /blog/hello,      match: /blog/ }
 */
const MIN_GROUP = 2; // a "template" needs at least this many live URLs to be worth sampling
const MAX_TEMPLATES = 8; // keep a default run to a sane wall-clock

export function readBaseFromConfig(root) {
  for (const dir of [root, path.join(root, '..'), path.join(root, '..', '..')]) {
    const rc = path.join(dir, '.bobbyrc.yml');
    if (!existsSync(rc)) continue;
    const m = readFileSync(rc, 'utf8').match(/^lighthouse:\s*$[\s\S]*?^\s+base:\s*(\S+)/m);
    if (m) return m[1].replace(/\/$/, '');
  }
  return null;
}

function pagesFromConfig(root) {
  const rc = path.join(root, '..', '.bobbyrc.yml');
  if (!existsSync(rc)) return null;
  const text = readFileSync(rc, 'utf8');
  const block = text.match(/^lighthouse:\s*$([\s\S]*?)(?=^\S|\Z)/m);
  if (!block) return null;
  const pages = [];
  for (const line of block[1].split('\n')) {
    const m = line.match(/name:\s*([^,}\s]+).*?path:\s*([^,}\s]+)(?:.*?match:\s*([^,}\s]+))?/);
    if (m) pages.push({ name: m[1], path: m[2], sitemapMatch: m[3] || null });
  }
  return pages.length ? pages : null;
}

/**
 * Group sitemap URLs by first path segment and sample the largest groups. The homepage
 * is always included. This is what makes the tool useful on a project nobody configured.
 */
export function pagesFromSitemap(locs) {
  const groups = new Map();
  for (const loc of locs) {
    let seg;
    try {
      seg = new URL(loc).pathname.split('/').filter(Boolean)[0];
    } catch {
      continue;
    }
    if (!seg) continue;
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg).push(loc);
  }
  const picked = [{ name: 'homepage', path: '/', sitemapMatch: null, count: 1 }];
  const ranked = [...groups.entries()].filter(([, u]) => u.length >= MIN_GROUP).sort((a, b) => b[1].length - a[1].length);
  for (const [seg, urls] of ranked.slice(0, MAX_TEMPLATES - 1)) {
    picked.push({ name: seg, path: new URL(urls[0]).pathname, sitemapMatch: `/${seg}/`, count: urls.length });
  }
  return picked;
}

function parseArgs(argv) {
  const a = { base: DEFAULT_BASE, runs: 3, desktop: false, only: null, ticketsDir: null };
  for (const raw of argv) {
    const [k, v] = raw.replace(/^--/, '').split('=');
    if (k === 'url') a.base = v.replace(/\/$/, '');
    else if (k === 'runs') a.runs = Math.max(1, Number(v) || 3);
    else if (k === 'desktop') a.desktop = true;
    else if (k === 'page') a.only = v;
    else if (k === 'tickets') a.ticketsDir = v;
  }
  return a;
}

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const median = (vals) => {
  const s = [...vals].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const spread = (vals) => (vals.length < 2 ? 0 : Math.max(...vals) - Math.min(...vals));

/**
 * Resolve the templates to audit and how many live URLs each covers.
 * Config wins; otherwise discover from the sitemap; otherwise the homepage alone.
 */
async function resolveTemplates(base, root) {
  let locs = [];
  try {
    const res = await fetch(`${base}/sitemap.xml`);
    if (res.ok) locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  } catch {
    /* no sitemap reachable; fall through */
  }

  const configured = pagesFromConfig(root);
  const pages = configured || (locs.length ? pagesFromSitemap(locs) : [{ name: 'homepage', path: '/', sitemapMatch: null, count: 1 }]);

  const counts = {};
  for (const pg of pages) {
    counts[pg.name] = pg.sitemapMatch && locs.length
      ? locs.filter((u) => u.includes(pg.sitemapMatch)).length
      : (pg.count ?? null);
  }
  const source = configured ? '.bobbyrc.yml' : locs.length ? `sitemap.xml (${locs.length} URLs)` : 'homepage only, no sitemap';
  return { pages, counts, source };
}

function runLighthouse(url, outFile, desktop) {
  const flags = [
    url,
    '--output=json',
    `--output-path=${outFile}`,
    '--chrome-flags=--headless=new --no-sandbox',
    '--quiet',
    ...(desktop ? ['--preset=desktop'] : ['--form-factor=mobile', '--screenEmulation.mobile']),
  ];
  execFileSync('npx', ['--yes', 'lighthouse@12', ...flags], { stdio: 'ignore', cwd: ROOT });
  const report = JSON.parse(readFileSync(outFile, 'utf8'));

  // Design rule 4: a report that measured a different URL than we asked for is the
  // single most dangerous artifact this script can produce, because every downstream
  // number looks plausible. One sweep did exactly this and reported the /sell/ page
  // under the blog's filename.
  if (report.requestedUrl !== url) {
    fail(`report mismatch: asked for ${url}, report says ${report.requestedUrl}`);
  }
  if (report.runtimeError) {
    fail(`lighthouse runtime error on ${url}: ${report.runtimeError.code}`);
  }
  return report;
}

/** Failing audits for one category, with the node counts that make a ticket actionable. */
export function failingAudits(report, category) {
  const out = [];
  for (const ref of report.categories[category].auditRefs) {
    const a = report.audits[ref.id];
    if (!a || a.score === null || a.score >= 1) continue;
    // Not every audit's details.items is an array: some carry `debugdata` or an object,
    // and assuming array shape here crashed the first run.
    const items = Array.isArray(a.details?.items) ? a.details.items : [];
    out.push({
      id: ref.id,
      title: a.title,
      weight: ref.weight,
      nodes: items.length,
      // A couple of real selectors make the difference between a ticket someone can
      // act on and one they have to re-investigate from scratch.
      samples: items
        .slice(0, 3)
        .map((i) => (i.node?.snippet || i.node?.selector || i.url || '').slice(0, 120))
        .filter(Boolean),
    });
  }
  return out.sort((x, y) => y.weight - x.weight || y.nodes - x.nodes);
}

/** Design rule 3: has someone already filed this? */
function existingTickets(override) {
  const tickets = [];
  const dirPath = override || findTicketsDir(ROOT);
  if (!dirPath) {
    // Loud, not silent. Proposing work while blind to what is already open is the
    // fastest way to make this report untrustworthy.
    console.warn('  ! no .bobby/tickets found by walking up from this directory.');
    console.warn('    EVERY gap will look new and duplicates are likely. If the Bobby project is');
    console.warn('    elsewhere (a git worktree, for example), pass --tickets=/path/to/.bobby/tickets\n');
    return tickets;
  }
  for (const dir of readdirSync(dirPath)) {
    const f = path.join(dirPath, dir, 'ticket.md');
    if (!existsSync(f)) continue;
    const body = readFileSync(f, 'utf8');
    const stage = (body.match(/^stage:\s*(\S+)/m) || [])[1] || 'unknown';
    tickets.push({ id: (dir.match(/^(TKT-\d+)/) || [])[1] || dir, stage, body: body.toLowerCase() });
  }
  return tickets;
}

export function findDuplicate(tickets, auditId, pageName, pagePath = '') {
  /*
   * Match on the audit id plus ANY identifying token for the section. Matching on the
   * template name alone is not enough: sitemap discovery names a section after its first
   * URL segment (say "products") while the human who filed the ticket may have called it
   * something else ("store", "catalog"). So the URL path is tried too, since a well-written
   * ticket almost always quotes the path it is about. Without this the audit re-proposes a
   * gap that is already tracked, which is the fastest way to make the report ignored.
   */
  const tokens = [
    ...pageName.split(/[\s/-]+/),
    ...pagePath.split('/').filter(Boolean),
  ]
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 3);
  if (!tokens.length) return undefined;

  return tickets.find(
    (t) => t.stage !== 'done' && t.body.includes(auditId.toLowerCase()) && tokens.some((w) => t.body.includes(w))
  );
}

// Importing this module (for tests) must not launch a sweep, so the CLI body lives
// in main() and only runs when this file is executed directly.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base) {
    const configured = readBaseFromConfig(ROOT);
    if (configured) args.base = configured;
  }
  if (!args.base) {
    fail(
      'no site to audit. Pass --url=https://example.com, set BOBBY_AUDIT_URL, or add:\n' +
        '    lighthouse:\n      base: https://example.com\n  to .bobbyrc.yml'
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const formFactor = args.desktop ? 'desktop' : 'mobile';
  console.log(`Four-pillar audit: ${args.base}`);
  console.log(`${formFactor}, median of ${args.runs} run(s) per page\n`);

  const { pages: templates, counts, source } = await resolveTemplates(args.base, ROOT);
  console.log(`templates from ${source}\n`);
  const selected = args.only
    ? templates.filter((p) => p.name === args.only || p.name.replace(/\s+/g, '-') === args.only)
    : templates;
  if (!selected.length) fail(`unknown --page=${args.only}. Known: ${templates.map((p) => p.name).join(', ')}`);
  const tickets = existingTickets(args.ticketsDir);
  const results = [];

  for (const page of selected) {
    const url = `${args.base}${page.path}`;
    const slug = page.name.replace(/\s+/g, '-');
    const scores = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
    let last = null;

    for (let i = 1; i <= args.runs; i += 1) {
      const outFile = path.join(OUT_DIR, `audit-${slug}-${formFactor}-${i}.json`);
      last = runLighthouse(url, outFile, args.desktop);
      for (const c of CATEGORIES) scores[c].push(Math.round((last.categories[c]?.score ?? 0) * 100));
    }

    // Failing audits come from ONE report, not a median: an audit either fails or it
    // does not, and taking a median of a pass/fail set would invent a result.
    const gaps = [];
    const informational = [];
    const suppressed = [];
    for (const c of CATEGORIES) {
      for (const a of failingAudits(last, c)) {
        const dup = findDuplicate(tickets, a.id, page.name, page.path);
        const entry = { ...a, pillar: c, page: page.name, url, pages_affected: counts[page.name], existing_ticket: dup ? dup.id : null };
        // Design rule 1, applied one level deeper. Audits with zero nodes are derived
        // from timings rather than asserting anything about the document:
        // `interactive` and `max-potential-fid` "fail" on a page with no defect at all,
        // purely because the run was slow. Ticketing those manufactures busywork and
        // trains people to ignore the report. They are reported, never proposed.
        const artifact = isNotOurs(a.id, a.samples);
        if (artifact) suppressed.push({ ...entry, why: artifact.why });
        else if (a.nodes > 0) gaps.push(entry);
        else informational.push(entry);
      }
    }

    results.push({
      page: page.name,
      url,
      pages_affected: counts[page.name],
      scores: Object.fromEntries(CATEGORIES.map((c) => [c, { median: median(scores[c]), runs: scores[c], spread: spread(scores[c]) }])),
      gaps,
      informational,
      suppressed,
    });

    const s = (c) => {
      const v = results.at(-1).scores[c];
      return `${String(v.median).padStart(3)}${v.spread > 4 ? '~' : ' '}`;
    };
    console.log(
      `  ${page.name.padEnd(19)} ${String(counts[page.name] ?? '?').padStart(4)} pages  |  ` +
        `perf ${s('performance')} a11y ${s('accessibility')} bp ${s('best-practices')} seo ${s('seo')}  |  ` +
        `${gaps.length} failing audit(s)`
    );
  }

  if (!results.length) fail('no pages audited: refusing to report an empty pass');

  // ── Gap report, ranked by blast radius ────────────────────────────────────────────
  const allGaps = results.flatMap((r) => r.gaps);
  const fresh = allGaps.filter((g) => !g.existing_ticket);
  const known = allGaps.filter((g) => g.existing_ticket);

  console.log(`\n${'='.repeat(78)}`);
  console.log(`GAPS: ${allGaps.length} failing audit(s), ${fresh.length} not yet ticketed`);
  console.log('~ marks a score whose run-to-run spread exceeded 4 points: treat as noise.');
  console.log('='.repeat(78));

  if (fresh.length) {
    /*
     * Group by audit id ACROSS templates before proposing. The shared app shell means
     * unused-css-rules and unused-javascript fail on every template from a single root
     * cause, and proposing six tickets for one fix is how an auditor earns a reputation
     * for noise. One proposal, all affected templates, summed page count.
     */
    const byAudit = new Map();
    for (const g of fresh) {
      if (!byAudit.has(g.id)) byAudit.set(g.id, { ...g, templates: [], totalPages: 0 });
      const e = byAudit.get(g.id);
      e.templates.push(`${g.page} (${g.pages_affected ?? '?'})`);
      e.totalPages += g.pages_affected || 0;
      e.samples = [...new Set([...e.samples, ...g.samples])].slice(0, 4);
    }
    const proposals = [...byAudit.values()].sort((a, b) => b.totalPages - a.totalPages);

    console.log(`\nNEEDS A TICKET: ${proposals.length} distinct issue(s) from ${fresh.length} template-level finding(s)\n`);
    for (const g of proposals) {
      const shared = g.templates.length > 1 ? '   [SHARED SHELL: one fix covers all]' : '';
      console.log(`  [${g.pillar}] ${g.id}  ~${g.totalPages} pages${shared}`);
      console.log(`     ${g.title}`);
      console.log(`     templates: ${g.templates.join(', ')}`);
      for (const s of g.samples) console.log(`       ${s}`);
      console.log('');
    }
  } else {
    console.log('\nNo untracked gaps. Every failing audit already has an open ticket.');
  }

  if (known.length) {
    console.log('\nALREADY TICKETED (do not re-file):\n');
    for (const g of known) {
      console.log(`  [${g.pillar}] ${g.id} on ${g.page}  ->  ${g.existing_ticket}`);
    }
  }

  const info = results.flatMap((r) => r.informational);
  if (info.length) {
    const ids = [...new Set(info.map((g) => g.id))];
    console.log(`\nREPORTED, NOT PROPOSED (${info.length} timing-derived audit(s), no DOM nodes): ${ids.join(', ')}`);
    console.log('  These fail on a slow run, not on a defect. Investigate only alongside a real byte or node gap.');
  }

  const reportFile = path.join(OUT_DIR, `four-pillar-audit-${formFactor}.json`);
  writeFileSync(reportFile, `${JSON.stringify({ base: args.base, formFactor, runs: args.runs, results }, null, 2)}\n`);
  console.log(`\nmachine-readable report: ${path.relative(ROOT, reportFile)}`);
  console.log('Next: the bobby-lighthouse skill turns each untracked gap into a ticket.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
