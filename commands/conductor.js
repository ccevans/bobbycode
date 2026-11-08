// commands/conductor.js
//
// `bobby conductor`: the studio's control board. `init` writes conductor.yml;
// `status` and `check` only read (they never change a session, a ticket or a
// container). `reap` is dry-run unless `--apply`, and is the one command that
// ends sessions (see lib/conductor/reaper.js).

import path from 'path';
import { findStudioRoot, initConductorConfig, loadConductorConfig } from '../lib/conductor/config.js';
import { buildStatus, renderStatus } from '../lib/conductor/status.js';
import { readMemory } from '../lib/conductor/resources.js';
import { readStacks } from '../lib/conductor/stacks.js';
import { checkLane, checkStack } from '../lib/conductor/governor.js';
import { reap, renderReap } from '../lib/conductor/reaper.js';
import { reapStacks, renderStackReap } from '../lib/conductor/stack-reaper.js';
import { assertM4Host } from '../lib/conductor/host.js';
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
        console.log(dim(`  governor: min_free_ram_mb ${values.governor.min_free_ram_mb}, max_docker_stacks ${values.governor.max_docker_stacks}`));
        console.log(dim(`  reaper: stack_idle_hours ${values.reaper.stack_idle_hours}`));
      } catch (e) {
        fail(e);
      }
    });

  conductor
    .command('status')
    .description('Lanes by state, WAITING ON CC, handoff markers, ticket counts, free RAM and docker stacks')
    .option('--json', 'Print the same data as JSON')
    .action((opts) => {
      try {
        const status = buildStatus(findStudioRoot());
        console.log(opts.json ? JSON.stringify(status, null, 2) : renderStatus(status));
      } catch (e) {
        fail(e);
      }
    });

  conductor
    .command('check <kind>')
    .description('May I start a "lane" or a docker "stack"? Exit 0 with the numbers, or exit 1 with the reason (read-only)')
    .action((kind) => {
      try {
        if (kind !== 'lane' && kind !== 'stack') {
          throw new Error(`Unknown check "${kind}". Use: bobby conductor check lane | stack`);
        }
        const config = loadConductorConfig(findStudioRoot());
        const memory = readMemory();
        const result = kind === 'lane'
          ? checkLane(config, memory)
          : checkStack(config, memory, readStacks().stacks.length);
        if (!result.ok) {
          error(`${kind} refused: ${result.reason}`);
          process.exit(1);
        }
        success(`${kind} ok: ${result.reason}`);
      } catch (e) {
        fail(e);
      }
    });

  conductor
    .command('reap')
    .description('List finished background sessions to end, keeping their transcripts (--stacks: idle per-ticket docker stacks instead). Dry run unless --apply. M4 only')
    .option('--apply', 'Do it (default: print the list and change nothing)')
    .option('--stacks', 'Reap idle per-ticket docker stacks (compose project, containers kept) instead of sessions')
    .action((opts) => {
      try {
        assertM4Host();
        const studioRoot = findStudioRoot();
        const config = loadConductorConfig(studioRoot);
        const apply = Boolean(opts.apply);
        if (opts.stacks) {
          const report = reapStacks({ studioRoot, config, apply });
          console.log(renderStackReap(report, { apply, idleHours: config.reaper.stack_idle_hours }));
          if (report.failed > 0) {
            error(`${report.failed} stack(s) could not be stopped`);
            process.exit(1);
          }
          return;
        }
        const report = reap({
          hookStateDir: config.hook_state_dir,
          apply,
          selfSessionId: process.env.CLAUDE_CODE_SESSION_ID || null,
        });
        console.log(renderReap(report, { apply }));
        if (report.failed > 0) {
          error(`${report.failed} session(s) could not be ended`);
          process.exit(1);
        }
      } catch (e) {
        fail(e);
      }
    });
}
