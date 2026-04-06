// commands/local-init.js
import inquirer from 'inquirer';
import path from 'path';
import { readConfig, writeConfig, configExists, findProjectRoot } from '../lib/config.js';
import { discoverLocalSetup, classifyServices, buildProfileFromDiscovery } from '../lib/local-discovery.js';
import { success, warn, error, bold, dim } from '../lib/colors.js';

/**
 * Run the local profile discovery + prompt flow.
 * Can be called from `bobby local-init` or from `bobby init`.
 * Returns the profile name and config if created, or null if skipped.
 */
export async function runLocalProfileWizard(rootDir, config) {
  const discovery = discoverLocalSetup(rootDir, config);

  if (!discovery) {
    console.log('');
    warn('No docker-compose files or UI projects detected. Skipping local profile setup.');
    console.log(`  You can add profiles manually to .bobbyrc.yml later.`);
    console.log('');
    return null;
  }

  console.log('');
  console.log(`  ${bold('Local dev setup detected:')}`);

  // Show what we found
  if (discovery.primary) {
    const composePath = path.relative(rootDir, discovery.primary.path);
    console.log(`    Docker Compose: ${composePath}`);
    if (discovery.primary.composeProject) {
      console.log(`    Compose project: ${discovery.primary.composeProject}`);
    }
    console.log(`    Services: ${discovery.primary.services.map(s => s.name).join(', ')}`);

    if (discovery.classified) {
      const c = discovery.classified;
      if (c.api) {
        const portInfo = c.api.ports.length > 0 ? ` (port ${c.api.ports.map(p => `${p.host}:${p.container}`).join(', ')})` : '';
        console.log(`    API: ${c.api.name}${portInfo}`);
      }
      if (c.db) {
        const portInfo = c.db.ports.length > 0 ? ` (port ${c.db.ports.map(p => `${p.host}:${p.container}`).join(', ')})` : '';
        console.log(`    Database: ${c.db.name}${portInfo}`);
      }
    }
  }

  if (discovery.uiProject) {
    console.log(`    UI: ${discovery.uiProject.path} (${discovery.uiProject.framework})`);
  }

  console.log('');

  // Ask if they want to create a profile
  const { wantProfile } = await inquirer.prompt([{
    type: 'confirm',
    name: 'wantProfile',
    message: 'Create a local dev profile from this?',
    default: true,
  }]);

  if (!wantProfile) return null;

  // Profile name
  const defaultName = config.project
    ? config.project.replace(/\.com$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    : path.basename(rootDir).toLowerCase();

  const { profileName } = await inquirer.prompt([{
    type: 'input',
    name: 'profileName',
    message: 'Profile name:',
    default: defaultName,
    validate: v => /^[a-z0-9-]+$/.test(v) || 'Lowercase letters, numbers, and hyphens only',
  }]);

  // Build suggested profile
  const suggested = buildProfileFromDiscovery({
    composeResult: discovery.primary || { composeProject: null, services: [] },
    classified: discovery.classified || { api: null, db: null, redis: null, workers: [] },
    uiProject: discovery.uiProject,
    profileName,
  });

  // Let user confirm/override ports
  const portPrompts = [];

  if (suggested.ports.api) {
    portPrompts.push({
      type: 'input',
      name: 'apiPort',
      message: 'API port (external):',
      default: String(suggested.ports.api),
      filter: v => parseInt(v, 10),
    });
  }

  if (suggested.ports.ui !== undefined) {
    portPrompts.push({
      type: 'input',
      name: 'uiPort',
      message: 'UI port:',
      default: String(suggested.ports.ui),
      filter: v => parseInt(v, 10),
    });
  }

  if (suggested.ports.postgres) {
    portPrompts.push({
      type: 'input',
      name: 'pgPort',
      message: 'Postgres port (external):',
      default: String(suggested.ports.postgres),
      filter: v => parseInt(v, 10),
    });
  }

  // Compose project name
  portPrompts.push({
    type: 'input',
    name: 'composeProject',
    message: 'Compose project name:',
    default: suggested.compose_project || `${profileName}_dev`,
  });

  const portAnswers = await inquirer.prompt(portPrompts);

  // Build final profile
  const profile = {
    subdomain: profileName,
    compose_project: portAnswers.composeProject,
    ports: {},
  };
  if (portAnswers.apiPort) profile.ports.api = portAnswers.apiPort;
  if (portAnswers.uiPort) profile.ports.ui = portAnswers.uiPort;
  if (portAnswers.pgPort) profile.ports.postgres = portAnswers.pgPort;

  // Health checks
  profile.health_checks = [];
  if (profile.ports.api) {
    profile.health_checks.push({ name: 'api', url: `http://localhost:${profile.ports.api}`, description: 'API server' });
  }
  if (profile.ports.ui) {
    profile.health_checks.push({ name: 'ui', url: `http://localhost:${profile.ports.ui}`, description: 'UI dev server' });
  }

  return { profileName, profile };
}

/**
 * Merge a local profile into config and write it.
 */
export function saveLocalProfile(rootDir, config, profileName, profile) {
  if (!config.local) config.local = {};
  config.local[profileName] = profile;
  writeConfig(rootDir, config);
}

export function registerLocalInit(program) {
  program
    .command('local-init')
    .description('Discover and configure a local dev profile')
    .action(async () => {
      try {
        const rootDir = findProjectRoot();
        const config = readConfig(rootDir);

        const result = await runLocalProfileWizard(rootDir, config);

        if (!result) {
          console.log('No profile created.');
          return;
        }

        const { profileName, profile } = result;

        // Check for existing profile
        if (config.local && config.local[profileName]) {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: `Profile "${profileName}" already exists. Overwrite?`,
            default: false,
          }]);
          if (!overwrite) {
            console.log('Cancelled.');
            return;
          }
        }

        saveLocalProfile(rootDir, config, profileName, profile);

        console.log('');
        success(`Local profile "${profileName}" added to .bobbyrc.yml`);
        console.log('');
        console.log(`  Run: ${bold(`/bobby-local ${profileName}`)}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
