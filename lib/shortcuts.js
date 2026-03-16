// lib/shortcuts.js
import path from 'path';
import { readConfig, findProjectRoot } from './config.js';
import { findTicket, moveTicket } from './tickets.js';
import { stageColor } from './stages.js';
import { success, bold, error } from './colors.js';

export function createShortcut({ name, description, targetStage, defaultBy, defaultComment, hasReason = false, fromStages = null }) {
  return function register(program) {
    const cmd = program.command(`${name} <id>`).description(description);
    if (hasReason) {
      cmd.argument('[reason]', 'Reason for the move');
    }
    cmd.action((id, reason) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);

        // Validate source stage if restricted
        if (fromStages) {
          const found = findTicket(ticketsDir, id);
          if (!found) { error(`Ticket ${id} not found`); process.exit(1); }
          if (!fromStages.includes(found.stage)) {
            error(`${id} is in ${found.stage}, expected one of: ${fromStages.join(', ')}`);
            process.exit(1);
          }
        }

        const comment = reason || defaultComment;
        moveTicket(ticketsDir, id, targetStage, defaultBy, comment);
        const colorFn = stageColor(targetStage);
        success(`${bold(id)} → ${colorFn(targetStage)}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
  };
}
