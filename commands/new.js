// commands/new.js
// The 0 -> 1 on-ramp: turn a one-line idea into a scaffolded project with an
// MVP epic, ready to build.
//
// The scaffolding itself is `lib/project.js` (TKT-025) — it used to live in
// this closure, which meant the CLI was the only thing that could run it, and
// the app needs it for onboarding and studio mode. What is left here is the
// half that is genuinely a terminal's job: parse the flags, print the handoff,
// turn a thrown Error into an exit code.
import { createProject, PROJECT_STACKS } from '../lib/project.js';
import { success, warn, error, bold, dim } from '../lib/colors.js';

export function registerNew(program) {
  program
    .command('new <idea...>')
    .description('Spin up a brand-new project from an idea — scaffolds Bobby, creates the MVP epic, hands off to build')
    .option('--dir <name>', 'Directory to create (default: a slug of the idea)')
    .option('--stack <stack>', `Stack preset: ${PROJECT_STACKS.join(' | ')}`, 'node')
    .action((ideaWords, opts) => {
      try {
        const { dirName, epic, starter, committed, commitError } = createProject(
          ideaWords.join(' ').trim(),
          { dir: opts.dir, stack: opts.stack, cwd: process.cwd() },
        );

        // The commit is best-effort and comes back as data, so the warning that
        // used to be printed from inside the scaffolder is printed here, in the
        // order it always was — before the handoff.
        if (!committed) warn(`Could not create initial commit: ${commitError}`);

        console.log('');
        success(`New project ready in ./${dirName}/`);
        if (starter) {
          console.log(`  ${dim(`${starter.label} skeleton scaffolded — it runs right now.`)}`);
        }
        console.log(`  ${dim(`Epic ${epic.id} captures your idea — the MVP grows from here.`)}`);
        console.log('');
        console.log(`    ${bold(`cd ${dirName}`)}`);
        if (starter) {
          console.log(`    ${bold(starter.dev)}   ${dim(`# run it now → ${starter.url}`)}`);
        }
        console.log(`    ${bold(`bobby run define ${epic.id}`)}    ${dim('# define the product: brief → personas → journeys → data model → architecture → feature map → mockups → blueprint')}`);
        console.log(`    ${bold(`bobby run plan ${epic.id}`)}      ${dim('# …or skip straight to breaking it into MVP tickets')}`);
        console.log('');
        console.log(`  ${dim('More ideas: bobby idea "..."   ·   see the board: bobby ticket list')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
