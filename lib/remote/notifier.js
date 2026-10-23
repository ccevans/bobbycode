// lib/remote/notifier.js
//
// The push producer (BOB-130). Watches the workspace store and asks the tunnel
// to wake the phone when a workspace stops and starts waiting on a human.
//
// The whole difficulty is in one word: EDGE. `store.update()` fires on every
// patch — an appended run, a checkpoint, a `lastError` — while the status sits
// still, so "the status is currently in the queue" would re-buzz the phone on
// every unrelated write. What matters is the transition INTO the queue, and it
// is compared on the mapped kind rather than the raw status so that
// `awaiting_approval → ready_to_merge` reads as a move within the queue, not a
// second arrival.
//
// Wired only by `bobby remote` (commands/remote.js), which is the one process
// that holds a store and a relay socket at the same time. `bobby app` has no
// tunnel and never constructs this.
import { NEEDS_YOU_STATUSES } from '../dashboard/state.js';

/**
 * Both mean "an agent stopped and achieved nothing you were watching for".
 * `no_op` is a clean exit that wrote nothing (state.js RUN_STATUSES) — a
 * failure the human is precisely not watching, which is what makes it worth a
 * push.
 */
export const FAILED_STATUSES = new Set(['failed', 'no_op']);

/**
 * Map a workspace status to the relay's push kind, or null for "say nothing".
 *
 * A deliberate SUBSET of the relay's kinds (pro hq/relay/push.js `KINDS`): the
 * relay also accepts `done`, but the only host status that would map to it is
 * `merged`, and merging is always a human action taken from the UI or the
 * phone. Pushing "work finished" to the device that just tapped Merge is noise.
 */
export function kindFor(status) {
  if (NEEDS_YOU_STATUSES.has(status)) return 'needs_you';
  if (FAILED_STATUSES.has(status)) return 'failed';
  return null;
}

/**
 * Subscribe to the store and call `send(kind)` on each rising edge into a
 * push-worthy status. Returns the unsubscribe function.
 *
 * There is deliberately NO rate limiter here. The relay already collapses
 * repeats (`MIN_PUSH_GAP_MS`, one push per channel+kind per 10s), and three
 * workspaces flipping at once legitimately send three notifies and legitimately
 * become one push. A second limiter on this side could only disagree with the
 * first.
 */
export function createNotifier({ store, send }) {
  // Seeded from the store as it stands, BEFORE subscribing. A host restart that
  // loads workspaces already parked in `awaiting_approval` must not read them
  // as fresh arrivals on their next unrelated write.
  const lastStatus = new Map();
  for (const workspace of store.list()) lastStatus.set(workspace.id, workspace.status);

  return store.subscribe((event, workspace) => {
    if (!workspace || !workspace.id) return;
    if (event === 'delete') {
      // Forget it, so a recycled id cannot inherit the old status.
      lastStatus.delete(workspace.id);
      return;
    }
    if (event !== 'create' && event !== 'update') return;

    const previous = lastStatus.get(workspace.id);
    lastStatus.set(workspace.id, workspace.status);

    const kind = kindFor(workspace.status);
    if (!kind || kind === kindFor(previous)) return;

    // Best-effort by nature: a push that cannot be sent must never break the
    // store write that triggered it. `_emit` isolates listener errors already,
    // but relying on that would make this depend on someone else's try/catch.
    try {
      send(kind);
    } catch { /* the phone stays quiet; the state change still stands */ }
  });
}
