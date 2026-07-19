// commands/brief.js
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSprintsDir } from '../lib/config.js';
import { buildBrief } from '../lib/brief.js';
import { stageColor } from '../lib/stages.js';
import { bold, dim, error } from '../lib/colors.js';

export function registerBrief(program) {
  program
    .command('brief')
    .description('Where was I? — in-flight work, blockers, and the next action')
    .action(() => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const sprintsDir = resolveSprintsDir(root, config);
        const b = buildBrief(ticketsDir, sprintsDir);

        console.log('');
        console.log(`  ${bold(`${config.project || 'Bobby'} — where you left off`)}`);
        console.log('');

        // In flight
        console.log(`  ${bold('In flight')}`);
        if (b.inFlight.length === 0) {
          console.log(`    ${dim('Nothing started.')}`);
        } else {
          for (const t of b.inFlight) {
            console.log(`    ${stageColor(t.stage)(`[${t.stage.toUpperCase()}]`)}  ${bold(t.id)}  ${t.title}  ${dim(t.priority)}`);
          }
        }
        console.log('');

        // Blocked
        if (b.blocked.length > 0) {
          console.log(`  ${bold('Blocked')}`);
          for (const t of b.blocked) {
            const why = t.blocked_reason ? dim(`— ${t.blocked_reason}`) : '';
            console.log(`    ${stageColor('blocked')('[BLOCKED]')}  ${bold(t.id)}  ${t.title}  ${why}`);
          }
          console.log('');
        }

        // Sprints
        if (b.sprints.length > 0) {
          console.log(`  ${bold('Active sprints')}`);
          for (const s of b.sprints) {
            console.log(`    ${bold(s.id)}  ${s.name}  ${dim(`${s.done}/${s.total} done · ${s.status}`)}`);
          }
          console.log('');
        }

        // Backlog snapshot
        console.log(`  ${bold('Backlog')}  ${dim(`(${b.backlogCount} total)`)}`);
        if (b.backlogTop.length === 0) {
          console.log(`    ${dim('Empty.')}`);
        } else {
          for (const t of b.backlogTop) {
            console.log(`    ${dim('·')} ${bold(t.id)}  ${t.title}  ${dim(t.priority)}`);
          }
          if (b.backlogCount > b.backlogTop.length) {
            console.log(`    ${dim(`… and ${b.backlogCount - b.backlogTop.length} more — bobby list backlog`)}`);
          }
        }
        console.log('');

        // Next action
        console.log(`  ${bold('Next')}  ${dim(`— ${b.nextAction.reason}`)}`);
        console.log(`    ${b.nextAction.command}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
