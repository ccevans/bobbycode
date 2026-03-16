// test/lib/counter.test.js
import { nextId, nextIdeaId, repairCounter } from '../../lib/counter.js';
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

  test('nextIdeaId returns IDEA-001 on first call', () => {
    const id = nextIdeaId(tmpDir, 'IDEA');
    expect(id).toBe('IDEA-001');
  });

  test('repairCounter scans folders for max ID', () => {
    fs.writeFileSync(path.join(tmpDir, '.counter'), 'corrupted');
    // Create fake ticket folders
    fs.mkdirSync(path.join(tmpDir, '1-backlog', 'TKT-005--some-ticket'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '4-in-progress', 'TKT-012--another'), { recursive: true });
    const repaired = repairCounter(tmpDir, 'TKT');
    expect(repaired).toBe(12);
    const id = nextId(tmpDir, 'TKT');
    expect(id).toBe('TKT-013');
  });
});
