// commands/pro.js
// Bobby Pro — one subscription, every paid pack and specialist.
//
// Bobby's core is MIT and stays that way. Pro is the shelf on top of it: the
// packs and specialists that keep pace with Claude Code as it moves.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import { findProjectRoot } from '../lib/config.js';
import { listPacks } from '../lib/packs.js';
import { checkPro, checkPackLicense, activateKey, PRO_BUY_URL } from '../lib/license.js';
import {
  proInstallDir, findExtension, loadDashboardPlugins, PRO_DASHBOARD_PACKAGE,
} from '../lib/dashboard/plugins.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

function projectRootOrCwd() {
  try { return findProjectRoot(); } catch { return process.cwd(); }
}

function showStatus() {
  const pro = checkPro();
  const packs = listPacks(projectRootOrCwd());
  const paid = packs.filter((p) => p.license && (p.license.pro || p.license.publicKey));

  console.log('');
  if (!pro.active) {
    console.log(`  ${bold('Bobby Pro')}  ${dim('— not activated')}`);
    console.log('');
    console.log(`  ${dim('Bobby is free forever — including the dashboard. Pro adds the shelf on top:')}`);
    console.log(`    ${dim('·')} Every paid pack — now and every one released later`);
    console.log(`    ${dim('·')} Pro specialists — extra agents and skills beyond the free 23`);
    console.log(`    ${dim('·')} Dashboard add-ons — fleet view, cost rollups, and more`);
    console.log(`    ${dim('·')} Kept current as Claude Code and the models move`);
    console.log('');
    console.log(`  ${bold('Get Bobby Pro')}  ${PRO_BUY_URL}`);
    console.log(`  ${dim('Already bought?')} bobby pro activate <key>`);
    console.log('');
    return;
  }

  const badge = pro.lapsed ? chalk.yellow(' — updates ended') : chalk.green(' — active');
  console.log(`  ${bold('Bobby Pro')}${badge}`);
  if (pro.buyer) console.log(`  ${dim(pro.buyer)}`);
  console.log('');
  if (pro.lapsed) {
    console.log(`  ${dim(`Your updates ended ${pro.until}. Everything you already have keeps working —`)}`);
    console.log(`  ${dim('renewing adds the packs and specialists released since then.')}`);
    console.log(`  ${bold('Renew')}  ${PRO_BUY_URL}`);
  } else if (pro.until) {
    console.log(`  ${dim(`Updates through ${pro.until}.`)}`);
  } else {
    console.log(`  ${dim('Lifetime — no renewal needed.')}`);
  }
  console.log('');

  const ext = findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot: projectRootOrCwd() });
  console.log(`  ${bold('Dashboard')}`);
  if (ext) {
    console.log(`    ${chalk.green('✓')} ${PRO_DASHBOARD_PACKAGE} ${dim(`v${ext.version || '?'} (${ext.via})`)}`);
  } else {
    console.log(`    ${dim('·')} ${dim(`${PRO_DASHBOARD_PACKAGE} not installed — bobby pro install <tarball>`)}`);
  }
  console.log('');

  console.log(`  ${bold('Unlocked here')}  ${dim(`(${paid.length})`)}`);
  if (paid.length === 0) {
    console.log(`    ${dim('No Pro packs installed yet:')} bobby pack add <dir>`);
  } else {
    for (const p of paid) {
      const lic = checkPackLicense(p);
      const mark = lic.ok ? chalk.green('✓') : chalk.yellow('·');
      const note = lic.ok ? '' : dim(' — needs a renewal');
      console.log(`    ${mark} ${p.id} ${dim(`v${p.version}`)}${note}`);
    }
  }
  console.log('');
}

