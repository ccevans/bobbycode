// commands/workflow.js
import { readConfig, writeConfig, findProjectRoot } from '../lib/config.js';
import { BUILT_IN_WORKFLOWS } from '../lib/workflow.js';
import { success, error, bold, dim } from '../lib/colors.js';

const STAGE_MAP = {
  plan: 'planning', build: 'building', review: 'reviewing',
  test: 'testing', ship: 'shipping', security: 'reviewing', debug: 'building',
};

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
        const projectDefault = config.default_workflow || 'default';
        for (const [name, builtInSteps] of Object.entries(BUILT_IN_WORKFLOWS)) {
          // Show the steps that actually run, not the shadowed built-in ones.
          const steps = userDefined[name] || builtInSteps;
          const overridden = userDefined[name] ? dim(' (overridden)') : '';
          const isDefault = name === projectDefault ? dim(' ← default') : '';
          console.log(`    ${bold(name)}${overridden}${isDefault}  ${dim(steps.join(' → '))}`);
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
