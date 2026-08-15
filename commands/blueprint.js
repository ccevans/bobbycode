// commands/blueprint.js
//
// `bobby blueprint` — see the whole plan before you build it.
//
// Derives one page from the locked definition and the board: who it's for,
// the journey that decides the product, every ticket grouped and traceable,
// what's deliberately out, and whether anything has drifted. Deterministic and
// local — no model calls, no network, no token cost.
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveProductDir } from '../lib/config.js';
import { buildBlueprint } from '../lib/blueprint.js';
import { renderBlueprint } from '../lib/blueprint-html.js';
import { listEpics } from '../lib/tickets.js';
import { bold, dim, success, error } from '../lib/colors.js';

function openInBrowser(file) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${cmd} ${JSON.stringify(file)}`, () => { /* best-effort */ });
}

export function registerBlueprint(program) {
  program
    .command('blueprint [epicId]')
    .description('See the whole plan before you build — one page from the locked definition and the board')
    .option('--json', 'Print the blueprint model as JSON instead of a page')
    .option('-o, --out <file>', 'Where to write the page (default: .bobby/product/blueprint.html)')
    .option('--no-open', 'Do not open the page in a browser')
    .action((epicId, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const productDir = resolveProductDir(root, config);

        // Default to the only epic, so `bobby blueprint` just works.
        let epic = epicId;
        if (!epic) {
          const epics = listEpics(ticketsDir);
          if (epics.length === 1) epic = epics[0].id;
          else if (epics.length > 1) {
            error(`Which epic? ${epics.map(e => e.id).join(', ')}`);
            console.log(`  ${dim('bobby blueprint <epicId>')}`);
            process.exit(1);
          }
        }

        const bp = buildBlueprint(productDir, ticketsDir, epic || null);

        if (opts.json) {
          console.log(JSON.stringify(bp, null, 2));
          return;
        }

        const outFile = path.resolve(root, opts.out || path.join(productDir, 'blueprint.html'));
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, renderBlueprint(bp), 'utf8');

        const rel = path.relative(root, outFile);
        console.log('');
        console.log(`  ${bold('Build blueprint')} ${dim(`— ${bp.project}${bp.epicId ? ` · ${bp.epicId}` : ''}`)}`);
        console.log('');
        console.log(`  ${bp.counts.must} Must features · ${bp.counts.traced} traceable tickets · ${bp.counts.started} started`);
        if (bp.crux) {
          console.log(`  ${dim('The crux:')} ${bp.crux.step}${bp.crux.feature ? ` → ${bp.crux.feature.id} ${bp.crux.feature.name}` : ''}`);
        }
        // Drift is the one thing worth saying out loud in the terminal.
        if (bp.counts.untraced > 0 || bp.counts.orphans > 0) {
          console.log('');
          error(`Drift: ${bp.counts.untraced} Must feature(s) with no ticket, ${bp.counts.orphans} ticket(s) pointing at a feature not in the map.`);
        }
        console.log('');
        success(`  ${rel}`);
        console.log('');
        if (opts.open !== false) openInBrowser(outFile);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
