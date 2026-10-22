// test/skills/browse.test.js
//
// The bobby-test skill ships browse.mjs, one shared headless-browser driver that replaces
// the hundreds of one-off Playwright scripts agents kept rewriting. Its value is that an
// agent can trust its exit code, so these cases pin the argument parsing, the project-local
// package resolution and the pass/fail logic. No browser and no network: the pure exports
// are exercised directly, and the one spawned run has no playwright to find.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  UsageError,
  defaultName,
  viewportFor,
  findPackage,
  evaluateSummary,
  exitCodeFor,
  splitAxeViolations,
  DEFAULT_SIZES,
  DEFAULT_TIMEOUT_S,
} from '../../templates/skills/bobby-test/browse.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/skills/bobby-test/browse.mjs');

function tmpDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-browse-')));
}

describe('browse: argument parsing', () => {
  test('a bare URL gets the default sizes and timeout', () => {
    const o = parseArgs(['http://localhost:3000/dashboard']);
    expect(o.url).toBe('http://localhost:3000/dashboard');
    expect(o.sizes).toEqual(DEFAULT_SIZES);
    expect(o.sizes).toEqual([390, 1440]);
    expect(o.timeoutS).toBe(DEFAULT_TIMEOUT_S);
    expect(o.axe).toBe(false);
    expect(o.disableWebSecurity).toBe(false);
  });

  test('every flag, in both --k v and --k=v forms', () => {
    const o = parseArgs([
      '--sizes', '375,768,1440',
      'https://example.com/a',
      '--out=shots',
      '--name', 'home',
      '--wait', '#main',
      '--axe',
      '--headers', 'Authorization: Bearer a:b',
      '--headers=X-Tenant: acme',
      '--cookie', 'a=1; b=2',
      '--cookie=c=x=y',
      '--storage', 'state.json',
      '--disable-web-security',
      '--timeout', '15',
    ]);
    expect(o.sizes).toEqual([375, 768, 1440]);
    expect(o.out).toBe('shots');
    expect(o.name).toBe('home');
    expect(o.wait).toEqual({ selector: '#main' });
    expect(o.axe).toBe(true);
    // Only the first colon splits, so a header value may contain colons.
    expect(o.headers).toEqual({ Authorization: 'Bearer a:b', 'X-Tenant': 'acme' });
    expect(o.cookies).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
      { name: 'c', value: 'x=y' },
    ]);
    expect(o.storage).toBe('state.json');
    expect(o.disableWebSecurity).toBe(true);
    expect(o.timeoutS).toBe(15);
  });

  test('--wait with digits is milliseconds, anything else is a selector', () => {
    expect(parseArgs(['http://x.test', '--wait', '1500']).wait).toEqual({ ms: 1500 });
    expect(parseArgs(['http://x.test', '--wait', 'text=Ready']).wait).toEqual({ selector: 'text=Ready' });
  });

  test.each([
    [[], /missing <url>/],
    [['http://a.test', 'http://b.test'], /expected one URL/],
    [['localhost:3000'], /unsupported scheme|not a URL/],
    [['not a url'], /not a URL/],
    [['http://a.test', '--bogus'], /unknown flag --bogus/],
    [['http://a.test', '--sizes'], /--sizes needs a value/],
    [['http://a.test', '--sizes', '390,wide'], /not a whole number/],
    [['http://a.test', '--sizes', '50'], /outside 200..4000/],
    [['http://a.test', '--timeout', '0'], /positive number/],
    [['http://a.test', '--timeout', 'soon'], /positive number/],
    [['http://a.test', '--headers', 'NoColon'], /'Name: value'/],
    [['http://a.test', '--cookie', '=v'], /'name=value'/],
    [['http://a.test', '--name', '../escape'], /--name may only contain/],
    [['http://a.test', '--axe=yes'], /takes no value/],
    [['http://a.test', '--out', '--axe'], /--out needs a value/],
  ])('rejects %j explicitly', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(() => parseArgs(argv)).toThrow(message);
  });

  test('--help needs no URL', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('browse: naming and viewports', () => {
  test('default screenshot prefix is a slug of host and path', () => {
    expect(defaultName('http://localhost:3000/robinflow/start')).toBe('localhost-3000-robinflow-start');
    expect(defaultName('https://example.com/')).toBe('example-com');
  });

  test('phone widths are mobile + touch at phone height; wide widths are a desktop window', () => {
    expect(viewportFor(390)).toEqual({ width: 390, height: 844, isMobile: true, hasTouch: true });
    expect(viewportFor(768)).toMatchObject({ width: 768, height: 1024, isMobile: false });
    expect(viewportFor(1440)).toMatchObject({ width: 1440, height: 900, isMobile: false });
  });
});

describe('browse: resolves packages from the project, nearest first', () => {
  function fakePackage(root, name) {
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0' }));
  }

  test('walks up from a nested directory to the project node_modules', () => {
    const root = tmpDir();
    fakePackage(root, 'playwright');
    const nested = path.join(root, 'app', 'src');
    fs.mkdirSync(nested, { recursive: true });
    expect(findPackage(['playwright'], nested)).toEqual({ name: 'playwright', pkgDir: path.join(root, 'node_modules', 'playwright'), root });
  });

  test('the nearest node_modules wins, and the first name wins within it', () => {
    const outer = tmpDir();
    fakePackage(outer, 'playwright');
    const inner = path.join(outer, 'worktree');
    fakePackage(inner, 'playwright-core');
    fakePackage(inner, '@playwright/test');
    expect(findPackage(['playwright', 'playwright-core', '@playwright/test'], inner).name).toBe('playwright-core');
  });

  test('returns null when nothing is installed', () => {
    expect(findPackage(['definitely-not-installed-pkg-xyz'], tmpDir())).toBeNull();
  });
});

describe('browse: pass/fail from the summary', () => {
  const size = (over = {}) => ({ width: 390, status: 200, pageErrorCount: 0, error: null, ...over });

  test('a clean 200 passes with exit 0', () => {
    const ev = evaluateSummary({ sizes: [size(), size({ width: 1440, status: 304 })] });
    expect(ev).toEqual({ ok: true, reasons: [] });
    expect(exitCodeFor(ev)).toBe(0);
  });

  test('console errors and failed sub-requests are reported but do not fail the run', () => {
    const ev = evaluateSummary({ sizes: [size({ consoleErrorCount: 3, failedRequestCount: 2 })] });
    expect(ev.ok).toBe(true);
  });

  test.each([
    [size({ status: 404 }), /390px: HTTP 404/],
    [size({ status: 500 }), /HTTP 500/],
    [size({ status: null }), /no main response/],
    [size({ pageErrorCount: 2 }), /2 page error\(s\)/],
    [size({ error: 'net::ERR_CONNECTION_REFUSED' }), /ERR_CONNECTION_REFUSED/],
  ])('fails on %j', (s, reason) => {
    const ev = evaluateSummary({ sizes: [s] });
    expect(ev.ok).toBe(false);
    expect(ev.reasons.join('\n')).toMatch(reason);
    expect(exitCodeFor(ev)).toBe(1);
  });

  test('axe violations fail only when --axe was asked for', () => {
    const axe = { violations: 2, ids: ['color-contrast', 'label'] };
    expect(evaluateSummary({ axeRequested: true, sizes: [size({ axe })] }).reasons).toEqual(['390px: 2 axe violation(s): color-contrast, label']);
    expect(evaluateSummary({ axeRequested: true, sizes: [size({ axe: { violations: 0, ids: [] } })] }).ok).toBe(true);
  });

  test('only WCAG-tagged axe rules gate; best-practice rules are reported alongside', () => {
    const axe = splitAxeViolations([
      { id: 'color-contrast', impact: 'serious', nodes: 4, tags: ['cat.color', 'wcag2aa', 'wcag143'] },
      { id: 'region', impact: 'moderate', nodes: 7, tags: ['cat.keyboard', 'best-practice'] },
    ]);
    expect(axe).toEqual({
      violations: 1,
      ids: ['color-contrast'],
      details: [{ id: 'color-contrast', impact: 'serious', nodes: 4 }],
      bestPractice: { count: 1, ids: ['region'], details: [{ id: 'region', impact: 'moderate', nodes: 7 }] },
    });
    const onlyBestPractice = splitAxeViolations([{ id: 'region', impact: 'moderate', nodes: 7, tags: ['best-practice'] }]);
    expect(evaluateSummary({ axeRequested: true, sizes: [size({ axe: onlyBestPractice })] }).ok).toBe(true);
  });

  test('--axe that could not run is a failure, never a silent pass', () => {
    const ev = evaluateSummary({ axeRequested: true, axeSetupError: 'axe-core not found', sizes: [size({ axe: { error: 'not run: axe-core unavailable' } })] });
    expect(ev.ok).toBe(false);
    expect(ev.reasons[0]).toMatch(/--axe: axe-core not found/);
  });

  test('a timed-out run fails even if the sizes it finished were clean', () => {
    const ev = evaluateSummary({ timedOut: true, timeoutS: 60, sizes: [size()] });
    expect(ev.ok).toBe(false);
    expect(ev.reasons).toContain('timed out after 60s');
  });
});

describe('browse: CLI without a resolvable playwright', () => {
  test('stops with exit 2 and names what to install', () => {
    const cwd = tmpDir();
    const run = spawnSync(process.execPath, [SCRIPT, 'https://example.com', '--sizes', '390'], { cwd, encoding: 'utf8', timeout: 20000 });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/playwright not found in node_modules from .* upward/);
    expect(run.stderr).toMatch(/npm i -D playwright && npx playwright install chromium/);
    const summary = JSON.parse(run.stdout);
    expect(summary).toMatchObject({ ok: false, exitCode: 2 });
    expect(summary.error).toMatch(/playwright not found/);
    // Nothing was written: no screenshots dir for a run that never started.
    expect(fs.existsSync(path.join(cwd, 'browse-shots'))).toBe(false);
  });

  test('a bad flag is a usage error with exit 2', () => {
    const run = spawnSync(process.execPath, [SCRIPT, 'https://example.com', '--nope'], { cwd: tmpDir(), encoding: 'utf8', timeout: 20000 });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/unknown flag --nope/);
    expect(run.stderr).toMatch(/usage: node browse.mjs <url>/);
  });
});
