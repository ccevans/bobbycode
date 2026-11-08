// commands/conductor.js
//
// `bobby conductor`: the studio's read-only control board. This ticket ships
// `init` (writes conductor.yml) and `status` (never changes a session or ticket).

import path from 'path';
import { findStudioRoot, initConductorConfig } from '../lib/conductor/config.js';
import { buildStatus, renderStatus } from '../lib/conductor/status.js';
import { success, error, dim } from '../lib/colors.js';

function fail(e) {
  error(e.message);
  process.exit(1);
}

export function registerConductor(program) {
  const conductor = program
    .command('conductor')
    .description('Studio control board: sessions, what waits on CC, ticket counts (read-only)');

  conductor
    .command('init')
    .description('Write .bobby/conductor.yml with every key explicit (refuses to overwrite)')
    .option('--projects <list>', 'Comma-separated project boards to count (default: every studio project)')
    .action((opts) => {
      try {
        const root = findStudioRoot();
        const projects = opts.projects ? opts.projects.split(',').map(p => p.trim()).filter(Boolean) : undefined;
        const { file, values } = initConductorConfig(root, { projects });
        success(`Wrote ${path.relative(root, file)}`);
        console.log(dim(`  projects: ${values.projects.join(', ')}`));
        console.log(dim(`  hook_state_dir: ${values.hook_state_dir}`));
      } catch (e) {
        fail(e);
      }
    });

  conductor
    .command('status')
    .description('Lanes by state, WAITING ON CC, handoff markers and ticket counts per stage')
    .option('--json', 'Print the same data as JSON')
    .action((opts) => {
      try {
        const status = buildStatus(findStudioRoot());
        console.log(opts.json ? JSON.stringify(status, null, 2) : renderStatus(status));
      } catch (e) {
        fail(e);
      }
    });
}
