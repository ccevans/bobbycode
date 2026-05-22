// test/lib/sprint.test.js
import {
  createSprint, findSprint, listSprints, readSprint, writeSprint,
  addTicketsToSprint, removeTicketsFromSprint, setSprintStatus, SPRINT_STATUSES,
} from '../../lib/sprint.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('sprint', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-sprint-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('createSprint creates a directory with sprint.yml and sprint-plan.md', () => {
    const r = createSprint(tmpDir, { name: 'Auth overhaul', goal: 'Passwordless login', tickets: ['TKT-001'] });
    expect(r.id).toBe('SPR-001');
    expect(fs.existsSync(path.join(r.path, 'sprint.yml'))).toBe(true);
    expect(fs.existsSync(path.join(r.path, 'sprint-plan.md'))).toBe(true);
    expect(r.data.branch).toBe('feature/spr-001-auth-overhaul');
    expect(r.data.status).toBe('planned');
    expect(r.data.tickets).toEqual(['TKT-001']);
  });

  test('createSprint honors a custom branch prefix', () => {
    const r = createSprint(tmpDir, { name: 'Cleanup', branchPrefix: 'feat' });
    expect(r.data.branch).toBe('feat/spr-001-cleanup');
  });

  test('createSprint requires a name', () => {
    expect(() => createSprint(tmpDir, { name: '   ' })).toThrow(/name/i);
  });

  test('sprint IDs increment', () => {
    const a = createSprint(tmpDir, { name: 'One' });
    const b = createSprint(tmpDir, { name: 'Two' });
    expect(a.id).toBe('SPR-001');
    expect(b.id).toBe('SPR-002');
  });

  test('findSprint locates a sprint by ID', () => {
    createSprint(tmpDir, { name: 'Find me' });
    const s = findSprint(tmpDir, 'SPR-001');
    expect(s).not.toBeNull();
    expect(s.data.name).toBe('Find me');
  });

  test('findSprint returns null for unknown ID', () => {
    expect(findSprint(tmpDir, 'SPR-999')).toBeNull();
  });

  test('listSprints returns all sprints sorted by ID', () => {
    createSprint(tmpDir, { name: 'Two' });
    createSprint(tmpDir, { name: 'One' });
    expect(listSprints(tmpDir).map(s => s.id)).toEqual(['SPR-001', 'SPR-002']);
  });

  test('listSprints returns empty for missing dir', () => {
    expect(listSprints(path.join(tmpDir, 'nope'))).toEqual([]);
  });

  test('addTicketsToSprint appends unique tickets preserving order', () => {
    createSprint(tmpDir, { name: 'S', tickets: ['TKT-001'] });
    const { sprint, added } = addTicketsToSprint(tmpDir, 'SPR-001', ['TKT-002', 'TKT-001', 'TKT-003']);
    expect(added).toEqual(['TKT-002', 'TKT-003']);
    expect(sprint.tickets).toEqual(['TKT-001', 'TKT-002', 'TKT-003']);
  });

  test('addTicketsToSprint throws for unknown sprint', () => {
    expect(() => addTicketsToSprint(tmpDir, 'SPR-999', ['TKT-001'])).toThrow(/not found/);
  });

  test('removeTicketsFromSprint drops the given tickets', () => {
    createSprint(tmpDir, { name: 'S', tickets: ['TKT-001', 'TKT-002', 'TKT-003'] });
    const { sprint, removed } = removeTicketsFromSprint(tmpDir, 'SPR-001', ['TKT-002']);
    expect(removed).toBe(1);
    expect(sprint.tickets).toEqual(['TKT-001', 'TKT-003']);
  });

  test('setSprintStatus updates the status', () => {
    createSprint(tmpDir, { name: 'S' });
    expect(setSprintStatus(tmpDir, 'SPR-001', 'active').status).toBe('active');
  });

  test('setSprintStatus rejects an invalid status', () => {
    createSprint(tmpDir, { name: 'S' });
    expect(() => setSprintStatus(tmpDir, 'SPR-001', 'bogus')).toThrow(/invalid status/i);
  });

  test('readSprint/writeSprint round-trip the manifest', () => {
    const r = createSprint(tmpDir, { name: 'S' });
    const data = { ...r.data, goal: 'updated goal' };
    writeSprint(r.path, data);
    expect(readSprint(r.path).data.goal).toBe('updated goal');
  });

  test('readSprint coerces a missing tickets field to an empty array', () => {
    const r = createSprint(tmpDir, { name: 'S' });
    const raw = YAML.parse(fs.readFileSync(path.join(r.path, 'sprint.yml'), 'utf8'));
    delete raw.tickets;
    fs.writeFileSync(path.join(r.path, 'sprint.yml'), YAML.stringify(raw));
    expect(readSprint(r.path).data.tickets).toEqual([]);
  });

  test('SPRINT_STATUSES exposes the valid statuses', () => {
    expect(SPRINT_STATUSES).toContain('planned');
    expect(SPRINT_STATUSES).toContain('done');
  });
});
