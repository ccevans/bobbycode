// commands/ticket.js
// The `bobby ticket` namespace — every operation on tickets lives here.
// Each subcommand is registered by its own module; this file just groups them.
import { registerCreate } from './create.js';
import { registerUpdate } from './update.js';
import { registerList } from './list.js';
import { registerView } from './view.js';
import { registerMove } from './move.js';
import { registerAssign } from './assign.js';
import { registerComment } from './comment.js';
import { registerAttach } from './attach.js';
import { registerArchive } from './archive.js';
import { registerTriage } from './triage.js';

export function registerTicket(program) {
  const cmd = program
    .command('ticket')
    .alias('tkt')
    .description('Ticket operations — create, list, view, move, comment, and more');

  registerCreate(cmd);
  registerList(cmd);
  registerView(cmd);
  registerMove(cmd);
  registerComment(cmd);
  registerUpdate(cmd);
  registerAssign(cmd);
  registerAttach(cmd);
  registerArchive(cmd);
  registerTriage(cmd);
}
