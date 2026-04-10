// test/lib/dashboard/state.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkspaceStore, newWorkspace, makeWorkspaceId, WORKSPACE_STATUSES } from '../../../lib/dashboard/state.js';

describe('WorkspaceStore', () => {
  let tmpDir;
  let filePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-state-'));
    filePath = path.join(tmpDir, 'workspaces.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('load on missing file returns empty store', () => {
    const store = new WorkspaceStore(filePath).load();
    expect(store.list()).toEqual([]);
  });

  test('create and retrieve a workspace', () => {
    const store = new WorkspaceStore(filePath).load();
    const ws = newWorkspace({
      id: 'ws-TKT-1-plan-abc',
      ticketId: 'TKT-1',
      worktreePath: '/tmp/wt',
      branch: 'bobby/tkt-1-plan',
      agent: 'plan',
    });
    store.create(ws);
    expect(store.get('ws-TKT-1-plan-abc')).toMatchObject({
      ticketId: 'TKT-1',
      agent: 'plan',
      status: 'idle',
    });
    expect(store.list()).toHaveLength(1);
  });

  test('duplicate create throws', () => {
    const store = new WorkspaceStore(filePath).load();
    const ws = newWorkspace({ id: 'dup', ticketId: 'T', worktreePath: '/x', branch: 'b' });
    store.create(ws);
    expect(() => store.create(ws)).toThrow(/already exists/);
  });

  test('update merges patch and bumps updatedAt', async () => {
    const store = new WorkspaceStore(filePath).load();
    const ws = newWorkspace({ id: 'x', ticketId: 'T', worktreePath: '/x', branch: 'b' });
    store.create(ws);
    const before = store.get('x').updatedAt;
    // Ensure a clock tick
    await new Promise(r => setTimeout(r, 10));
    const updated = store.update('x', { status: 'running', pid: 1234 });
    expect(updated.status).toBe('running');
    expect(updated.pid).toBe(1234);
    expect(updated.ticketId).toBe('T'); // untouched
    expect(updated.updatedAt).not.toBe(before);
  });

  test('update on unknown id throws', () => {
    const store = new WorkspaceStore(filePath).load();
    expect(() => store.update('nope', {})).toThrow(/not found/);
  });

  test('id is immutable across updates', () => {
    const store = new WorkspaceStore(filePath).load();
    store.create(newWorkspace({ id: 'keep-me', ticketId: 'T', worktreePath: '/x', branch: 'b' }));
    store.update('keep-me', { id: 'hacked', status: 'running' });
    expect(store.get('keep-me')).toBeTruthy();
    expect(store.get('hacked')).toBeNull();
  });

  test('appendRun adds to run history', () => {
    const store = new WorkspaceStore(filePath).load();
    store.create(newWorkspace({ id: 'a', ticketId: 'T', worktreePath: '/x', branch: 'b' }));
    store.appendRun('a', { agent: 'plan', exitCode: 0 });
    store.appendRun('a', { agent: 'build', exitCode: 1 });
    expect(store.get('a').runs).toHaveLength(2);
    expect(store.get('a').runs[1].exitCode).toBe(1);
  });

  test('appendCheckpoint stamps at timestamp', () => {
    const store = new WorkspaceStore(filePath).load();
    store.create(newWorkspace({ id: 'a', ticketId: 'T', worktreePath: '/x', branch: 'b' }));
    store.appendCheckpoint('a', { turn: 1, sha: 'abc123', message: 'first' });
    const cps = store.get('a').checkpoints;
    expect(cps).toHaveLength(1);
    expect(cps[0].sha).toBe('abc123');
    expect(cps[0].at).toBeTruthy();
  });

  test('save and reload round-trip', () => {
    const a = new WorkspaceStore(filePath).load();
    a.create(newWorkspace({ id: '1', ticketId: 'T1', worktreePath: '/a', branch: 'b1' }));
    a.create(newWorkspace({ id: '2', ticketId: 'T2', worktreePath: '/b', branch: 'b2' }));
    const b = new WorkspaceStore(filePath).load();
    expect(b.list()).toHaveLength(2);
    expect(b.get('1').ticketId).toBe('T1');
  });

  test('corrupt file loads as empty without throwing', () => {
    fs.writeFileSync(filePath, '{ not json');
    const errs = [];
    const origErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg) => { errs.push(String(msg)); return true; };
    try {
      const store = new WorkspaceStore(filePath).load();
      expect(store.list()).toEqual([]);
    } finally {
      process.stderr.write = origErr;
    }
    expect(errs.some(e => e.includes('corrupt'))).toBe(true);
  });

  test('atomic save leaves file readable even across reads', () => {
    const store = new WorkspaceStore(filePath).load();
    store.create(newWorkspace({ id: 'a', ticketId: 'T', worktreePath: '/x', branch: 'b' }));
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(parsed.version).toBe(1);
    expect(parsed.workspaces.a.ticketId).toBe('T');
  });

  test('delete removes and persists', () => {
    const store = new WorkspaceStore(filePath).load();
    store.create(newWorkspace({ id: 'a', ticketId: 'T', worktreePath: '/x', branch: 'b' }));
    expect(store.delete('a')).toBe(true);
    expect(store.get('a')).toBeNull();
    const fresh = new WorkspaceStore(filePath).load();
    expect(fresh.list()).toEqual([]);
  });

  test('subscribe receives events', () => {
    const store = new WorkspaceStore(filePath).load();
    const events = [];
    const unsub = store.subscribe((ev, ws) => events.push([ev, ws.id]));
    store.create(newWorkspace({ id: 'a', ticketId: 'T', worktreePath: '/x', branch: 'b' }));
    store.update('a', { status: 'running' });
    store.delete('a');
    unsub();
    store.create(newWorkspace({ id: 'b', ticketId: 'T2', worktreePath: '/x', branch: 'b2' }));
    expect(events).toEqual([
      ['create', 'a'],
      ['update', 'a'],
      ['delete', 'a'],
    ]);
  });

  test('reconcileAfterRestart marks running workspaces as unknown', () => {
    const a = new WorkspaceStore(filePath).load();
    const ws = newWorkspace({ id: 'r', ticketId: 'T', worktreePath: '/x', branch: 'b' });
    ws.status = 'running';
    ws.pid = 12345;
    a.create(ws);
    const b = new WorkspaceStore(filePath).load();
    b.reconcileAfterRestart();
    const reloaded = b.get('r');
    expect(reloaded.status).toBe('unknown');
    expect(reloaded.pid).toBeNull();
    expect(reloaded.lastError).toContain('restarted');
  });

  test('makeWorkspaceId is unique-ish and deterministic-ish', () => {
    const a = makeWorkspaceId('TKT-1', 'plan');
    const b = makeWorkspaceId('TKT-1', 'plan');
    expect(a).toMatch(/^ws-TKT-1-plan-/);
    expect(b).toMatch(/^ws-TKT-1-plan-/);
    expect(a).not.toBe(b); // random suffix varies
  });

  test('WORKSPACE_STATUSES enumerates all expected states', () => {
    expect(WORKSPACE_STATUSES).toEqual(expect.arrayContaining([
      'idle', 'running', 'awaiting_approval', 'ready_to_merge',
      'merged', 'failed', 'stopped', 'unknown',
    ]));
  });
});
