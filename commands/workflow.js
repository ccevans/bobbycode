// commands/workflow.js
import { readConfig, writeConfig, findProjectRoot } from '../lib/config.js';
import { BUILT_IN_WORKFLOWS, STAGE_MAP } from '../lib/workflow.js';
import { success, error, bold, dim } from '../lib/colors.js';

// Imported, never re-declared. A second copy of STAGE_MAP lived here and had
// already drifted — it never learned the design-* steps, so `workflow add`
// rejected steps the resolver accepts, and it would have missed the TKT-049
// security fix too. One map, one source of truth.
const VALID_STEPS = Object.keys(STAGE_MAP);

function validateSteps(steps) {
  const invalid = steps.filter(s => !VALID_STEPS.includes(s));
  if (invalid.length > 0) {
    throw new Error(`Invalid workflow step(s): ${invalid.join(', ')}. Valid: ${VALID_STEPS.join(', ')}`);
  }
}

export function registerWorkflow(program) {
  const cmd = program
    .command('workflow')
    .alias('workflows')
    .description('Manage workflows — the ordered stages a ticket runs through');

  cmd
    .command('list')
    .alias('ls')
    .description('List available workflows (built-in + your own)')
    .action(() => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const userDefined = config.workflows || config.pipelines || {};

        console.log('');
        console.log(`  ${bold('Workflows')}`);
        console.log('');
        console.log(`  ${dim('Built-in:')}`);
        for (const [name, steps] of Object.entries(BUILT_IN_WORKFLOWS)) {
          const ov = userDefined[name];
          const overridden = ov ? dim(' (overridden)') : '';
          // Show the EFFECTIVE stages: an overridden built-in runs the user's
          // steps, and printing the built-in list next to "(overridden)"
          // misstated what the workflow actually does (BOB-090).
          const effective = Array.isArray(ov) ? ov : steps;
          console.log(`    ${bold(name)}${overridden}  ${dim(effective.join(' → '))}`);
        }
        const custom = Object.entries(userDefined).filter(([n]) => !BUILT_IN_WORKFLOWS[n]);
        if (custom.length > 0) {
          console.log('');
          console.log(`  ${dim('Yours:')}`);
          for (const [name, steps] of custom) {
            const stepList = Array.isArray(steps) ? steps.join(' → ') : String(steps);
            console.log(`    ${bold(name)}  ${dim(stepList)}`);
          }
        }
        if (config.default_workflow) {
          console.log('');
          console.log(`  Default for this project: ${bold(config.default_workflow)} ${dim('(default_workflow in .bobbyrc.yml)')}`);
        }
        console.log('');
        console.log(`  ${dim('Add one: bobby workflow add fast build test')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('add <name> <steps...>')
    .description('Add or update a workflow (e.g., bobby workflow add fast build test)')
    .action((name, steps) => {
      try {
        validateSteps(steps);
        const root = findProjectRoot();
        const config = readConfig(root);
        config.workflows = config.workflows || config.pipelines || {};
        delete config.pipelines; // migrate off the legacy key if present
        const existed = !!config.workflows[name];
        config.workflows[name] = steps;
        writeConfig(root, config);
        success(`${existed ? 'Updated' : 'Created'} workflow "${name}": ${steps.join(' → ')}`);
        console.log(`  Use it: bobby run ${name} <ticket>   ${dim(`(or --workflow ${name})`)}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('rm <name>')
    .alias('remove')
    .description('Remove one of your workflows')
    .action((name) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const defined = config.workflows || config.pipelines;
        if (!defined || !defined[name]) {
          error(`Workflow "${name}" not found${BUILT_IN_WORKFLOWS[name] ? ' as a custom workflow (it\'s built-in — override it with `workflow add`)' : ''}.`);
          process.exit(1);
        }
        delete defined[name];
        config.workflows = defined;
        delete config.pipelines;
        if (Object.keys(config.workflows).length === 0) delete config.workflows;
        writeConfig(root, config);
        success(`Removed workflow "${name}"`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
