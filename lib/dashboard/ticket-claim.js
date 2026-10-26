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

/** The env var carrying a claim token into an agent subprocess. */
export const CLAIM_TOKEN_ENV = 'BOBBY_TICKET_CLAIM';

/**
 * Is this claim OURS?
 *
 * A workflow runs several agents against one workspace — plan, then build, then
 * review — and the claim covers the workspace, so the holder must not be blocked
 * by its own claim.
 *
 * Identity is the TOKEN, not the pid. Pid was wrong in both directions: too
 * strict, because the app runs its agents as SUBPROCESSES with their own pids,
 * and CLAUDE.md's routing tells those agents to run `bobby run <stage> <their
 * own ticket>` — so a run was refused by its own orchestrator's claim; and too
 * loose, because a recycled pid on the same host would walk straight past a
 * claim it never took, bypassing the staleness check that is supposed to be the
 * pid-reuse backstop.
 *
 * The token is already persisted on the workspace record, and it reaches an
 * agent the same way the project pin does — an env var on the subprocess
 * (TKT-022's BOBBY_PROJECT is the precedent).
 */
export function isOwnClaim(record, token = process.env[CLAIM_TOKEN_ENV]) {
  if (!record || !token) return false;
  return record.token === token;
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
export function claimTicket(claimFile, { holder, token = process.env[CLAIM_TOKEN_ENV] } = {}) {
  fs.mkdirSync(path.dirname(claimFile), { recursive: true });

  // Re-taking a claim we already hold is a no-op, not a refusal. Without this the
  // check path and the acquire path disagree about the same record: isTicketClaimed
  // would say "free, it's yours" and claimTicket would refuse it.
  const existing = readTicketClaim(claimFile);
  if (existing && isOwnClaim(existing, token)) {
    return { record: existing, release: () => releaseLock(claimFile, existing.token) };
  }
  return acquireLock(claimFile, { holder, describe: claimedMessage });
}

/** Drop the claim if it is still ours. */
export function releaseTicketClaim(claimFile, token) {
  return releaseLock(claimFile, token);
}
