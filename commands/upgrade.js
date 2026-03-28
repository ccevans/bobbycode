// commands/upgrade.js
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { bold, dim, success, error, warn } from '../lib/colors.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export function registerUpgrade(program) {
  program
    .command('upgrade')
    .description('Upgrade Bobby to the latest version')
    .option('--check', 'Check for updates without installing')
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

        if (latestVersion === currentVersion) {
          success(`Already on the latest version (${currentVersion}).`);
          return;
        }

        console.log(`  Latest version: ${bold(latestVersion)}`);
        console.log('');

        if (opts.check) {
          warn(`Update available: ${currentVersion} → ${latestVersion}`);
          console.log(`  Run ${bold('bobby upgrade')} to install.`);
          return;
        }

        // Detect installation method
        let installCmd;
        try {
          const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
          const isGlobal = __dirname.startsWith(globalPath) || process.argv[1]?.includes('node_modules/.bin');
          installCmd = isGlobal ? 'npm install -g bobbycode@latest' : 'npm install bobbycode@latest';
        } catch {
          installCmd = 'npm install -g bobbycode@latest';
        }

        console.log(`  ${dim(`Running: ${installCmd}`)}`);
        console.log('');

        try {
          execSync(installCmd, { stdio: 'inherit' });
          console.log('');
          success(`Upgraded Bobby: ${currentVersion} → ${latestVersion}`);
        } catch (e) {
          error(`Upgrade failed. Try manually: ${installCmd}`);
          process.exit(1);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
