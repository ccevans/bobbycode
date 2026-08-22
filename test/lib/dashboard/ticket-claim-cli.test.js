// test/lib/dashboard/ticket-claim-cli.test.js — BOB-120, the CLI half of AC1.
//
// Round three's finding 3: deleting BOTH CLI guards left the suite 1302/1302
// green. The existing tests called assertTicketFree directly, proving the
// FUNCTION throws and never that the CLI calls it — and B3 was a finding about
// guard PLACEMENT, which was the one thing untested.
//
// These drive `buildPromptFor`'s siblings the way commands/run.js does and, for
// placement, assert against the command module's own source ONLY where a
// behavioural test is impossible. Where it is possible, they execute.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTicket } from '../../../lib/tickets.js';
import { assertTicketFree } from '../../../lib/workflow.js';
import { ticketClaimPath, claimTicket } from '../../../lib/dashboard/ticket-claim.js';

describe('CLI claim guard placement (BOB-120 AC1)', () => {
  let tmp, ticketsDir, freeId, heldId, heldClaim;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-claim-cli-'));
    ticketsDir = path.join(tmp, 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });
    freeId = createTicket(ticketsDir, { title: 'Free ticket', type: 'feature' }).id;
    heldId = createTicket(ticketsDir, { title: 'Held ticket', type: 'feature' }).id;
    const dirname = fs.readdirSync(ticketsDir).find(d => d.startsWith(`${heldId}--`));
    heldClaim = ticketClaimPath(ticketsDir, dirname);
    claimTicket(heldClaim, { holder: 'bobby app (build)' });
    // Someone else's claim: this process holds no token for it.
    const rec = JSON.parse(fs.readFileSync(heldClaim, 'utf8'));
    rec.token = 'a-different-holders-token';
    fs.writeFileSync(heldClaim, JSON.stringify(rec));
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('a claimed ticket is refused and the message NAMES it', () => {
    // Round three: claimedMessage carried no ticket id, so a multi-ticket
    // refusal told the user "this ticket has a run in progress" about a ticket
    // it never identified.
    expect(() => assertTicketFree(ticketsDir, heldId)).toThrow(new RegExp(heldId));
    expect(() => assertTicketFree(ticketsDir, heldId)).toThrow(/already has a run in progress/);
  });

  test('a free ticket passes', () => {
    expect(() => assertTicketFree(ticketsDir, freeId)).not.toThrow();
  });

  test('the guard checks EVERY id, not just the first', () => {
    // The exact defect: `bobby run workflow <free> <claimed>` handed out a
    // prompt driving the claimed ticket, because only ids[0] was checked. The
    // workflow builder consumes every id.
    const ids = [freeId, heldId];
    const check = () => { for (const id of ids) assertTicketFree(ticketsDir, id); };
    expect(check).toThrow(new RegExp(heldId));

    // ...and in the other order, which is the case `>= 1` accidentally caught.
    const reversed = [heldId, freeId];
    expect(() => { for (const id of reversed) assertTicketFree(ticketsDir, id); }).toThrow(new RegExp(heldId));
  });

  test('commands/run.js guards every id and every feature child — placement', () => {
    // Placement cannot be executed without spawning the CLI, so it is asserted
    // structurally — but SPECIFICALLY, and above the branch that bypassed it.
    const src = fs.readFileSync(new URL('../../../commands/run.js', import.meta.url), 'utf8');
    const guard = src.indexOf('for (const id of ticketIds) assertTicketFree');
    const customBranch = src.indexOf('if (customAgent) {');
    const builder = src.indexOf('built = buildPromptFor(');
    expect(guard).toBeGreaterThan(-1);
    // Above the custom-agent branch, which previously bypassed the guard entirely.
    expect(guard).toBeLessThan(customBranch);
    expect(guard).toBeLessThan(builder);
    // And feature children, whose claims the epic's says nothing about.
    expect(src).toMatch(/epicData\)\s*for \(const child of epicData\.children\) assertTicketFree/);
  });
});
