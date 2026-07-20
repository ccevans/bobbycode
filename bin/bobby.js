#!/usr/bin/env node

import { createRequire } from 'module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('bobby')
  .description('Bobby — a full SDLC workflow for a solo developer: a whole team of agents, headcount of one.')
  .enablePositionalOptions()
  .version(pkg.version);

// Commands
import { registerInit } from '../commands/init.js';
import { registerTicket } from '../commands/ticket.js';
import { registerRetro } from '../commands/retro.js';
import { registerLearn } from '../commands/learn.js';
import { registerRun } from '../commands/run.js';
import { registerExport } from '../commands/export.js';
import { registerUpgrade } from '../commands/upgrade.js';
import { registerSession } from '../commands/session.js';
import { registerSync } from '../commands/sync.js';
import { registerLocalInit } from '../commands/local-init.js';
import { registerDashboard } from '../commands/dashboard.js';
import { registerPipeline } from '../commands/pipeline.js';
import { registerSprint } from '../commands/sprint.js';
import { registerIdea } from '../commands/idea.js';
import { registerBrief } from '../commands/brief.js';
import { registerProjects } from '../commands/projects.js';
import { registerGo } from '../commands/go.js';
import { registerNew } from '../commands/new.js';
import { touchProject } from '../lib/studio.js';

const initCmd = registerInit(program);
registerLocalInit(initCmd); // bobby init local
registerNew(program);
registerGo(program);
registerBrief(program);
registerIdea(program);
registerTicket(program);
registerSprint(program);
registerRun(program);
registerPipeline(program);
registerRetro(program);
registerLearn(program);
registerProjects(program);
registerSession(program);
registerSync(program);
registerDashboard(program);
registerExport(program);
registerUpgrade(program);

// Progressive help: the default help shows the founder-facing core; power/agent
// plumbing stays fully functional but appears via `bobby help <cmd>` or the
// footer below. Everything still tab-completes and errors helpfully.
const CORE_COMMANDS = ['init', 'new', 'go', 'brief', 'idea', 'ticket', 'sprint', 'run', 'dashboard'];
program.configureHelp({
  visibleCommands: (cmd) =>
    cmd.parent === null // only filter the ROOT help; subcommand help lists everything
      ? cmd.commands.filter(c => CORE_COMMANDS.includes(c.name()))
      : cmd.commands.filter(c => c.name() !== 'help'),
});
program.addHelpText('afterAll', ({ command }) =>
  command.parent === null
    ? '\nPower tools (run with --help for details):\n  pipeline · retro · learn · projects · session · sync · export · upgrade\n'
    : ''
);

// Studio registry: any command run inside a project records it in
// ~/.bobby/projects.yml so cross-project commands (projects, brief --all) see it.
// BOBBY_NO_REGISTRY=1 opts out (set by the test suite; useful for CI too).
program.hook('preAction', () => {
  if (process.env.BOBBY_NO_REGISTRY) return;
  try { touchProject(); } catch { /* never block a command on registry writes */ }
});

// No subcommand → help. Unknown subcommand → commander errors with a suggestion
// (important after the 1.0 rename: `bobby create` should say "unknown command").
program.showSuggestionAfterError();
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
