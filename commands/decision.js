// commands/decision.js
// `bobby decision add` — the write path the decision log never had. Before
// this, every entry in `.bobby/decisions.yaml` was appended by an agent
// hand-editing YAML, and the file's own header pointed them at `bobby learn`,
// which has never touched it. See TKT-063.
import { findProjectRoot, readConfig, resolveDecisionsFile } from '../lib/config.js';
import { appendDecision, readDecisions, seedDecisionsFile } from '../lib/decisions.js';
import { success, error, bold, dim } from '../lib/colors.js';

export function registerDecision(program) {
  const cmd = program
    .command('decision')
    .description('Architectural decision log — record and read the constraints bobby-review enforces');

  cmd
    .command('add')
    .description('Record a decision (appends to .bobby/decisions.yaml without touching existing entries)')
    .requiredOption('--id <id>', 'kebab-case unique identifier')
    .requiredOption('--fact <fact>', 'the decision as a declarative statement')
    .requiredOption('--why <why>', 'the reason — name the incident or constraint that drove it')
    .option('--ticket <id>', 'TKT-XXX if traceable, "arch" for structural decisions', 'arch')
    .option('--decided <date>', 'ISO date (default: today)')
    .option('--supersedes <id>', 'id of the decision this replaces')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const file = resolveDecisionsFile(root, config);
        seedDecisionsFile(file);
        const written = appendDecision(file, opts);
        // Deliberately no autoSync: it stages every Bobby-managed path, so a
        // decision recorded mid-build would sweep up whatever else was in
        // flight (TKT-061). The agent that recorded this commits it with its
        // own work, where it belongs.
        success(`Recorded decision '${written.id}' (${written.ticket})`);
        if (written.supersedes) {
          console.log(`  ${dim(`supersedes ${written.supersedes} — set that entry's invalidated date if it is now retired`)}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('Show the decision log')
    .option('--all', 'Include invalidated decisions')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const all = readDecisions(resolveDecisionsFile(root, config));
        const shown = opts.all ? all : all.filter(d => d && !d.invalidated);
        console.log('');
        console.log(`  ${bold('Decisions')}${opts.all ? '' : dim('  (active)')}`);
        console.log('');
        if (shown.length === 0) {
          console.log(`  ${dim('None yet. Record one: bobby decision add --id <id> --fact "..." --why "..."')}`);
          console.log('');
          return;
        }
        for (const d of shown) {
          const retired = d.invalidated ? dim(` ✕ invalidated ${d.invalidated}`) : '';
          console.log(`  ${bold(d.id)}  ${dim(`${d.decided} · ${d.ticket}`)}${retired}`);
          console.log(`    ${d.fact}`);
          if (d.supersedes) console.log(`    ${dim(`supersedes ${d.supersedes}`)}`);
        }
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  return cmd;
}
