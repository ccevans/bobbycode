// lib/dashboard/main-checkout-lock.js
//
// ONE LOCK OVER THE MAIN CHECKOUT.
//
// Two things in Bobby touch the repo root's working tree, and they must never
// overlap:
//   - a REPO RUN — a freeform agent (ux, arch, docs, ship, …) that has no
//     worktree and edits the main checkout in place;
//   - a MERGE — mergeToMain stashes the main checkout, checks out main, merges
//     --no-ff, then pops (decisions.yaml `merge-mutates-the-main-checkout`).
// A merge landing mid-agent stashes the agent's half-written files and swaps
// the branch under its feet. That is data loss, not a glitch.
//
// WHY A LOCK FILE AND NOT AN IN-PROCESS MUTEX.
// Bobby is a CLI *and* an app. A module-level mutex is scoped to one Node
// process, so it cannot see a second `bobby app` serving the same repo, and it
// cannot see anything a terminal starts. Correctness here has to survive
// process boundaries, and the filesystem is the only thing both sides share.
// This is the same reasoning that made ticket IDs a `mkdir` claim rather than a
// counter in memory (`ticket-ids-claimed-by-mkdir`).
//   To be exact about today's reach: `bobby run ux` PRINTS a prompt and exits,
//   so the CLI has nothing to hold a lock for — the agent a human then runs is
//   outside Bobby entirely. What the file buys right now is a second `bobby
//   app` on the same repo, and whatever future command does its own work in
//   the checkout. The mutex would have to be replaced to get either.
//
// ORDINARY WORKTREE RUNS DO NOT TAKE THIS LOCK. They work in their own
// worktree, never the main checkout, and blocking them would make the app feel
// broken for the case it is built around.
//
// STALENESS — a crashed holder must not strand the repo forever, and BOTH
// checks are needed:
//   - PID LIVENESS reclaims the lock the instant the holder dies. A `kill -9`
//     on the app should not cost you the repo for hours. It is only meaningful
//     on the machine that wrote the lock, so it is gated on the hostname.
//   - AN AGE CEILING is the backstop for what pid liveness cannot decide: a
//     lock written from another host (a synced or shared checkout), and pid
//     REUSE, where a long-dead holder's number has been handed to some
//     unrelated live process and would otherwise look alive forever.
// Neither alone is sufficient; a lock is stale when either says so.
//
// The recorded pid is the SERVER's, not the agent subprocess's — the server is
// what will release the lock, so if the server is gone nobody ever will.
//
// WHAT THIS DOES NOT GUARANTEE, stated plainly. Taking a FREE lock is atomic:
// `wx` creates the file only if it does not exist, so of two processes racing,
// exactly one wins and the other is refused. RECLAIMING A STALE one is not:
// "read it, judge it dead, delete it, create ours" has a microsecond window in
// which a second process reading the same corpse reaches the same verdict and
// both end up believing they hold it. Closing that needs an acquire that can
// wait and re-verify, i.e. an async lock, and the case it would protect is two
// processes reclaiming the SAME crashed holder within the same instant — a
// state that already only arises after something died holding the lock. The
// simple synchronous version is the trade, and it is a trade, not an oversight.
// Do not "fix" the common path on the strength of this note: the free-lock
// case, which is every ordinary acquisition, is already exact.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export const LOCK_FILENAME = 'main-checkout.lock';

/**
 * The age ceiling. Long enough that a genuinely long agent run is never
 * mistaken for a corpse, short enough that a lock written by a machine we
 * cannot pid-check does not outlive a working day.
 */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Where the lock lives: alongside the rest of the repo's bobby state. */
export function mainCheckoutLockPath(repoRoot, config) {
  return path.join(repoRoot, (config && config.bobby_dir) || '.bobby', LOCK_FILENAME);
}

/**
 * The lock's contents, or null if there is no lock. A file that exists but does
 * not parse returns null — callers treat that as "held by something unreadable",
 * which `isStale` then reclaims.
 */
