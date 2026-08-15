// lib/dashboard/actions.js
// The server-side twin of `bobby go`.
//
// `buildBrief().nextAction.argv` is the machine-readable "do this next"
// (['run','plan','TKT-4'], ['ticket','move','TKT-2','unblock'], …). The CLI
// executes it by re-invoking itself; the app cannot shell out, so this maps
// the same argv shapes straight onto the orchestrator and ticket store.
// One function, so the CLI and the app can never disagree about what an
// action MEANS — only about how it is displayed.
import { moveTicket, findTicket } from '../tickets.js';
import { resolveTransition } from '../stages.js';

/**
 * Move a ticket by stage name OR alias, mirroring `bobby ticket move`'s
 * special aliases (reject / block / unblock) without the console output.
 */
export function moveWithAlias(ticketsDir, id, alias, { by = 'app', reason = '' } = {}) {
  if (alias === 'reject') {
    return moveTicket(ticketsDir, id, 'building', by, `REJECTED: ${reason || 'Rejected'}`);
  }
  if (alias === 'block') {
    return moveTicket(ticketsDir, id, 'blocked', by, reason || 'Blocked');
  }
  if (alias === 'unblock') {
    const found = findTicket(ticketsDir, id);
    if (!found) throw new Error(`Ticket ${id} not found`);
    return moveTicket(ticketsDir, id, found.data.previous_stage || 'backlog', by, 'Unblocked');
  }
  const targetStage = resolveTransition(alias);
  if (!targetStage) throw new Error(`Unknown stage or alias '${alias}'`);
  return moveTicket(ticketsDir, id, targetStage, by, reason);
}

/**
 * Execute a brief nextAction argv.
 *
 * @param {string[]|null} argv   e.g. ['run','workflow','TKT-004']
 * @param {{ orchestrator: object, ticketsDir: string }} ctx
 * @returns {Promise<{ kind: 'workspace'|'ticket'|'none', workspace?, ticket? }>}
 */
export async function executeGoAction(argv, { orchestrator, ticketsDir }) {
  if (!argv || argv.length === 0) return { kind: 'none' };

  const [verb, ...rest] = argv;

  if (verb === 'ticket' && rest[0] === 'move') {
    const [, ticketId, alias] = rest;
    const ticket = moveWithAlias(ticketsDir, ticketId, alias);
    return { kind: 'ticket', ticket };
  }

  if (verb === 'run') {
    const [agent, ticketId] = rest;
    if (!agent || !ticketId) throw new Error(`Cannot execute action: ${argv.join(' ')}`);
    const workspace = orchestrator.createWorkspace({ ticketId, agent });
    await orchestrator.runAgent(workspace.id);
    return { kind: 'workspace', workspace: orchestrator.store.get(workspace.id) };
  }

  throw new Error(`Unknown action: ${argv.join(' ')}`);
}
