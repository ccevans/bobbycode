// commands/pack.js
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { listPacks, findPack, loadPack, remainingRoadmap, PROJECT_PACKS_DIR } from '../lib/packs.js';
import { scanRepo } from '../lib/audit.js';
import { createTicket } from '../lib/tickets.js';
import { renderExternalDir } from '../lib/template.js';
import { checkPackLicense, licenseHelp, verifyKey, saveLicense } from '../lib/license.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

function projectRootOrCwd() {
  try { return findProjectRoot(); } catch { return process.cwd(); }
}

/** Commercial packs need an activated key before they do any work. */
function requireLicense(pack) {
  const status = checkPackLicense(pack);
  if (!status.ok) throw new Error(licenseHelp(status));
  return status;
}

export function registerPack(program) {
  const cmd = program
    .command('pack')
    .alias('packs')
    .description('Platform packs — what "finished" looks like for the kind of product you are building');

  cmd
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List installed packs')
    .action(() => {
      try {
        const root = projectRootOrCwd();
        const packs = listPacks(root);
        console.log('');
        console.log(`  ${bold('Packs')}`);
        console.log('');
        if (packs.length === 0) {
          console.log(`  ${dim('None installed. Add one:')} bobby pack add <dir>`);
          console.log('');
          return;
        }
        for (const p of packs) {
          const lic = checkPackLicense(p);
          const badge = !lic.required ? '' : (lic.ok ? chalk.green(' licensed') : chalk.yellow(' needs a key'));
          console.log(`  ${bold(p.id)}  ${dim(`v${p.version}`)}${badge}`);
          console.log(`    ${p.name}${p.domain ? dim(` — ${p.domain}`) : ''}`);
          console.log(`    ${dim(`${p.checks.length} check(s) · ${p.roadmap.length} roadmap item(s)`)}`);
          console.log('');
        }
        console.log(`  ${dim('Score against one:')} bobby audit --pack <id>`);
        console.log(`  ${dim('Seed its roadmap:')}  bobby pack apply <id>`);
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  cmd
    .command('info <id>')
    .description('Show what a pack checks and the roadmap it carries')
    .action((id) => {
      try {
        const root = projectRootOrCwd();
        const pack = findPack(id, root);
        if (!pack) throw new Error(`No pack "${id}". Installed: ${listPacks(root).map((p) => p.id).join(', ') || 'none'}`);

        console.log('');
        console.log(`  ${bold(pack.name)}  ${dim(`v${pack.version}`)}`);
        if (pack.domain) console.log(`  ${dim(pack.domain)}`);
        if (pack.description) console.log(`\n  ${pack.description.trim()}`);
        console.log('');
        console.log(`  ${bold('Checks')}  ${dim(`(${pack.checks.length})`)}`);
        for (const c of pack.checks) {
          console.log(`    ${dim(`[${c.severity}]`)} ${c.title}`);
        }
        console.log('');
        console.log(`  ${bold('Roadmap')}  ${dim(`(${pack.roadmap.length})`)}`);
        for (const r of pack.roadmap) {
          console.log(`    ${dim('·')} ${r.title}  ${dim(r.priority)}`);
        }
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  cmd
    .command('add <source>')
    .description('Install a pack from a directory into this project')
    .option('--global', 'Install for every project (~/.bobby/packs) instead')
    .action((source, opts) => {
      try {
        const pack = loadPack(path.resolve(source));
        const root = projectRootOrCwd();
        const target = opts.global
          ? path.join(process.env.HOME || '', '.bobby', 'packs', pack.id)
          : path.join(root, PROJECT_PACKS_DIR, pack.id);

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.cpSync(pack.dir, target, { recursive: true });
        success(`Installed ${pack.id} — ${pack.name}`);
        console.log(`  ${dim(`→ ${target}`)}`);
        console.log('');
        const lic = checkPackLicense(pack);
        if (!lic.ok) {
          warn(licenseHelp(lic));
          console.log('');
          return;
        }
        console.log(`  ${dim('Score against it:')} bobby audit --pack ${pack.id}`);
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  cmd
    .command('rm <id>')
    .alias('remove')
    .description('Remove an installed pack from this project')
    .action((id) => {
      try {
        const root = projectRootOrCwd();
        const target = path.join(root, PROJECT_PACKS_DIR, id);
        if (!fs.existsSync(target)) throw new Error(`Pack "${id}" is not installed in this project`);
        fs.rmSync(target, { recursive: true });
        success(`Removed ${id}`);
      } catch (e) { error(e.message); process.exit(1); }
    });

  cmd
    .command('apply <id>')
    .description('Seed the pack\'s roadmap as tickets (and copy its scaffolds) — the path to finished')
    .option('--no-scaffolds', 'Skip copying scaffold files')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const pack = findPack(id, root);
        if (!pack) throw new Error(`No pack "${id}". Run: bobby pack list`);
        requireLicense(pack);

        const snapshot = scanRepo(root);
        const remaining = remainingRoadmap(pack, snapshot);
        const skipped = pack.roadmap.length - remaining.length;

        if (pack.scaffoldsDir && opts.scaffolds !== false) {
          const written = renderExternalDir(pack.scaffoldsDir, root, { project: config.project || 'app', pack: pack.id });
          if (written > 0) success(`Copied ${written} scaffold file(s)`);
        }

        if (remaining.length === 0) {
          console.log('');
          console.log(`  ${chalk.green('Nothing left on this roadmap')} ${dim(`— all ${pack.roadmap.length} item(s) already satisfied.`)}`);
          console.log('');
          return;
        }

        const ticketsDir = resolveTicketsDir(root, config);
        console.log('');
        for (const item of remaining) {
          const t = createTicket(ticketsDir, {
            prefix: config.ticket_prefix,
            title: item.title,
            type: 'feature',
            priority: item.priority,
            area: item.area || pack.id,
            workflow: item.workflow,
            author: `pack:${pack.id}`,
            description: [
              `**From the ${pack.name} pack.**`,
              '',
              item.description.trim(),
            ].join('\n'),
            criteria: item.criteria,
          });
          success(`${t.id} — ${item.title} ${dim(`(${item.workflow})`)}`);
        }
        if (skipped > 0) console.log(`  ${dim(`${skipped} item(s) skipped — already done in this repo.`)}`);
        console.log('');
        console.log(`  ${bold('Next')}  ${dim('— work the roadmap')}`);
        console.log('    bobby go');
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  cmd
    .command('activate <key>')
    .description('Activate a license key for a commercial pack')
    .action((key) => {
      try {
        const root = projectRootOrCwd();
        // Find the pack this key belongs to by trying each licensed pack's key.
        const licensed = listPacks(root).filter((p) => p.license && p.license.publicKey);
        if (licensed.length === 0) {
          throw new Error('No commercial packs are installed yet — run `bobby pack add <dir>` first.');
        }
        const errors = [];
        for (const pack of licensed) {
          try {
            const payload = verifyKey(key, pack.license.publicKey, { product: pack.license.product || pack.id });
            const file = saveLicense(pack.license.product || pack.id, key);
            success(`Activated ${pack.name}${payload.buyer ? dim(` — ${payload.buyer}`) : ''}`);
            console.log(`  ${dim(`key stored in ${file}`)}`);
            console.log('');
            console.log(`  ${dim('Now:')} bobby audit --pack ${pack.id}`);
            console.log('');
            return;
          } catch (e) { errors.push(`${pack.id}: ${e.message}`); }
        }
        throw new Error(`That key did not match any installed pack.\n  ${errors.join('\n  ')}`);
      } catch (e) { error(e.message); process.exit(1); }
    });

  return cmd;
}
