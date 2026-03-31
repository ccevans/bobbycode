// test/lib/license.test.js
import { readLicenseKey, saveLicenseKey, LicenseError, proGuard } from '../../lib/license.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('license', () => {
  const origHome = process.env.HOME;
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-license-'));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true });
  });

  test('readLicenseKey returns null when no license exists', () => {
    expect(readLicenseKey()).toBeNull();
  });

  test('falls back to os.homedir when HOME is unset', () => {
    const savedHome = process.env.HOME;
    delete process.env.HOME;
    // Should not throw — falls back to os.homedir()
    const result = readLicenseKey();
    expect(result).toBeNull(); // No license at os.homedir()/.bobby/license
    process.env.HOME = savedHome;
  });

  test('saveLicenseKey creates ~/.bobby/license', () => {
    saveLicenseKey('sk_test_123');
    expect(readLicenseKey()).toBe('sk_test_123');
  });

  test('proGuard allows free commands without license', async () => {
    const result = await proGuard('create');
    expect(result).toBe(true);
  });

  test('proGuard throws LicenseError for pro commands without license', async () => {
    await expect(proGuard('dashboard')).rejects.toThrow(LicenseError);
  });

  test('proGuard passes for pro commands with valid license', async () => {
    saveLicenseKey('sk_valid_key');
    const result = await proGuard('dashboard');
    expect(result).toBe(true);
  });

  test('proGuard checks all pro commands', async () => {
    for (const cmd of ['dashboard', 'velocity', 'report', 'skills']) {
      await expect(proGuard(cmd)).rejects.toThrow(LicenseError);
    }
  });

  test('proGuard allows all non-pro commands', async () => {
    for (const cmd of ['create', 'list', 'move', 'run', 'init']) {
      const result = await proGuard(cmd);
      expect(result).toBe(true);
    }
  });

  test('saveLicenseKey creates directory and writes file', () => {
    saveLicenseKey('sk_test_456');
    const licPath = path.join(tmpHome, '.bobby', 'license');
    expect(fs.existsSync(licPath)).toBe(true);
    expect(fs.readFileSync(licPath, 'utf8')).toBe('sk_test_456');
  });

  test('readLicenseKey trims whitespace', () => {
    saveLicenseKey('  sk_test_789  ');
    // saveLicenseKey writes as-is, but readLicenseKey trims
    expect(readLicenseKey()).toBe('sk_test_789');
  });

  test('proGuard uses cache for subsequent calls', async () => {
    saveLicenseKey('sk_cached');
    // First call validates and caches
    await proGuard('dashboard');
    // Second call should use cache
    const result = await proGuard('dashboard');
    expect(result).toBe(true);
    // Verify cache file exists
    const cacheFile = path.join(tmpHome, '.bobby', 'license-cache.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    expect(cache.valid).toBe(true);
    expect(cache.timestamp).toBeTruthy();
  });

  test('proGuard throws for expired/invalid license', async () => {
    saveLicenseKey('');
    await expect(proGuard('dashboard')).rejects.toThrow(LicenseError);
  });

  test('proGuard with stale cache re-validates online', async () => {
    saveLicenseKey('sk_stale');
    // Create a stale cache (older than 24h but within 7d hard expire)
    const bobbyPath = path.join(tmpHome, '.bobby');
    fs.mkdirSync(bobbyPath, { recursive: true });
    const staleTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    fs.writeFileSync(
      path.join(bobbyPath, 'license-cache.json'),
      JSON.stringify({ valid: true, timestamp: staleTimestamp }),
      'utf8'
    );
    const result = await proGuard('dashboard');
    expect(result).toBe(true);
    // Cache should be refreshed
    const cache = JSON.parse(fs.readFileSync(path.join(bobbyPath, 'license-cache.json'), 'utf8'));
    expect(cache.timestamp).toBeGreaterThan(staleTimestamp);
  });

  test('proGuard uses fresh cache without re-validating', async () => {
    saveLicenseKey('sk_fresh');
    // Create a fresh cache
    const bobbyPath = path.join(tmpHome, '.bobby');
    fs.mkdirSync(bobbyPath, { recursive: true });
    fs.writeFileSync(
      path.join(bobbyPath, 'license-cache.json'),
      JSON.stringify({ valid: true, timestamp: Date.now() }),
      'utf8'
    );
    const result = await proGuard('dashboard');
    expect(result).toBe(true);
  });

  test('readCache handles corrupted JSON gracefully', async () => {
    saveLicenseKey('sk_corrupt');
    const bobbyPath = path.join(tmpHome, '.bobby');
    fs.mkdirSync(bobbyPath, { recursive: true });
    fs.writeFileSync(path.join(bobbyPath, 'license-cache.json'), 'not json', 'utf8');
    // Should fall through to online validation (which succeeds for any non-empty key)
    const result = await proGuard('dashboard');
    expect(result).toBe(true);
  });

  test('proGuard throws when validateKey returns false (invalid key result)', async () => {
    // An empty string key will cause validateKeyOnline to return false
    // But proGuard checks !key first... so saveLicenseKey with empty won't work
    // Use a key that writes but then manually clear the cache to force re-validation
    saveLicenseKey('sk_key');
    const bobbyPath = path.join(tmpHome, '.bobby');

    // Write a fresh cache that says valid: false
    fs.writeFileSync(
      path.join(bobbyPath, 'license-cache.json'),
      JSON.stringify({ valid: false, timestamp: Date.now() }),
      'utf8'
    );
    // proGuard should see cache.valid === false and throw
    await expect(proGuard('dashboard')).rejects.toThrow('License expired or invalid');
  });

  test('stale cache falls back to cache value when online fails', async () => {
    saveLicenseKey('sk_offline');
    const bobbyPath = path.join(tmpHome, '.bobby');
    fs.mkdirSync(bobbyPath, { recursive: true });

    // Create a stale cache (25 hours old, within 7-day hard expire)
    const staleTimestamp = Date.now() - (25 * 60 * 60 * 1000);
    fs.writeFileSync(
      path.join(bobbyPath, 'license-cache.json'),
      JSON.stringify({ valid: true, timestamp: staleTimestamp }),
      'utf8'
    );

    // Make writeCache fail by making the cache file read-only
    // This causes the try block in validateKey (stale path) to throw,
    // hitting the catch block which falls back to cache.valid
    const cacheFilePath = path.join(bobbyPath, 'license-cache.json');
    fs.chmodSync(cacheFilePath, 0o444);
    // Also make the directory non-writable so mkdirSync in writeCache fails
    fs.chmodSync(bobbyPath, 0o555);

    try {
      const result = await proGuard('dashboard');
      expect(result).toBe(true);
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(bobbyPath, 0o755);
      fs.chmodSync(cacheFilePath, 0o644);
    }
  });

  test('no cache and online validation fails returns false', async () => {
    saveLicenseKey('sk_nofail');
    const bobbyPath = path.join(tmpHome, '.bobby');

    // Make bobby dir read-only so writeCache throws in the no-cache path
    fs.chmodSync(bobbyPath, 0o555);

    try {
      // validateKeyOnline succeeds but writeCache throws, hitting catch on line 65-66
      // catch returns false, proGuard throws LicenseError
      await expect(proGuard('dashboard')).rejects.toThrow('License expired or invalid');
    } finally {
      fs.chmodSync(bobbyPath, 0o755);
    }
  });

  test('hard-expired stale cache returns false when online fails', async () => {
    saveLicenseKey('sk_hardexpire');
    const bobbyPath = path.join(tmpHome, '.bobby');
    fs.mkdirSync(bobbyPath, { recursive: true });

    // Create a very stale cache (8 days old, past 7-day hard expire)
    const veryStaleTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
    fs.writeFileSync(
      path.join(bobbyPath, 'license-cache.json'),
      JSON.stringify({ valid: true, timestamp: veryStaleTimestamp }),
      'utf8'
    );

    // Make dir read-only so writeCache fails
    const cacheFilePath = path.join(bobbyPath, 'license-cache.json');
    fs.chmodSync(cacheFilePath, 0o444);
    fs.chmodSync(bobbyPath, 0o555);

    try {
      // Stale cache, online fails (writeCache throws), age > hard expire → returns false
      await expect(proGuard('dashboard')).rejects.toThrow('License expired or invalid');
    } finally {
      fs.chmodSync(bobbyPath, 0o755);
      fs.chmodSync(cacheFilePath, 0o644);
    }
  });
});
