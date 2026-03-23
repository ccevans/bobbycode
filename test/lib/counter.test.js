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

  test('nextId returns TKT-001 on first call', () => {
    const id = nextId(tmpDir, 'TKT');
    expect(id).toBe('TKT-001');
  });

  test('nextId increments on subsequent calls', () => {
    nextId(tmpDir, 'TKT');
    const id = nextId(tmpDir, 'TKT');
    expect(id).toBe('TKT-002');
  });

  test('nextId pads to 3 digits', () => {
    fs.writeFileSync(path.join(tmpDir, '.counter'), '99');
    const id = nextId(tmpDir, 'TKT');
    expect(id).toBe('TKT-100');
  });

  test('repairCounter scans single directory for max ID', () => {
    fs.writeFileSync(path.join(tmpDir, '.counter'), 'corrupted');
    // Create fake ticket folders in the single tickets directory
    fs.mkdirSync(path.join(tmpDir, 'TKT-005--some-ticket'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'TKT-012--another'), { recursive: true });
    const repaired = repairCounter(tmpDir, 'TKT');
    expect(repaired).toBe(12);
    const id = nextId(tmpDir, 'TKT');
    expect(id).toBe('TKT-013');
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
    const id = nextId(tmpDir, 'TKT');
    expect(id).toBe('TKT-004');
  });
});
