#!/usr/bin/env node
/**
 * One shared headless-browser driver for Bobby's build and test agents.
 *
 * Load a URL at one or more viewport widths, take a full-page screenshot at each, and
 * print ONE JSON summary: main-response status, console errors, page errors, failed
 * requests, and (with --axe) accessibility violations. Exits non-zero when the page is
 * broken, so an agent can gate on it instead of eyeballing a log.
 *
 * ── Why this exists, each rule bought with a wasted run ─────────────────────────────
 *
 * 1. EVERY RUN GETS A FRESH BROWSER.
 *    Test agents wrote 454 one-off Playwright scripts across 52 tickets, and 7 runs were
 *    blocked because two agents drove the same Chrome profile at once. This script only
 *    ever calls `chromium.launch()` (Playwright's own throwaway profile) plus a new context
 *    per size. It never opens a persistent profile and never attaches to a system Chrome.
 *    Logged-in state comes from an explicit `--storage` file, nothing else.
 *
 * 2. THE PROJECT'S PLAYWRIGHT, NOT BOBBY'S.
 *    Agents hardcoded `require('/abs/path/to/worktree/node_modules/playwright')` dozens of
 *    times, and every one broke when the worktree moved. Playwright and axe-core resolve from
 *    process.cwd() upward, the same way the project's own code would. If neither is found the
 *    run stops and says exactly what to install. There is no fallback browser.
 *
 * 3. A HUNG PAGE CANNOT RUN FOR HOURS.
 *    A hard overall deadline (default 60 s) prints whatever was collected, marks the run
 *    timed out, and exits non-zero.
 *
 * 4. --axe THAT CANNOT RUN IS A FAILURE, NOT A PASS.
 *    If axe-core is not installed in the project, or the page blocks the injection, the
 *    summary says so and the exit code is non-zero. A skipped check must never read as clean.
 *
 * Usage:
 *   node browse.mjs <url> [--sizes 390,1440] [--out <dir>] [--name <prefix>]
 *                         [--wait <selector|ms>] [--axe] [--headers 'K: V'] [--cookie 'k=v']
 *                         [--storage <path>] [--disable-web-security] [--timeout <s>]
 *
 *   --headers and --cookie repeat. --cookie also takes 'a=1; b=2'.
 *   --wait: digits are milliseconds, anything else is a selector to wait for (visible).
 *   --disable-web-security: the Chromium flag, for a localhost UI calling a localhost API
 *   on another port without CORS configured.
 *
 * Output: screenshots at <out>/<name>-<width>.png (default out ./browse-shots, default
 * name a slug of the URL), JSON summary on stdout.
 *
 * Exit codes: 0 ok, 1 the page failed a check (non-2xx/3xx main response, page errors,
 * WCAG axe violations or axe unavailable with --axe, navigation error, timeout),
 * 2 usage or setup error (bad flags, no playwright, no browser binary).
 * Console errors, failed sub-requests, horizontal overflow and axe best-practice findings
 * are reported in the JSON but do not change the exit code: read them.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_SIZES = [390, 1440];
export const DEFAULT_TIMEOUT_S = 60;
const LIST_CAP = 100; // per-size cap on each collected list; counts stay exact

export class UsageError extends Error {}

const VALUE_FLAGS = new Set(['sizes', 'out', 'name', 'wait', 'headers', 'cookie', 'storage', 'timeout']);
const BOOL_FLAGS = new Set(['axe', 'disable-web-security', 'help']);

export const USAGE =
  "usage: node browse.mjs <url> [--sizes 390,1440] [--out <dir>] [--name <prefix>] [--wait <selector|ms>] [--axe] [--headers 'K: V'] [--cookie 'k=v'] [--storage <path>] [--disable-web-security] [--timeout <s>]";

/** Parse argv (without node and script). Throws UsageError on anything it does not understand. */
export function parseArgs(argv) {
  const opts = {
    url: null,
    sizes: [...DEFAULT_SIZES],
    out: null,
    name: null,
    wait: null,
    axe: false,
    headers: {},
    cookies: [],
    storage: null,
    disableWebSecurity: false,
    timeoutS: DEFAULT_TIMEOUT_S,
    help: false,
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) {
      positionals.push(raw);
      continue;
    }
    const eq = raw.indexOf('=');
    const key = raw.slice(2, eq === -1 ? undefined : eq);
    let value = eq === -1 ? undefined : raw.slice(eq + 1);

    if (BOOL_FLAGS.has(key)) {
      if (value !== undefined) throw new UsageError(`--${key} takes no value`);
      if (key === 'axe') opts.axe = true;
      else if (key === 'disable-web-security') opts.disableWebSecurity = true;
      else opts.help = true;
      continue;
    }
    if (!VALUE_FLAGS.has(key)) throw new UsageError(`unknown flag --${key}`);
    if (value === undefined) {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`--${key} needs a value`);
      i += 1;
    }

    switch (key) {
      case 'sizes': {
        const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (!parts.length) throw new UsageError('--sizes needs at least one width');
        opts.sizes = parts.map((p) => {
          if (!/^\d+$/.test(p)) throw new UsageError(`--sizes: "${p}" is not a whole number of pixels`);
          const n = Number(p);
          if (n < 200 || n > 4000) throw new UsageError(`--sizes: ${n} is outside 200..4000`);
          return n;
        });
        break;
      }
      case 'out':
        opts.out = value;
        break;
      case 'name':
        if (!/^[\w.-]+$/.test(value)) throw new UsageError('--name may only contain letters, digits, ".", "_" and "-"');
        opts.name = value;
        break;
      case 'wait':
        opts.wait = /^\d+$/.test(value) ? { ms: Number(value) } : { selector: value };
        break;
      case 'headers': {
        const colon = value.indexOf(':');
        const k = colon === -1 ? '' : value.slice(0, colon).trim();
        if (!k) throw new UsageError(`--headers expects 'Name: value', got "${value}"`);
        opts.headers[k] = value.slice(colon + 1).trim();
        break;
      }
      case 'cookie':
        for (const pair of value.split(';').map((s) => s.trim()).filter(Boolean)) {
          const e = pair.indexOf('=');
          if (e <= 0) throw new UsageError(`--cookie expects 'name=value', got "${pair}"`);
          opts.cookies.push({ name: pair.slice(0, e).trim(), value: pair.slice(e + 1).trim() });
        }
        break;
      case 'storage':
        opts.storage = value;
        break;
      case 'timeout': {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--timeout must be a positive number of seconds, got "${value}"`);
        opts.timeoutS = n;
        break;
      }
      default:
        throw new UsageError(`unknown flag --${key}`);
    }
  }

  if (opts.help) return opts;
  if (positionals.length !== 1) {
    throw new UsageError(positionals.length ? `expected one URL, got ${positionals.length}: ${positionals.join(' ')}` : 'missing <url>');
  }
  let parsed;
  try {
    parsed = new URL(positionals[0]);
  } catch {
    throw new UsageError(`not a URL: "${positionals[0]}" (include the scheme, e.g. http://localhost:3000/)`);
  }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) throw new UsageError(`unsupported scheme ${parsed.protocol}`);
  opts.url = parsed.href;
  if (opts.cookies.length && parsed.protocol === 'file:') throw new UsageError('--cookie needs an http(s) URL');
  return opts;
}

