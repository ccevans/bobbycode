// Global npm-link detection (BOB-154). The failure this guards against is real:
// relocating the bobbycode checkout during a studio consolidation killed the
// global `bobby` command mid-migration with `command not found`.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  inspectGlobalLink, backsGlobalCli, repairCommand, deriveGlobalNodeModules,
} from '../../lib/self-link.js';

describe('self-link', () => {
  let tmp, globalRoot, checkout;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-selflink-'));
    globalRoot = path.join(tmp, 'lib', 'node_modules');
    checkout = path.join(tmp, 'checkout');
    fs.mkdirSync(globalRoot, { recursive: true });
    fs.mkdirSync(checkout, { recursive: true });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('reports not-installed-globally when there is no global entry', () => {
    expect(inspectGlobalLink(checkout, globalRoot)).toEqual({
      linked: false, reason: 'not-installed-globally',
    });
  });

  test('reports installed-normally for a real directory (npm i -g)', () => {
    fs.mkdirSync(path.join(globalRoot, 'bobbycode'));
    expect(inspectGlobalLink(checkout, globalRoot)).toEqual({
      linked: false, reason: 'installed-normally',
    });
  });

  test('detects a link and that it serves this checkout', () => {
    fs.symlinkSync(checkout, path.join(globalRoot, 'bobbycode'));
    const l = inspectGlobalLink(checkout, globalRoot);
    expect(l.linked).toBe(true);
    expect(l.dangling).toBe(false);
    expect(l.servesThisPackage).toBe(true);
    expect(l.target).toBe(checkout);
  });

  test('detects a DANGLING link — the state that produces "command not found"', () => {
    fs.symlinkSync(checkout, path.join(globalRoot, 'bobbycode'));
    fs.rmSync(checkout, { recursive: true, force: true });   // the move that breaks it
    const l = inspectGlobalLink(checkout, globalRoot);
    expect(l.linked).toBe(true);
    expect(l.dangling).toBe(true);
    expect(l.servesThisPackage).toBe(false);
  });

  test('backsGlobalCli is true for the checkout itself and for a parent of it', () => {
    fs.symlinkSync(checkout, path.join(globalRoot, 'bobbycode'));
    const l = inspectGlobalLink(checkout, globalRoot);
    expect(backsGlobalCli(checkout, l)).toBe(true);
    expect(backsGlobalCli(tmp, l)).toBe(true);                       // a parent contains it
    expect(backsGlobalCli(path.join(tmp, 'elsewhere'), l)).toBe(false);
  });

  test('backsGlobalCli is false when the link dangles or does not exist', () => {
    expect(backsGlobalCli(checkout, { linked: false, reason: 'installed-normally' })).toBe(false);
    fs.symlinkSync(checkout, path.join(globalRoot, 'bobbycode'));
    fs.rmSync(checkout, { recursive: true, force: true });
    expect(backsGlobalCli(checkout, inspectGlobalLink(checkout, globalRoot))).toBe(false);
  });

  test('repairCommand quotes both paths so spaces cannot split the command', () => {
    const cmd = repairCommand('/opt/homebrew/lib/node_modules/bobbycode', '/Users/a b/repo');
    expect(cmd).toBe('ln -sfn "/Users/a b/repo" "/opt/homebrew/lib/node_modules/bobbycode"');
  });

  test('deriveGlobalNodeModules maps <prefix>/bin/node to <prefix>/lib/node_modules', () => {
    expect(deriveGlobalNodeModules('/usr/local/bin/node'))
      .toBe(path.resolve('/usr/local/lib/node_modules'));
  });

  test('the derivation is WRONG for homebrew, which is why npm root -g is primary', () => {
    // process.execPath on homebrew is the Cellar path; the real global root is
    // /opt/homebrew/lib/node_modules. Documented as a test so nobody "simplifies"
    // globalNodeModules back to the derivation.
    expect(deriveGlobalNodeModules('/opt/homebrew/Cellar/node/25.2.1/bin/node'))
      .not.toBe(path.resolve('/opt/homebrew/lib/node_modules'));
  });
});
