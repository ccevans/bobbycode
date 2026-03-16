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
});
