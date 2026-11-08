// commands/conductor-ship.js
//
// `bobby conductor ship claim|release <repo>` (BOB-181). Takes or frees the per-repo ship
// lock and prints the ready batch; it never merges or deploys (see lib/conductor/ship-lane.js).

import { findStudioRoot, loadConductorConfig } from '../lib/conductor/config.js';
import { claimShipLane, releaseShipLane, renderClaim, renderRelease } from '../lib/conductor/ship-lane.js';
import { assertM4Host } from '../lib/conductor/host.js';
import { error } from '../lib/colors.js';

function fail(e) {
  error(e.message);
  process.exit(1);
}

export function registerShipCommands(conductor) {
  const ship = conductor
    .command('ship')
    .description('One serial ship lane per repo: claim the lock and list the ready batch, release it. Ships nothing itself. M4 only');

  ship
    .command('claim <repo>')
    .description('Take the repo\'s ship lock and print the shipping-stage tickets for it, in queue order. Refused while another session holds it (a stale lock is an error naming the holder)')
    .option('--session <name|id>', 'Claiming session (default: this session, from CLAUDE_CODE_SESSION_ID)')
    .action((repo, opts) => {
      try {
        assertM4Host();
        const studioRoot = findStudioRoot();
        const config = loadConductorConfig(studioRoot);
        console.log(renderClaim(claimShipLane({ studioRoot, config, repo, session: opts.session ?? null })));
      } catch (e) {
        fail(e);
      }
    });

  ship
    .command('release <repo>')
    .description('Free the repo\'s ship lock. Only the holder may; --force overrides and prints what it overrode')
    .option('--session <name|id>', 'Releasing session (default: this session, from CLAUDE_CODE_SESSION_ID)')
    .option('--force', 'Release a lock held by another session')
    .action((repo, opts) => {
      try {
        assertM4Host();
        const studioRoot = findStudioRoot();
        const config = loadConductorConfig(studioRoot);
        console.log(renderRelease(releaseShipLane({ studioRoot, config, repo, session: opts.session ?? null, force: Boolean(opts.force) })));
      } catch (e) {
        fail(e);
      }
    });
}
