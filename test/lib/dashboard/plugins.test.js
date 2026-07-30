// test/lib/dashboard/plugins.test.js
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  proInstallDir,
  resolveCandidates,
  findExtension,
  loadDashboardPlugins,
  pluginStatusLine,
  PRO_DASHBOARD_PACKAGE,
} from '../../../lib/dashboard/plugins.js';

let tmp;
let originalHome;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-plugins-'));
  originalHome = process.env.HOME;
  // Every test gets a throwaway HOME so nothing reads or writes a real
  // ~/.bobby/licenses.yml.
  process.env.HOME = tmp;
});

afterEach(() => {
  process.env.HOME = originalHome;
  delete process.env.BOBBY_PRO_DASHBOARD;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Writes a loadable extension package and returns its directory. */
function writeExtension(dir, { name = PRO_DASHBOARD_PACKAGE, version = '1.0.0', body, main = 'index.js' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version, main, type: 'module' }));
  fs.writeFileSync(path.join(dir, main), body ?? `
    export default {
      name: ${JSON.stringify(name)},
      version: ${JSON.stringify(version)},
      features: ['test feature'],
      register() {},
    };
  `);
  return dir;
}

const ACTIVE_PRO = { active: true, lapsed: false, until: null };

describe('proInstallDir', () => {
  test('resolves under HOME, not the real homedir', () => {
    expect(proInstallDir()).toBe(path.join(tmp, '.bobby', 'pro'));
  });

  test('is resolved per call, so a HOME change is picked up', () => {
    const first = proInstallDir();
    process.env.HOME = path.join(tmp, 'elsewhere');
    expect(proInstallDir()).not.toBe(first);
  });
});

describe('resolveCandidates', () => {
  test('prefers the env override, then pro-install, then project', () => {
    const candidates = resolveCandidates(PRO_DASHBOARD_PACKAGE, {
      repoRoot: '/repo',
      env: { BOBBY_PRO_DASHBOARD: '/dev/ext' },
    });
    expect(candidates.map((c) => c.via)).toEqual(['BOBBY_PRO_DASHBOARD', 'pro-install', 'project']);
    expect(candidates[0].dir).toBe(path.resolve('/dev/ext'));
    expect(candidates[2].dir).toBe(path.join('/repo', 'node_modules', '@bobbycode', 'pro-dashboard'));
  });

  test('omits the override when unset', () => {
    const candidates = resolveCandidates(PRO_DASHBOARD_PACKAGE, { repoRoot: '/repo', env: {} });
    expect(candidates.map((c) => c.via)).toEqual(['pro-install', 'project']);
  });
});

describe('findExtension', () => {
  test('finds a package via the env override', () => {
    const dir = writeExtension(path.join(tmp, 'ext'), { version: '2.1.0' });
    process.env.BOBBY_PRO_DASHBOARD = dir;
    const found = findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot: tmp });
    expect(found).toMatchObject({ version: '2.1.0', via: 'BOBBY_PRO_DASHBOARD' });
  });

  test('returns null when nothing is installed', () => {
    expect(findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot: tmp })).toBeNull();
  });

  test('ignores a package whose main file is missing', () => {
    const dir = path.join(tmp, 'ext');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', main: 'gone.js' }));
    process.env.BOBBY_PRO_DASHBOARD = dir;
    expect(findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot: tmp })).toBeNull();
  });

  test('refuses a main that escapes the package directory', () => {
    const dir = path.join(tmp, 'ext');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', main: '../../etc/passwd' }));
    process.env.BOBBY_PRO_DASHBOARD = dir;
    expect(findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot: tmp })).toBeNull();
  });

  test('survives a corrupt package.json', () => {
    const dir = path.join(tmp, 'ext');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');
    process.env.BOBBY_PRO_DASHBOARD = dir;
    expect(findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot: tmp })).toBeNull();
  });
});

