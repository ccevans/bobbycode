// lib/self-link.js
// Where the running `bobby` actually comes from.
//
// Bobby is commonly installed with `npm link` from a working checkout, which
// makes the global package a SYMLINK INTO THAT CHECKOUT. That is convenient —
// edits take effect with no reinstall — but it couples the command to a
// directory path, and Bobby is a tool whose whole job includes moving repos
// around. One of the repos it can move is its own source, and when that happens
// `bobby` dies with `command not found` mid-operation, which is a confusing
// place to lose your tooling.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const PACKAGE_NAME = 'bobbycode';

/** Absolute path of the package directory backing the running CLI. */
export function runningPackageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/**
 * Derive <prefix>/lib/node_modules from a node binary path.
 *
 * NOT reliable on its own, and homebrew is exactly why: `process.execPath` there
 * is the Cellar path (/opt/homebrew/Cellar/node/<ver>/bin/node), so this yields
 * /opt/homebrew/Cellar/node/<ver>/lib/node_modules while the real global root is
 * /opt/homebrew/lib/node_modules. Kept only as the fallback for when npm cannot
 * be run.
 */
export function deriveGlobalNodeModules(execPath = process.execPath) {
  return path.resolve(path.dirname(execPath), '..', 'lib', 'node_modules');
}

let cachedGlobalRoot = null;

/**
 * Location of the global node_modules. Asks npm, which is the only answer that
 * is right across homebrew, nvm, volta and system installs; falls back to the
 * derivation above when npm is unavailable. Cached — this shells out.
 */
export function globalNodeModules() {
  if (cachedGlobalRoot) return cachedGlobalRoot;
  try {
    const out = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (out) return (cachedGlobalRoot = out);
  } catch { /* npm not on PATH — fall through */ }
  return (cachedGlobalRoot = deriveGlobalNodeModules());
}

function canon(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/**
 * Inspect the global install of this package.
 *
 * Returns one of:
 *   { linked: false, reason: 'not-installed-globally' | 'installed-normally' }
 *   { linked: true, entry, target, dangling, servesThisPackage }
 *
 * `dangling` means the symlink survives but its target is gone — the state that
 * produces `command not found`. `servesThisPackage` means the global command is
 * served by the checkout this code is running from.
 */
export function inspectGlobalLink(packageRoot = runningPackageRoot(), globalRoot = globalNodeModules()) {
  const entry = path.join(globalRoot, PACKAGE_NAME);
  let stat;
  try { stat = fs.lstatSync(entry); } catch { return { linked: false, reason: 'not-installed-globally' }; }
  if (!stat.isSymbolicLink()) return { linked: false, reason: 'installed-normally' };

  const target = path.resolve(path.dirname(entry), fs.readlinkSync(entry));
  const dangling = !fs.existsSync(target);
  return {
    linked: true,
    entry,
    target,
    dangling,
    servesThisPackage: !dangling && canon(target) === canon(packageRoot),
  };
}

/**
 * True when `repoPath` is (or contains) the checkout backing the global CLI.
 * Callers use this to warn BEFORE doing something that would move it.
 */
export function backsGlobalCli(repoPath, link = inspectGlobalLink()) {
  if (!link.linked || link.dangling) return false;
  const r = canon(repoPath);
  const t = canon(link.target);
  return t === r || t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/** The exact command that repairs a moved or dangling link. */
export function repairCommand(entry, newTarget) {
  return `ln -sfn ${JSON.stringify(newTarget)} ${JSON.stringify(entry)}`;
}
