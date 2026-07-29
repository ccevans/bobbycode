// commands/upgrade.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { bold, dim, success, error, warn } from '../lib/colors.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/** Walk up looking for .bobbyrc.yml — matches findProjectRoot without throwing. */
function bobbyProjectRoot() {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.bobbyrc.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Version stamped into the project when its files were last scaffolded, or null. */
function scaffoldedVersion(root) {
  for (const dir of ['.bobby', '.']) {
    const p = path.join(root, dir, '.scaffold-version');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return null;
}

export function registerUpgrade(program) {
  program
    .command('upgrade')
    .description('Upgrade Bobby to the latest version')
    .option('--check', 'Check for updates without installing')
    .option('--to <version>', 'Install a specific version instead of latest (also works as a rollback)')
    .action((opts) => {
      try {
        const currentVersion = pkg.version;
        console.log('');
        console.log(`  ${bold('Bobby Upgrade')}`);
        console.log(`  ${dim(`Current version: ${currentVersion}`)}`);
        console.log('');

        // Check npm registry for latest version
        let latestVersion;
        try {
          latestVersion = execSync('npm view bobbycode version 2>/dev/null', { encoding: 'utf8' }).trim();
        } catch {
          // Package may not be published yet or npm is unreachable
          latestVersion = null;
        }

        if (!latestVersion) {
          warn('Could not check for updates (npm registry unreachable or package not published).');
          console.log(`  ${dim('To install from source: git pull && npm install')}`);
          return;
        }

        // Even on the latest package, this project's scaffolded files can be
        // stale — e.g. the package was updated outside `bobby upgrade`.
        const root = bobbyProjectRoot();
        const stamped = root ? scaffoldedVersion(root) : null;

        // Pin or roll back: `bobby upgrade --to 1.1.0` installs that exact
        // version and then refreshes the project from it. Prune runs against
        // the installed templates, so files a newer version added are removed
        // and the .local overlays survive — a true rollback, not just an install.
        const wantVersion = opts.to || null;

        if (!wantVersion && latestVersion === currentVersion) {
          success(`Already on the latest version (${currentVersion}).`);
          if (root && stamped !== currentVersion) {
            warn(`This project's skills/agents were scaffolded by ${stamped || 'an older version'}.`);
            console.log(`  Run ${bold('bobby init --refresh')} to bring them up to ${currentVersion}.`);
          }
          return;
        }

        const targetVersion = wantVersion || latestVersion;
        console.log(`  ${wantVersion ? 'Requested' : 'Latest'} version: ${bold(targetVersion)}`);
        console.log('');

        if (opts.check) {
          warn(`${wantVersion ? 'Version change' : 'Update available'}: ${currentVersion} → ${targetVersion}`);
          console.log(`  Run ${bold(wantVersion ? `bobby upgrade --to ${targetVersion}` : 'bobby upgrade')} to install.`);
          return;
        }

        if (wantVersion === currentVersion) {
          success(`Already on ${currentVersion}.`);
          if (root && stamped !== currentVersion) {
            console.log(`  Run ${bold('bobby init --refresh')} to re-scaffold from it.`);
          }
          return;
        }

        // Detect installation method. `__dirname` does not exist in ESM, so the
        // old check always threw into the global fallback — resolve it properly.
        const spec = `bobbycode@${targetVersion}`;
        let installCmd;
        try {
          const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
          const here = path.dirname(fileURLToPath(import.meta.url));
          const isGlobal = here.startsWith(globalPath) || process.argv[1]?.includes('node_modules/.bin');
          installCmd = isGlobal ? `npm install -g ${spec}` : `npm install ${spec}`;
        } catch {
          installCmd = `npm install -g ${spec}`;
        }

        console.log(`  ${dim(`Running: ${installCmd}`)}`);
        console.log('');

        try {
          execSync(installCmd, { stdio: 'inherit' });
          console.log('');
          success(`${wantVersion ? 'Switched' : 'Upgraded'} Bobby: ${currentVersion} → ${targetVersion}`);
        } catch (e) {
          error(`Upgrade failed. Try manually: ${installCmd}`);
          process.exit(1);
        }

        // Deliver the new skills, agents and commands into this project.
        // Must shell out: this process is still running the OLD code, so an
        // in-process refresh would write the version we just replaced.
        if (root) {
          console.log('');
          console.log(`  ${dim('Refreshing this project from the new version…')}`);
          try {
            execSync('bobby init --refresh', { stdio: 'inherit' });
          } catch {
            warn('Could not refresh this project automatically.');
            console.log(`  ${dim('Run `bobby init --refresh` to pick up the new skills and agents.')}`);
          }
        } else {
          console.log(`  ${dim('Run `bobby init --refresh` inside a project to pick up the new skills.')}`);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
