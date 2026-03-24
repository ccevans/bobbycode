// test/lib/counter.test.js
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
});