describe('loadDashboardPlugins', () => {
  test('absent extension is the free tier, not an error', async () => {
    const result = await loadDashboardPlugins({ repoRoot: tmp });
    expect(result.plugins).toEqual([]);
    expect(result.status.state).toBe('absent');
    expect(result.status.buy).toMatch(/^https?:\/\//);
  });

  test('installed but unlicensed does not load the code', async () => {
    process.env.BOBBY_PRO_DASHBOARD = writeExtension(path.join(tmp, 'ext'));
    const result = await loadDashboardPlugins({
      repoRoot: tmp,
      pro: { active: false, reason: 'Bobby Pro is not activated on this machine' },
    });
    expect(result.plugins).toEqual([]);
    expect(result.status.state).toBe('unlicensed');
    expect(result.status.reason).toMatch(/not activated/);
  });

  test('installed and licensed loads and exposes features', async () => {
    process.env.BOBBY_PRO_DASHBOARD = writeExtension(path.join(tmp, 'ext'), { version: '3.0.0' });
    const result = await loadDashboardPlugins({ repoRoot: tmp, pro: ACTIVE_PRO });
    expect(result.status.state).toBe('active');
    expect(result.status.version).toBe('3.0.0');
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].features).toEqual(['test feature']);
    expect(typeof result.plugins[0].register).toBe('function');
  });

  test('a lapsed subscription still loads what was already installed', async () => {
    process.env.BOBBY_PRO_DASHBOARD = writeExtension(path.join(tmp, 'ext'));
    const result = await loadDashboardPlugins({
      repoRoot: tmp,
      pro: { active: true, lapsed: true, until: '2020-01-01' },
    });
    expect(result.status.state).toBe('active');
    expect(result.status.lapsed).toBe(true);
  });

  test('accepts a module namespace export as well as a default export', async () => {
    process.env.BOBBY_PRO_DASHBOARD = writeExtension(path.join(tmp, 'ext'), {
      body: `export const name = 'ns-ext'; export function register() {}`,
    });
    const result = await loadDashboardPlugins({ repoRoot: tmp, pro: ACTIVE_PRO });
    expect(result.status.state).toBe('active');
    expect(result.plugins[0].name).toBe('ns-ext');
  });

  test('an extension with no register() is broken, not active', async () => {
    process.env.BOBBY_PRO_DASHBOARD = writeExtension(path.join(tmp, 'ext'), {
      body: `export default { name: 'no-register' };`,
    });
    const result = await loadDashboardPlugins({ repoRoot: tmp, pro: ACTIVE_PRO });
    expect(result.plugins).toEqual([]);
    expect(result.status.state).toBe('broken');
    expect(result.status.reason).toMatch(/register\(\)/);
  });

  test('an extension that throws on import is broken, not fatal', async () => {
    process.env.BOBBY_PRO_DASHBOARD = writeExtension(path.join(tmp, 'ext'), {
      body: `throw new Error('boom at import time');`,
    });
    const result = await loadDashboardPlugins({ repoRoot: tmp, pro: ACTIVE_PRO });
    expect(result.plugins).toEqual([]);
    expect(result.status.state).toBe('broken');
    expect(result.status.reason).toMatch(/boom at import time/);
  });
});

describe('pluginStatusLine', () => {
  test('absent points at the buy URL', () => {
    expect(pluginStatusLine({ state: 'absent', buy: 'https://example.com/pro' }))
      .toMatch(/not installed — https:\/\/example.com\/pro/);
  });

  test('unlicensed points at activate', () => {
    expect(pluginStatusLine({ state: 'unlicensed' })).toMatch(/bobby pro activate/);
  });

  test('broken surfaces the reason', () => {
    expect(pluginStatusLine({ state: 'broken', reason: 'bad export' })).toMatch(/bad export/);
  });

  test('active names the package and version', () => {
    expect(pluginStatusLine({ state: 'active', package: '@bobbycode/pro-dashboard', version: '1.2.3' }))
      .toMatch(/@bobbycode\/pro-dashboard v1\.2\.3/);
  });

  test('lapsed says installed features keep working', () => {
    expect(pluginStatusLine({ state: 'active', package: 'x', version: '1.0.0', lapsed: true }))
      .toMatch(/still work/);
  });
});