export function registerPro(program) {
  const cmd = program
    .command('pro')
    .description('Bobby Pro — one subscription for every paid pack and specialist');

  cmd
    .command('status', { isDefault: true })
    .description('Show Pro status and what it unlocks here')
    .action(() => {
      try { showStatus(); } catch (e) { error(e.message); process.exit(1); }
    });

  cmd
    .command('install <tarball>')
    .description('Install a Pro add-on tarball (from your purchase) into ~/.bobby/pro')
    .action(async (tarball) => {
      try {
        // Activation first: the tarball is the product, so there is no reason
        // to unpack it for someone who has not activated a key.
        const pro = checkPro();
        if (!pro.active) {
          error(`Bobby Pro is not activated — ${pro.reason}.`);
          console.log(`  ${dim(`Get Bobby Pro: ${PRO_BUY_URL}`)}`);
          console.log(`  ${dim('Already bought? bobby pro activate <key>')}`);
          process.exit(1);
        }

        // A local file only. Fetching from a URL would mean this command
        // decides what to trust; the download belongs to the buyer's browser
        // and their receipt.
        const source = path.resolve(tarball);
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
          error(`No such file: ${source}`);
          console.log(`  ${dim('Pass the .tgz you downloaded from your purchase.')}`);
          process.exit(1);
        }

        const dir = proInstallDir();
        fs.mkdirSync(dir, { recursive: true });
        // A private root so npm treats ~/.bobby/pro as its own project and
        // never walks up into the user's home looking for a package.json.
        const manifest = path.join(dir, 'package.json');
        if (!fs.existsSync(manifest)) {
          fs.writeFileSync(manifest, JSON.stringify({
            name: 'bobby-pro-addons', private: true, version: '0.0.0',
          }, null, 2) + '\n', 'utf8');
        }

        console.log(`  ${dim(`Installing ${path.basename(source)} → ${dir}`)}`);
        // --legacy-peer-deps: an add-on is self-contained and talks to Bobby
        // only through the register() context it is handed. If one declares a
        // peer on bobbycode anyway, npm would try to resolve that from the
        // registry inside this isolated root and fail the whole install — for a
        // dependency that is already on the user's PATH.
        execFileSync('npm', [
          'install', '--no-audit', '--no-fund', '--legacy-peer-deps', '--silent', source,
        ], { cwd: dir, stdio: 'inherit' });

        // Prove it loads, rather than reporting success on an unpack.
        const { plugins, status } = await loadDashboardPlugins({ repoRoot: projectRootOrCwd() });
        if (status.state !== 'active') {
          warn(`Installed, but the add-on did not load: ${status.reason || status.state}`);
          process.exit(1);
        }
        success(`${status.package}${status.version ? ` v${status.version}` : ''} installed`);
        const features = plugins.flatMap((p) => p.features);
        for (const f of features) console.log(`    ${dim('·')} ${f}`);
        console.log('');
        console.log(`  ${dim('Run it: bobby dashboard')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('activate <key>')
    .description('Activate your Bobby Pro license key')
    .action((key) => {
      try {
        const result = activateKey(key, listPacks(projectRootOrCwd()));
        if (!result.pro) {
          success(`Activated ${result.pack ? result.pack.name : result.product}`);
          console.log(`  ${dim(`That is a single-pack key, not Bobby Pro. Stored in ${result.file}`)}`);
          console.log('');
          return;
        }

        const until = result.payload.expires || null;
        const lapsed = Boolean(until && new Date(until) < new Date());
        success(`Bobby Pro activated${result.payload.buyer ? dim(` — ${result.payload.buyer}`) : ''}`);
        console.log(`  ${dim(`key stored in ${result.file}`)}`);
        if (lapsed) {
          warn(`This key's updates ended ${until} — installed content still works, renewing adds what shipped since.`);
        } else if (until) {
          console.log(`  ${dim(`Updates through ${until}.`)}`);
        }
        console.log('');
        console.log(`  ${bold('Next')}  ${dim('— install a Pro pack, then score against it')}`);
        console.log('    bobby pack add <dir>');
        console.log('    bobby audit --pack <id>');
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  return cmd;
}
