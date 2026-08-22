// lib/dashboard/ticket-claim.js
//
// ONE LIVE CLAIM PER TICKET (BOB-120).
//
// Bobby's model is many agents on one board, and it already guards the two
// races that model creates: the concurrency cap bounds how many run at once,
// and main-checkout-lock.js stops a repo run and a merge overlapping. Ticket-level
// double-claiming was the one left uncovered — and it is not theoretical. The
// app's createWorkspace checked only that a ticket EXISTS, so tapping "Start
// work" on a ticket a background agent was already running just made a second
// workspace on the same branch. The only thing preventing it was a verbal
// "please don't tap that", which is not a design.
//
// WHY NOT THE `assigned:` FIELD. Tickets already carry `assigned:`, and CLI
// batch mode filters on it. But it is STATIC: it stays set after a run ends and
// nothing clears it on a crash, so it cannot answer "is a run active on this
// ticket right now" — the actual question. Making it load-bearing would mean
// adding holder, timestamp and staleness to ticket frontmatter, i.e. rebuilding
// a lock inside a document that humans hand-edit.
//
// WHY ON THE BOARD. The claim has to be visible to orchestrators that share no
// memory: `bobby app`, a `bobby run` in a terminal, and a background agent are
// three processes. The board is the only thing all three already agree on — the
// same reasoning main-checkout-lock.js gives for a file over a mutex.
//
// STALENESS is inherited wholesale from main-checkout-lock.js (pid liveness, or
// an age ceiling for locks written elsewhere / pid reuse). A run that dies must
// not strand its ticket forever.
import path from 'path';
import fs from 'fs';
import os from 'os';
import { acquireLock, readLock, isStale, releaseLock } from './main-checkout-lock.js';

/** Claims live beside the ticket, so they travel with the board. */
export function ticketClaimPath(ticketsDir, ticketDirName) {
  return path.join(ticketsDir, ticketDirName, 'run.lock');
}

/** The same, from a ticket record as findTicket() returns it. */
export function claimFileForTicket(ticket) {
  return path.join(ticket.path, 'run.lock');
}

/** The refusal: name the holder and when it started, then the way out. */
export function claimedMessage(record) {
  const who = (record && record.holder) || 'another run';
  const since = record && record.startedAt ? `, started ${record.startedAt}` : '';
  return `This ticket already has a run in progress — ${who}${since}. ` +
    'Two runs on one ticket share a branch and overwrite each other. ' +
    'Wait for it to finish, or stop it.';
}

/**
 * The live claim on a ticket, or null when it is free.
 *
 * A stale record reads as FREE: the point of staleness is that a dead holder
 * does not block, and callers asking "is this claimed" want the same answer the
 * acquire path would give them.
 */
export function readTicketClaim(claimFile) {
  const record = readLock(claimFile);
  if (!record) return null;
  return isStale(record) ? null : record;
}

/**
 * Is this claim OURS?
 *
 * A workflow runs several agents against one workspace — plan, then build, then
 * review — and the claim covers the workspace, so the holder must not be blocked
 * by its own claim. Identity is the recorded pid on this host: the app's
 * orchestrator is the process that took the claim, so its own next stage passes
 * freely, while a `bobby run` in another terminal is a different pid and is
 * refused. Without this the claim would stop a ticket progressing at all.
 */
export function isOwnClaim(record) {
  if (!record) return false;
  if (record.host && record.host !== os.hostname()) return false;
  return record.pid === process.pid;
}

/**
 * Whether a run started HERE, NOW would collide with one already in flight.
 *
 * Our own claim does not collide — see isOwnClaim.
 */
export function isTicketClaimed(claimFile) {
  const record = readTicketClaim(claimFile);
  return record !== null && !isOwnClaim(record);
}

/**
 * Claim the ticket, or throw a refusal naming the holder.
 *
 * Atomicity is `wx`, as with the main-checkout lock: of two orchestrators
 * racing one free ticket, exactly one wins and the other is refused. The same
 * documented caveat applies — reclaiming a STALE record is not atomic — and the
 * same trade is accepted for the same reason: it only arises after something
 * has already died holding the claim.
 *
 * @returns {{ record: object, release: () => boolean }}
 */
export function claimTicket(claimFile, { holder }) {
  fs.mkdirSync(path.dirname(claimFile), { recursive: true });
  return acquireLock(claimFile, { holder, describe: claimedMessage });
}

/** Drop the claim if it is still ours. */
export function releaseTicketClaim(claimFile, token) {
  return releaseLock(claimFile, token);
}
