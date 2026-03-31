// test/lib/counter.test.js
import { jest } from '@jest/globals';
import { nextId, repairCounter } from '../../lib/counter.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('counter', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-counter-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('nextId returns TKT-001 on first call and creates directory', () => {
    const result = nextId(tmpDir, 'TKT', 'my-ticket');
    expect(result.id).toBe('TKT-001');
    expect(result.dirname).toBe('TKT-001--my-ticket');
    expect(fs.existsSync(result.dirpath)).toBe(true);
  });

  test('nextId increments on subsequent calls', () => {
    nextId(tmpDir, 'TKT', 'first');
    const result = nextId(tmpDir, 'TKT', 'second');
    expect(result.id).toBe('TKT-002');
    expect(result.dirname).toBe('TKT-002--second');
  });

  test('nextId pads to 3 digits', () => {
    fs.writeFileSync(path.join(tmpDir, '.counter'), '99');
    const result = nextId(tmpDir, 'TKT', 'ticket');
    expect(result.id).toBe('TKT-100');
  });

  test('nextId skips existing directories (EEXIST retry)', () => {
    // Pre-create TKT-001 directory to simulate a race
    fs.mkdirSync(path.join(tmpDir, 'TKT-001--existing'));
    const result = nextId(tmpDir, 'TKT', 'new-ticket');
    expect(result.id).toBe('TKT-002');
    expect(result.dirname).toBe('TKT-002--new-ticket');
    expect(fs.existsSync(result.dirpath)).toBe(true);
  });

  test('nextId skips multiple existing directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'TKT-001--a'));
    fs.mkdirSync(path.join(tmpDir, 'TKT-002--b'));
    fs.mkdirSync(path.join(tmpDir, 'TKT-003--c'));
    const result = nextId(tmpDir, 'TKT', 'new');
    expect(result.id).toBe('TKT-004');
  });

  test('concurrent nextId calls produce unique IDs', async () => {
    const count = 10;
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        Promise.resolve(nextId(tmpDir, 'TKT', `ticket-${i}`))
      )
    );
    const ids = results.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(count);
  });

  test('repairCounter scans single directory for max ID', () => {
    fs.writeFileSync(path.join(tmpDir, '.counter'), 'corrupted');
    fs.mkdirSync(path.join(tmpDir, 'TKT-005--some-ticket'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'TKT-012--another'), { recursive: true });
    const repaired = repairCounter(tmpDir, 'TKT');
    expect(repaired).toBe(12);
    const result = nextId(tmpDir, 'TKT', 'next');
    expect(result.id).toBe('TKT-013');
  });

  test('repairCounter returns 0 for empty directory', () => {
    const repaired = repairCounter(tmpDir, 'TKT');
    expect(repaired).toBe(0);
  });

  test('repairCounter returns 0 for nonexistent directory', () => {
    const repaired = repairCounter(path.join(tmpDir, 'nonexistent'), 'TKT');
    expect(repaired).toBe(0);
  });

  test('nextId triggers repair on corrupted counter', () => {
    fs.writeFileSync(path.join(tmpDir, '.counter'), 'not-a-number');
    fs.mkdirSync(path.join(tmpDir, 'TKT-003--ticket'), { recursive: true });
    const result = nextId(tmpDir, 'TKT', 'new');
    expect(result.id).toBe('TKT-004');
  });

  test('nextId throws after exhausting MAX_RETRIES', () => {
    // Pre-create 21 directories (counter at 0, tries 1-20 all taken)
    for (let i = 1; i <= 21; i++) {
      fs.mkdirSync(path.join(tmpDir, `TKT-${String(i).padStart(3, '0')}--taken`));
    }
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
    expect(() => nextId(tmpDir, 'TKT', 'new')).toThrow('Failed to claim ticket ID after');
  });

  test('nextId works when counter file is missing', () => {
    // No .counter file — should start from 0
    const result = nextId(tmpDir, 'TKT', 'first');
    expect(result.id).toBe('TKT-001');
  });

  test('nextId retries on EEXIST from mkdir race condition', () => {
    // Simulate: readdirSync sees nothing, but another process creates TKT-001 before mkdirSync
    const origMkdirSync = fs.mkdirSync;
    let raceTriggered = false;
    const spy = jest.spyOn(fs, 'mkdirSync').mockImplementation((dirpath, opts) => {
      if (!raceTriggered && dirpath.includes('TKT-001')) {
        raceTriggered = true;
        const err = new Error('EEXIST');
        err.code = 'EEXIST';
        throw err;
      }
      return origMkdirSync(dirpath, opts);
    });

    const result = nextId(tmpDir, 'TKT', 'raced');
    expect(result.id).toBe('TKT-002'); // Skipped 001 due to EEXIST
    spy.mockRestore();
  });

  test('nextId uses empty array when ticketsDir does not exist for readdirSync', () => {
    // Trick: make existsSync return false for the tickets dir check on line 25
    // but the counter file still exists. We do this by spying.
    const origExistsSync = fs.existsSync;
    let callCount = 0;
    const spy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // The counter file check comes first (inside readCounter), then ticketsDir check
      // Counter file: path ends with '.counter'
      // ticketsDir check: path === tmpDir
      if (p === tmpDir && callCount === 0) {
        callCount++;
        return false; // pretend ticketsDir doesn't exist for the readdirSync check
      }
      return origExistsSync(p);
    });

    const result = nextId(tmpDir, 'TKT', 'new');
    expect(result.id).toBe('TKT-001');
    spy.mockRestore();
  });

  test('repairCounter skips non-matching entries', () => {
    fs.mkdirSync(path.join(tmpDir, 'not-a-ticket'));
    fs.mkdirSync(path.join(tmpDir, 'TKT-005--real'));
    fs.mkdirSync(path.join(tmpDir, 'OTHER-001--different'));
    const repaired = repairCounter(tmpDir, 'TKT');
    expect(repaired).toBe(5);
  });

  test('repairCounter handles lower ID seen after higher (num <= maxId branch)', () => {
    // Mock readdirSync to return entries in reverse order so higher ID is seen first
    fs.mkdirSync(path.join(tmpDir, 'TKT-003--lower'));
    fs.mkdirSync(path.join(tmpDir, 'TKT-010--higher'));
    const origReaddirSync = fs.readdirSync;
    const spy = jest.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
      const entries = origReaddirSync(dir);
      return entries.reverse(); // TKT-010 before TKT-003
    });
    const repaired = repairCounter(tmpDir, 'TKT');
    expect(repaired).toBe(10);
    spy.mockRestore();
  });

  test('nextId propagates non-EEXIST errors from mkdir', () => {
    const spy = jest.spyOn(fs, 'mkdirSync').mockImplementation((dirpath, opts) => {
      if (dirpath.includes('TKT-')) {
        const err = new Error('EACCES');
        err.code = 'EACCES';
        throw err;
      }
    });

    expect(() => nextId(tmpDir, 'TKT', 'fail')).toThrow('EACCES');
    spy.mockRestore();
  });
});
