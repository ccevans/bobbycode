// commands/conductor-queue.js
//
// `bobby conductor next` and `bobby conductor queue` (BOB-180). Kept in its own file so
// commands/conductor.js only imports and calls registerQueueCommands. `queue` only reads.
// `next` reads the sessions and the board and writes one claim file (see lib/conductor/queue.js).

import { findStudioRoot, loadConductorConfig } from '../lib/conductor/config.js';
import { pickNext, queueView, renderNext, renderQueue } from '../lib/conductor/queue.js';
import { assertM4Host } from '../lib/conductor/host.js';
import { error } from '../lib/colors.js';

function fail(e) {
  error(e.message);
  process.exit(1);
}

export function registerQueueCommands(conductor) {
  conductor
    .command('next')
    .description('Pull the next ticket from the ranked queue (.bobby/conductor-queue.yml): WIP cap, governor, then finish-first. Records a claim. M4 only')
    .option('--lane <name>', 'Name of the lane pulling, recorded on the claim')
    .action((opts) => {
      try {
        assertM4Host();
        const studioRoot = findStudioRoot();
        const config = loadConductorConfig(studioRoot);
        const result = pickNext({ studioRoot, config, lane: opts.lane ?? null });
        if (result.kind === 'refused') {
          error(`next refused: ${result.reason}`);
          process.exit(1);
        }
        console.log(renderNext(result));
      } catch (e) {
        fail(e);
      }
    });

  conductor
    .command('queue')
    .description('The ranked queue with each ticket\'s stage and whether a lane or a claim holds it (read-only)')
    .action(() => {
      try {
        const studioRoot = findStudioRoot();
        const config = loadConductorConfig(studioRoot);
        console.log(renderQueue(queueView({ studioRoot, config })));
      } catch (e) {
        fail(e);
      }
    });
}
