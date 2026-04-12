// commands/pipeline.js
import { readConfig, writeConfig, findProjectRoot } from '../lib/config.js';
import { success, error, bold, dim } from '../lib/colors.js';

const STAGE_MAP = {
  plan: 'planning', build: 'building', review: 'reviewing',
  test: 'testing', security: 'reviewing', debug: 'building', strategy: 'backlog',
};

const VALID_STEPS = Object.keys(STAGE_MAP);

function validateSteps(steps) {
  const invalid = steps.filter(s => !VALID_STEPS.includes(s));
  if (invalid.length > 0) {
    throw new Error(`Invalid pipeline step(s): ${invalid.join(', ')}. Valid: ${VALID_STEPS.join(', ')}`);
  }
}

export function registerPipeline(program) {
  const cmd = program
    .command('pipeline')
    .description('Manage custom pipeline shorthands in .bobbyrc.yml');

  cmd
    .command('list')
    .alias('ls')
    .description('List all defined pipelines')
    .action(() => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const pipelines = config.pipelines || {};
        const names = Object.keys(pipelines);

        console.log('');
        console.log(`  ${bold('Pipelines')}`);
        console.log('');

        // Always show the implicit default
        if (!pipelines.default) {
          console.log(`  ${bold('default')}  ${dim('(built-in)')}`);
          console.log(`    plan → build → review → test`);
          console.log('');
        }

        if (names.length === 0) {
          console.log(`  ${dim('No custom pipelines defined.')}`);
          console.log(`  ${dim('Add one: bobby pipeline add quick build test')}`);
        } else {
          for (const [name, steps] of Object.entries(pipelines)) {
            const label = name === 'default' ? `${bold(name)}  ${dim('(override)')}` : bold(name);
            console.log(`  ${label}`);
            const stepList = Array.isArray(steps) ? steps.join(' → ') : String(steps);
            console.log(`    ${stepList}`);
            console.log('');
          }
        }
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('add <name> <steps...>')
    .description('Add or update a named pipeline (e.g., bobby pipeline add quick build test)')
    .action((name, steps) => {
      try {
        validateSteps(steps);
        const root = findProjectRoot();
        const config = readConfig(root);
        config.pipelines = config.pipelines || {};
        const existed = !!config.pipelines[name];
        config.pipelines[name] = steps;
        writeConfig(root, config);
        success(`${existed ? 'Updated' : 'Created'} pipeline "${name}": ${steps.join(' → ')}`);
        console.log(`  Use: bobby run pipeline <ticket> --pipeline ${name}`);
        console.log(`   or: bobby run ${name} <ticket>`);
        console.log(`   or: bobby create -t "..." --pipeline ${name}`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('remove <name>')
    .alias('rm')
    .description('Remove a named pipeline')
    .action((name) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        if (!config.pipelines || !config.pipelines[name]) {
          error(`Pipeline "${name}" not found.`);
          process.exit(1);
        }
        delete config.pipelines[name];
        if (Object.keys(config.pipelines).length === 0) {
          delete config.pipelines;
        }
        writeConfig(root, config);
        success(`Removed pipeline "${name}"`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