/** A filesystem-safe prefix from the URL: http://localhost:3000/a/b -> localhost-3000-a-b */
export function defaultName(url) {
  const u = new URL(url);
  const slug = `${u.host}${u.pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return slug || 'page';
}

/** Phone widths get a phone-shaped, touch, mobile-meta-viewport context; wider ones a desktop window. */
export function viewportFor(width) {
  if (width < 600) return { width, height: 844, isMobile: true, hasTouch: true };
  if (width < 1024) return { width, height: 1024, isMobile: false, hasTouch: false };
  return { width, height: 900, isMobile: false, hasTouch: false };
}

/**
 * Find the first of `names` installed in a node_modules at startDir or any parent.
 * Nearest directory wins; within one directory, earlier names win.
 * A deliberate manual walk: no NODE_PATH, no global folders, no Bobby's own node_modules.
 */
export function findPackage(names, startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    for (const name of names) {
      const pkgDir = path.join(dir, 'node_modules', name);
      if (existsSync(path.join(pkgDir, 'package.json'))) return { name, pkgDir, root: dir };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * WCAG-tagged violations gate the run; axe's best-practice rules (region, landmark-one-main,
 * page-has-heading-one...) are reported but do not fail it. They fire on almost every page,
 * example.com included, and a gate that always fails is a gate everyone learns to ignore.
 */
export function splitAxeViolations(all) {
  const isWcag = (v) => (v.tags || []).some((t) => /^wcag\d/.test(t));
  const slim = ({ id, impact, nodes }) => ({ id, impact, nodes });
  const wcag = all.filter(isWcag).map(slim);
  const other = all.filter((v) => !isWcag(v)).map(slim);
  return {
    violations: wcag.length,
    ids: wcag.map((v) => v.id),
    details: wcag,
    bestPractice: { count: other.length, ids: other.map((v) => v.id), details: other },
  };
}

/** Decide pass/fail from a summary. Pure: no I/O. */
export function evaluateSummary(summary) {
  const reasons = [];
  if (summary.timedOut) reasons.push(`timed out after ${summary.timeoutS}s`);
  if (summary.axeRequested && summary.axeSetupError) reasons.push(`--axe: ${summary.axeSetupError}`);
  for (const s of summary.sizes || []) {
    const at = `${s.width}px`;
    if (s.error) {
      reasons.push(`${at}: ${s.error}`);
      continue;
    }
    if (s.status === null || s.status === undefined) reasons.push(`${at}: no main response`);
    else if (s.status < 200 || s.status >= 400) reasons.push(`${at}: HTTP ${s.status}`);
    if (s.pageErrorCount > 0) reasons.push(`${at}: ${s.pageErrorCount} page error(s)`);
    if (summary.axeRequested && s.axe) {
      if (s.axe.error) reasons.push(`${at}: axe ${s.axe.error}`);
      else if (s.axe.violations > 0) reasons.push(`${at}: ${s.axe.violations} axe violation(s): ${s.axe.ids.join(', ')}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function exitCodeFor(evaluation) {
  return evaluation.ok ? 0 : 1;
}

// ── runtime ────────────────────────────────────────────────────────────────────────

function capped(list, item) {
  if (list.length < LIST_CAP) list.push(item);
}

function emit(obj, code) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`, () => process.exit(code));
}

function setupError(message) {
  process.stderr.write(`browse.mjs: ${message}\n`);
  emit({ ok: false, exitCode: 2, error: message }, 2);
}

async function loadPlaywright(cwd) {
  const found = findPackage(['playwright', 'playwright-core', '@playwright/test'], cwd);
  if (!found) {
    return {
      error:
        `playwright not found in node_modules from ${cwd} upward. Run this from the project ` +
        'directory, or install it there: npm i -D playwright && npx playwright install chromium',
    };
  }
  const req = createRequire(path.join(found.root, 'noop.js'));
  const mod = await import(pathToFileURL(req.resolve(found.name)).href);
  const chromium = mod.chromium || mod.default?.chromium;
  if (!chromium) return { error: `${found.name} at ${found.pkgDir} does not export chromium` };
  const version = JSON.parse(readFileSync(path.join(found.pkgDir, 'package.json'), 'utf8')).version;
  return { chromium, info: { package: found.name, version, from: found.pkgDir } };
}

function loadAxe(cwd) {
  const found = findPackage(['axe-core'], cwd);
  if (!found) return { error: `axe-core not found in node_modules from ${cwd} upward (npm i -D axe-core)` };
  const file = path.join(found.pkgDir, 'axe.min.js');
  if (!existsSync(file)) return { error: `axe-core at ${found.pkgDir} has no axe.min.js` };
  const version = JSON.parse(readFileSync(path.join(found.pkgDir, 'package.json'), 'utf8')).version;
  return { source: readFileSync(file, 'utf8'), info: { version, from: found.pkgDir } };
}

async function shootSize(browser, opts, width, shared) {
  const vp = viewportFor(width);
  const result = {
    width,
    height: vp.height,
    status: null,
    finalUrl: null,
    screenshot: null,
    networkIdle: null,
    horizontalOverflowPx: null,
    consoleErrors: [],
    consoleErrorCount: 0,
    pageErrors: [],
    pageErrorCount: 0,
    failedRequests: [],
    failedRequestCount: 0,
    axe: opts.axe ? null : undefined,
    error: null,
  };
  shared.current = result;

  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    extraHTTPHeaders: Object.keys(opts.headers).length ? opts.headers : undefined,
    storageState: opts.storage || undefined,
  });
  shared.context = context;
  try {
    if (opts.cookies.length) {
      await context.addCookies(opts.cookies.map((c) => ({ ...c, url: opts.url })));
    }
    const page = await context.newPage();
    page.setDefaultTimeout(shared.remainingMs());

    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      result.consoleErrorCount += 1;
      const loc = m.location();
      capped(result.consoleErrors, loc?.url ? `${m.text()} (${loc.url}:${loc.lineNumber})` : m.text());
    });
    page.on('pageerror', (e) => {
      result.pageErrorCount += 1;
      capped(result.pageErrors, String(e?.message || e));
    });
    page.on('requestfailed', (r) => {
      result.failedRequestCount += 1;
      capped(result.failedRequests, { method: r.method(), url: r.url(), error: r.failure()?.errorText || 'failed' });
    });
    page.on('response', (r) => {
      if (r.status() < 400) return;
      result.failedRequestCount += 1;
      capped(result.failedRequests, { method: r.request().method(), url: r.url(), status: r.status() });
    });

    const response = await page.goto(opts.url, { waitUntil: 'load', timeout: shared.remainingMs() });
    result.status = response ? response.status() : null;
    result.finalUrl = page.url();

    // Settle briefly for client-rendered pages; report whether it happened rather than hide it.
    result.networkIdle = await page
      .waitForLoadState('networkidle', { timeout: Math.min(5000, shared.remainingMs()) })
      .then(() => true, () => false);

    if (opts.wait?.selector) await page.locator(opts.wait.selector).first().waitFor({ state: 'visible', timeout: shared.remainingMs() });
    if (opts.wait?.ms) await page.waitForTimeout(Math.min(opts.wait.ms, shared.remainingMs()));

    result.horizontalOverflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    const file = path.join(shared.outDir, `${shared.name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true, timeout: shared.remainingMs() });
    result.screenshot = file;

    if (opts.axe) {
      if (!shared.axeSource) {
        result.axe = { error: 'not run: axe-core unavailable' };
      } else {
        await page.addScriptTag({ content: shared.axeSource }).catch(() => {});
        const hasAxe = await page.evaluate(() => typeof window.axe?.run === 'function');
        if (!hasAxe) {
          result.axe = { error: 'could not inject axe-core into the page (a Content-Security-Policy blocking inline scripts?)' };
        } else {
          const all = await page.evaluate(async () =>
            (await window.axe.run(document)).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, tags: v.tags }))
          );
          result.axe = splitAxeViolations(all);
        }
      }
    }
  } catch (e) {
    const msg = String(e?.message || e).split('\n')[0];
    result.error = msg;
  } finally {
    await context.close().catch(() => {});
    shared.context = null;
  }
  return result;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`browse.mjs: ${e.message}\n${USAGE}\n`);
      emit({ ok: false, exitCode: 2, error: e.message, usage: USAGE }, 2);
      return;
    }
    throw e;
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const cwd = process.cwd();
  const started = Date.now();
  const deadline = started + opts.timeoutS * 1000;

  if (opts.storage && !existsSync(path.resolve(cwd, opts.storage))) {
    setupError(`--storage file not found: ${path.resolve(cwd, opts.storage)}`);
    return;
  }
  if (opts.storage) opts.storage = path.resolve(cwd, opts.storage);

  const pw = await loadPlaywright(cwd);
  if (pw.error) {
    setupError(pw.error);
    return;
  }

  const axe = opts.axe ? loadAxe(cwd) : null;

  const outDir = path.resolve(cwd, opts.out || 'browse-shots');
  mkdirSync(outDir, { recursive: true });

  const summary = {
    ok: false,
    exitCode: 1,
    reasons: [],
    url: opts.url,
    outDir,
    playwright: pw.info,
    axeRequested: opts.axe,
    axeSetupError: axe?.error || null,
    axeCore: axe?.info || null,
    disableWebSecurity: opts.disableWebSecurity,
    timeoutS: opts.timeoutS,
    timedOut: false,
    durationMs: 0,
    sizes: [],
  };

  const shared = {
    outDir,
    name: opts.name || defaultName(opts.url),
    axeSource: axe?.source || null,
    current: null,
    context: null,
    remainingMs: () => Math.max(1, deadline - Date.now()),
  };

  const finish = () => {
    summary.durationMs = Date.now() - started;
    const ev = evaluateSummary(summary);
    summary.ok = ev.ok;
    summary.reasons = ev.reasons;
    summary.exitCode = exitCodeFor(ev);
    return summary.exitCode;
  };

  let browser = null;
  let hardStopped = false;
  // Backstop only: every Playwright call already gets the remaining budget as its timeout,
  // so the loop below normally notices the deadline first. This catches a call that hangs
  // past its own timeout.
  const timer = setTimeout(() => {
    hardStopped = true;
    summary.timedOut = true;
    if (shared.current && !summary.sizes.includes(shared.current)) {
      shared.current.error = shared.current.error || 'interrupted by the overall timeout';
      summary.sizes.push(shared.current);
    }
    const code = finish();
    // Playwright kills its own browser processes on exit.
    emit(summary, code);
  }, opts.timeoutS * 1000);

  try {
    browser = await pw.chromium.launch({
      headless: true,
      args: opts.disableWebSecurity ? ['--disable-web-security'] : [],
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = String(e?.message || e);
    if (/Executable doesn't exist|browserType\.launch.*install/is.test(msg)) {
      setupError(`Chromium for ${pw.info.package}@${pw.info.version} is not installed. Run in the project: npx playwright install chromium`);
    } else {
      setupError(`could not launch Chromium: ${msg.split('\n')[0]}`);
    }
    return;
  }

  const budgetSpent = () => Date.now() >= deadline - 250;
  for (const width of opts.sizes) {
    if (hardStopped) break;
    if (budgetSpent()) {
      summary.timedOut = true;
      summary.sizes.push({ width, error: 'not run: overall timeout reached' });
      continue;
    }
    const r = await shootSize(browser, opts, width, shared);
    if (hardStopped) break;
    if (r.error && budgetSpent()) {
      summary.timedOut = true;
      r.error = `${r.error} (overall --timeout ${opts.timeoutS}s reached)`;
    }
    summary.sizes.push(r);
  }
  if (hardStopped) return; // the timer already printed and is exiting

  clearTimeout(timer);
  await browser.close().catch(() => {});
  emit(summary, finish());
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  await main();
}
