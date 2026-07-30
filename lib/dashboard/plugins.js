// lib/dashboard/plugins.js
//
// Dashboard extension loading. The dashboard in this package is MIT and free —
// every route, every panel, forever. This module is the seam where *separately
// distributed* dashboard extensions plug in.
//
// Why a seam instead of a flag: gating code that ships in an MIT npm tarball is
// theatre. The source is on disk, and `npm i bobbycode@<older>` is always a
// version pin away. A paid capability is only really paid if its code never
// enters this package. So Pro dashboard features live in a separate,
// non-MIT package that is delivered on purchase and installed into
// ~/.bobby/pro/. Absent that install, the dashboard runs free-tier and says so.
//
// The license check here is belt-and-braces, not the lock. Distribution is the
// lock. See lib/license.js for the same reasoning applied to packs.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import { checkPro, PRO_BUY_URL } from '../license.js';

/** The one paid dashboard extension. Never a dependency of this package. */
export const PRO_DASHBOARD_PACKAGE = '@bobbycode/pro-dashboard';

/**
 * Where `bobby pro install` puts paid packages. Resolved per call, not at
 * import — HOME wins over homedir() so a sandboxed run cannot read or write a
 * real user's home. Same rule as lib/license.js and lib/studio.js.
 */
export function proInstallDir() {
  return path.join(process.env.HOME || os.homedir(), '.bobby', 'pro');
}

/**
 * Candidate locations for a paid extension, most specific first:
 *
 *   1. BOBBY_PRO_DASHBOARD — an explicit path. For developing the extension
 *      itself, and for buyers who vendor it somewhere unusual.
 *   2. ~/.bobby/pro/node_modules/<pkg> — where `bobby pro install` puts it.
 *      Machine-wide, so one purchase covers every project.
 *   3. <project>/node_modules/<pkg> — if someone installs it as a project
 *      dependency from their own private registry.
 */
export function resolveCandidates(pkg, { repoRoot = process.cwd(), env = process.env } = {}) {
  const candidates = [];
  const override = env.BOBBY_PRO_DASHBOARD;
  if (override) candidates.push({ dir: path.resolve(override), via: 'BOBBY_PRO_DASHBOARD' });
  candidates.push({ dir: path.join(proInstallDir(), 'node_modules', ...pkg.split('/')), via: 'pro-install' });
  candidates.push({ dir: path.join(repoRoot, 'node_modules', ...pkg.split('/')), via: 'project' });
  return candidates;
}

/**
 * Reads a package's entry point without importing it, so a missing or broken
 * install is a status line rather than a stack trace.
 */
function readManifest(dir) {
  const manifestPath = path.join(dir, 'package.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const rel = typeof manifest.main === 'string' && manifest.main ? manifest.main : 'index.js';
    const entry = path.resolve(dir, rel);
    if (!entry.startsWith(path.resolve(dir))) return null; // no escaping the package
    if (!fs.existsSync(entry)) return null;
    return { name: manifest.name || null, version: manifest.version || null, entry };
  } catch {
    return null;
  }
}

/** First candidate that looks like a real package. */
export function findExtension(pkg, opts = {}) {
  for (const candidate of resolveCandidates(pkg, opts)) {
    const manifest = readManifest(candidate.dir);
    if (manifest) return { ...candidate, ...manifest };
  }
  return null;
}

/**
 * A plugin is an object with `name` and a `register(context)` function. We
 * accept it as a default export or as the module namespace itself, so an
 * extension can be written either way.
 */
function normalizePlugin(mod, found) {
  const candidate = mod && typeof mod.default === 'object' && mod.default !== null ? mod.default : mod;
  if (!candidate || typeof candidate.register !== 'function') return null;
  return {
    name: candidate.name || found.name || PRO_DASHBOARD_PACKAGE,
    version: candidate.version || found.version || null,
    features: Array.isArray(candidate.features) ? candidate.features : [],
    register: candidate.register.bind(candidate),
  };
}

/**
 * Loads dashboard extensions. Never throws: a missing, unlicensed, or broken
 * extension degrades to free-tier with a reason the user can act on.
 *
 * Returns { plugins, pro, status } where status.state is one of:
 *   'absent'      — nothing installed; free tier, this is the normal case
 *   'unlicensed'  — installed but no valid Pro key
 *   'broken'      — installed and licensed but failed to load
 *   'active'      — loaded
 */
export async function loadDashboardPlugins({
  repoRoot = process.cwd(),
  env = process.env,
  pkg = PRO_DASHBOARD_PACKAGE,
  pro = null,
} = {}) {
  const found = findExtension(pkg, { repoRoot, env });
  const license = pro || checkPro();

  if (!found) {
    return {
      plugins: [],
      pro: license,
      status: { state: 'absent', package: pkg, buy: PRO_BUY_URL },
    };
  }

  if (!license.active) {
    return {
      plugins: [],
      pro: license,
      status: {
        state: 'unlicensed',
        package: pkg,
        version: found.version,
        via: found.via,
        reason: license.reason,
        buy: PRO_BUY_URL,
      },
    };
  }

  try {
    const mod = await import(pathToFileURL(found.entry).href);
    const plugin = normalizePlugin(mod, found);
    if (!plugin) {
      return {
        plugins: [],
        pro: license,
        status: {
          state: 'broken',
          package: pkg,
          version: found.version,
          via: found.via,
          reason: `${pkg} does not export a register() function`,
        },
      };
    }
    return {
      plugins: [plugin],
      pro: license,
      status: {
        state: 'active',
        package: plugin.name,
        version: plugin.version,
        via: found.via,
        features: plugin.features,
        lapsed: Boolean(license.lapsed),
        until: license.until || null,
      },
    };
  } catch (e) {
    return {
      plugins: [],
      pro: license,
      status: {
        state: 'broken', package: pkg, version: found.version, via: found.via, reason: e.message,
      },
    };
  }
}

/** One-line summary for the dashboard startup banner. */
export function pluginStatusLine(status) {
  switch (status.state) {
    case 'active': {
      const v = status.version ? ` v${status.version}` : '';
      const lapsed = status.lapsed ? ' (updates ended — installed features still work)' : '';
      return `Pro:      ${status.package}${v}${lapsed}`;
    }
    case 'unlicensed':
      return `Pro:      installed but not activated — bobby pro activate <key>`;
    case 'broken':
      return `Pro:      failed to load — ${status.reason}`;
    default:
      return `Pro:      not installed — ${status.buy}`;
  }
}