export function readLock(lockFile) {
  let raw;
  try {
    raw = fs.readFileSync(lockFile, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null;
  }
}

/** Is a pid running? EPERM means it exists but belongs to someone else. */
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * Whether a lock record may be reclaimed. See the staleness note in the header:
 * either the age ceiling or a dead pid is enough, and an unreadable record is
 * stale by definition — nothing can be learned from it, and leaving it would
 * wedge the repo permanently.
 */
export function isStale(record, now = Date.now()) {
  if (!record || typeof record !== 'object') return true;

  const age = now - Date.parse(record.startedAt);
  if (!Number.isFinite(age) || age >= STALE_AFTER_MS) return true;

  // Written elsewhere: our pid table says nothing about it, so the age ceiling
  // above is the only judge and it has already passed.
  if (record.host && record.host !== os.hostname()) return false;

  if (!Number.isInteger(record.pid)) return true;
  return !processAlive(record.pid);
}

/**
 * The refusal a caller sees when the lock is genuinely held. Same shape as the
 * concurrency cap's message: name what holds it, then the way out.
 */
export function heldMessage(record) {
  const who = (record && record.holder) || 'another bobby process';
  const pid = (record && record.pid) || '?';
  const since = record && record.startedAt ? `, since ${record.startedAt}` : '';
  return `The main checkout is in use by ${who} (pid ${pid}${since}). ` +
    'Only one thing may touch it at a time. Wait for it to finish, or stop it.';
}

const MAX_ATTEMPTS = 3;

/**
 * Take the lock, or throw a refusal naming the holder.
 *
 * `wx` is the atomic primitive: the file is created only if it does not exist,
 * so two processes racing cannot both succeed. On EEXIST we look at who holds
 * it; if that record is stale we clear it and retry, and a retry that loses
 * again means a live process beat us to the reclaim — which is a real refusal.
 *
 * The returned release only deletes a lock that still carries OUR token, so a
 * process whose stale lock was reclaimed can never delete the new holder's.
 *
 * @returns {{ record: object, release: () => boolean }}
 */
export function acquireMainCheckoutLock(lockFile, { holder }) {
  return acquireLock(lockFile, { holder, describe: heldMessage });
}

/**
 * The generic form: everything above, for any lock file and any refusal wording.
 *
 * The machinery here — atomic `wx` create, staleness by pid liveness OR age
 * ceiling, token-scoped release — is not specific to the main checkout. The
 * per-ticket claim (BOB-120) needs exactly the same guarantees against the same
 * adversary (a second Bobby process, possibly started from a terminal), so it
 * reuses this rather than growing a second, subtly different implementation.
 * Only the path and the wording differ, and both are parameters.
 *
 * @param {string} lockFile
 * @param {{ holder: string, describe: (record: object) => string }} opts
 * @returns {{ record: object, release: () => boolean }}
 */
export function acquireLock(lockFile, { holder, describe = heldMessage }) {
  const record = {
    holder,
    pid: process.pid,
    host: os.hostname(),
    token: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  };
  const payload = JSON.stringify(record, null, 2);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      fs.writeFileSync(lockFile, payload, { flag: 'wx', encoding: 'utf8' });
      return { record, release: () => releaseLock(lockFile, record.token) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }

    const existing = readLock(lockFile);
    if (!isStale(existing)) throw new Error(describe(existing));

    try {
      fs.unlinkSync(lockFile);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  throw new Error(describe(readLock(lockFile)));
}

/**
 * Drop the lock if it is still ours. Returns false when it is not — the lock
 * was reclaimed as stale and now belongs to someone else, and deleting it would
 * hand a third party a checkout that is actively in use.
 */
export function releaseLock(lockFile, token) {
  const existing = readLock(lockFile);
  if (!existing || existing.token !== token) return false;
  try {
    fs.unlinkSync(lockFile);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
