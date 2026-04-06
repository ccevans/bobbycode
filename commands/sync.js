// commands/sync.js
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import { findProjectRoot, readConfig } from '../lib/config.js';
import { getBobbyPaths } from '../lib/auto-sync.js';
import { success, warn, error, bold, info } from '../lib/colors.js';

function hasRemote(rootDir, remoteName = 'origin') {
  try {
    const remotes = execSync('git remote', { cwd: rootDir, encoding: 'utf8' }).trim();
    return remotes.split('\n').filter(Boolean).includes(remoteName);
  } catch {
    return false;
  }
}

function hasChanges(rootDir, paths) {
  try {
    const pathArgs = paths.map(p => `"${p}"`).join(' ');
    const status = execSync(`git status --porcelain -- ${pathArgs}`, {
      cwd: rootDir, encoding: 'utf8',
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

export function registerSync(program) {
  program
    .command('sync')
    .description('Commit Bobby data to git, optionally push or set up a remote')
    .option('--push', 'Push to remote after committing')
    .option('-m, --message <msg>', 'Custom commit message')
    .option('--setup [url]', 'Set up a git remote (pass URL or use --init to create one)')
    .option('--init', 'Create a private GitHub repo via gh CLI (use with --setup)')
    .action(async (opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const bobbyDir = config.bobby_dir || '.bobby';

        // --setup mode: configure a remote
        if (opts.setup !== undefined) {
          if (hasRemote(root)) {
            const url = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
            warn(`Remote 'origin' already exists: ${url}`);
            return;
          }

          if (opts.init) {
            // Create a new GitHub repo
            try {
              execSync('gh --version', { stdio: 'pipe' });
            } catch {
              error('GitHub CLI (gh) is not installed. Install it: https://cli.github.com/');
              process.exit(1);
            }

            const repoName = config.project || 'bobby-data';
            const { confirm } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirm',
              message: `Create private GitHub repo '${repoName}' and add as remote?`,
              default: true,
            }]);

            if (!confirm) { console.log('Cancelled.'); return; }

            execSync(
              `gh repo create "${repoName}" --private --source="${root}" --remote=origin --push`,
              { cwd: root, stdio: 'inherit' }
            );
            success('Created GitHub repo and pushed');
          } else if (typeof opts.setup === 'string') {
            // Add provided URL as remote
            execSync(`git remote add origin "${opts.setup}"`, { cwd: root, stdio: 'pipe' });
            success(`Added remote 'origin' → ${opts.setup}`);
            console.log('');
            console.log(`  Run ${bold('bobby sync --push')} to push Bobby data.`);
            console.log('');
          } else {
            console.log('');
            console.log(`  ${bold('bobby sync --setup')} — set up sharing for Bobby data`);
            console.log('');
            console.log('  Usage:');
            console.log('    bobby sync --setup <url>     Add an existing git remote');
            console.log('    bobby sync --setup --init    Create a new GitHub repo (requires gh CLI)');
            console.log('');
          }
          return;
        }

        // Default mode: commit all Bobby-managed files
        const paths = getBobbyPaths(root);
        if (!hasChanges(root, paths)) {
          info('Nothing to sync — Bobby data is clean.');
          return;
        }

        const pathArgs = paths.map(p => `"${p}"`).join(' ');
        execSync(`git add -- ${pathArgs}`, { cwd: root, stdio: 'pipe' });

        const msg = opts.message || 'bobby: sync tickets and sessions';
        execSync(`git commit -m "${msg}"`, { cwd: root, stdio: 'pipe' });
        success('Committed Bobby data');

        if (opts.push) {
          if (!hasRemote(root)) {
            warn('No remote configured. Run `bobby sync --setup` to set one up.');
            return;
          }
          execSync('git push', { cwd: root, stdio: 'inherit' });
          success('Pushed to remote');
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
