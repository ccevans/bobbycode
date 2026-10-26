// test/lib/remote/notifier.test.js
//
// BOB-130: the push producer. These tests drive a REAL WorkspaceStore against a
// tmpdir so `_emit` runs for real — the seam this feature hangs off is
// `store.update()` firing on every patch, and a fake store would let the
// false-positive this design exists to prevent slip through untested.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WorkspaceStore, NEEDS_YOU_STATUSES } from '../../../lib/dashboard/state.js';
import { createNotifier, kindFor } from '../../../lib/remote/notifier.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-notifier-'));
  return { dir, store: new WorkspaceStore(path.join(dir, 'workspaces.json')) };
}

function ws(id, status) {
  return { id, status, ticketId: 'TKT-001', createdAt: new Date().toISOString() };
}

describe('needs-you notifier', () => {
  const dirs = [];
  function freshStore() {
    const { dir, store } = tmpStore();
    dirs.push(dir);
    return store;
  }
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  // TC-1
  it('sends exactly one needs_you when the queue gains a ticket', () => {
    const store = freshStore();
    store.create(ws('ws1', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });

    store.update('ws1', { status: 'awaiting_approval', pid: null });

    expect(sent).toEqual(['needs_you']);
  });

  // TC-2 — the false positive the whole design exists to prevent.
  it('stays silent when a workspace already in the queue is written to again', () => {
    const store = freshStore();
    store.create(ws('ws1', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });
    store.update('ws1', { status: 'awaiting_approval', pid: null });

    // `store.update` fires for runs, checkpoints and lastError too — none of
    // these move the status, so none of them may buzz the phone.
    store.update('ws1', { runs: [{ status: 'completed' }] });
    store.update('ws1', { checkpoints: [{ sha: 'abc123' }] });
    store.update('ws1', { lastError: 'something' });

    expect(sent).toEqual(['needs_you']);
  });

  // TC-3
  it('does not re-fire on a move within the queue', () => {
    const store = freshStore();
    store.create(ws('ws1', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });
    store.update('ws1', { status: 'awaiting_approval' });

    store.update('ws1', { status: 'ready_to_merge' });

    // Both statuses map to `needs_you`. The human is already being waited on.
    expect(sent).toEqual(['needs_you']);
  });

  // TC-4 — a restart must not read parked workspaces as fresh arrivals.
  it('seeds from store.list() so a restart with a parked workspace fires nothing', () => {
    const store = freshStore();
    store.create(ws('ws2', 'awaiting_approval'));
    // Simulate the restart: a brand-new store object loading the same file.
    const reloaded = new WorkspaceStore(store.filePath).load();
    const sent = [];

    createNotifier({ store: reloaded, send: (k) => sent.push(k) });
    expect(sent).toEqual([]);

    reloaded.update('ws2', { lastError: 'stale' });
    expect(sent).toEqual([]);
  });

  // TC-5
  it('maps failed and no_op to the failed kind', () => {
    const store = freshStore();
    store.create(ws('ws3', 'running'));
    store.create(ws('ws4', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });

    store.update('ws3', { status: 'failed', pid: null });
    store.update('ws4', { status: 'no_op', pid: null });

    expect(sent).toEqual(['failed', 'failed']);
  });

  // TC-6
  it('never pushes for stopped, merged, idle, unknown or running', () => {
    const store = freshStore();
    store.create(ws('ws1', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });

    for (const status of ['stopped', 'merged', 'idle', 'unknown', 'running']) {
      store.update('ws1', { status });
    }

    expect(sent).toEqual([]);
  });

  // TC-7
  it('forgets a deleted workspace so a recycled id starts clean', () => {
    const store = freshStore();
    store.create(ws('ws5', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });
    store.update('ws5', { status: 'awaiting_approval' });
    store.delete('ws5');

    store.create(ws('ws5', 'running'));
    store.update('ws5', { status: 'awaiting_approval' });

    expect(sent).toEqual(['needs_you', 'needs_you']);
  });

  // TC-7b — the assertion that actually pins the `delete` branch. Recreating
  // the id directly IN a needs-you status only fires if the delete forgot the
  // old status; a notifier that kept it would compare kind-to-kind and go
  // silent about a workspace that is genuinely waiting on a human.
  it('treats a recreate straight into the queue as an arrival', () => {
    const store = freshStore();
    store.create(ws('ws7', 'running'));
    const sent = [];
    createNotifier({ store, send: (k) => sent.push(k) });
    store.update('ws7', { status: 'awaiting_approval' });
    store.delete('ws7');

    store.create(ws('ws7', 'awaiting_approval'));

    expect(sent).toEqual(['needs_you', 'needs_you']);
  });

  // TC-8 — a best-effort push must never roll back state.
  it('swallows a throwing send without breaking the store write', () => {
    const store = freshStore();
    store.create(ws('ws6', 'running'));
    createNotifier({ store, send: () => { throw new Error('socket gone'); } });

    const updated = store.update('ws6', { status: 'awaiting_approval' });

    expect(updated.status).toBe('awaiting_approval');
    expect(new WorkspaceStore(store.filePath).load().get('ws6').status).toBe('awaiting_approval');
  });

  // The notifier's OWN catch. TC-8 above goes through `_emit`, which isolates
  // listener errors itself — so it passes with or without a try/catch here and
  // proves nothing about this module. Driving the registered listener directly
  // is the only way to see whether the swallow is real, and it must be: a push
  // is best-effort, and `_emit`'s shield is someone else's promise to keep.
  it('swallows a throwing send inside its own listener', () => {
    let listener;
    const store = {
      list: () => [],
      subscribe: (fn) => { listener = fn; return () => {}; },
    };
    createNotifier({ store, send: () => { throw new Error('socket gone'); } });

    expect(() => listener('update', { id: 'ws9', status: 'awaiting_approval' })).not.toThrow();
  });

  it('stops listening once the returned unsubscribe is called', () => {
    const store = freshStore();
    store.create(ws('ws1', 'running'));
    const sent = [];
    const stop = createNotifier({ store, send: (k) => sent.push(k) });

    stop();
    store.update('ws1', { status: 'awaiting_approval' });

    expect(sent).toEqual([]);
  });

  describe('kindFor', () => {
    it('classifies each workspace status', () => {
      expect(kindFor('awaiting_approval')).toBe('needs_you');
      expect(kindFor('ready_to_merge')).toBe('needs_you');
      expect(kindFor('failed')).toBe('failed');
      expect(kindFor('no_op')).toBe('failed');
      for (const s of ['idle', 'running', 'merged', 'stopped', 'unknown', undefined, null]) {
        expect(kindFor(s)).toBeNull();
      }
    });
  });
});

// TC-9
describe('NEEDS_YOU_STATUSES', () => {
  it('matches the app-side definition exactly', () => {
    // This MUST stay identical to `NEEDS_YOU` in the pro repo's
    // app/app/lib/store.js — the single definition the Home view, the Board and
    // the iPhone widget all read. If the two drift, the push and the screen it
    // opens disagree about what is waiting.
    expect([...NEEDS_YOU_STATUSES].sort()).toEqual(['awaiting_approval', 'ready_to_merge']);
  });
});
