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
import { registerWorkflow } from '../commands/workflow.js';
import { registerSprint } from '../commands/sprint.js';
import { registerIdea } from '../commands/idea.js';
import { registerBrief } from '../commands/brief.js';
import { registerProjects } from '../commands/projects.js';
import { registerGo } from '../commands/go.js';
import { registerNew } from '../commands/new.js';
import { registerVet } from '../commands/vet.js';
import { registerDo } from '../commands/do.js';
import { registerAudit } from '../commands/audit.js';
import { registerPack } from '../commands/pack.js';
import { registerBlueprint } from '../commands/blueprint.js';
import { registerPro } from '../commands/pro.js';
import { registerSkill } from '../commands/skill.js';
import { registerRemote } from '../commands/remote.js';
import { touchProject } from '../lib/studio.js';

const initCmd = registerInit(program);
registerLocalInit(initCmd); // bobby init local
registerDo(program);
registerVet(program);
registerNew(program);
registerGo(program);
registerAudit(program);
registerBlueprint(program);
registerPack(program);
registerPro(program);
registerBrief(program);
registerIdea(program);
registerTicket(program);
registerSprint(program);
registerRun(program);
registerWorkflow(program);
registerRetro(program);
registerLearn(program);
registerSkill(program);
registerProjects(program);
registerSession(program);
registerSync(program);
registerDashboard(program);
registerRemote(program);
registerExport(program);
registerUpgrade(program);

// Progressive help: the default help shows the founder-facing core; power/agent
// plumbing stays fully functional but appears via `bobby help <cmd>` or the
// footer below. Everything still tab-completes and errors helpfully.
// The whole process is two verbs. Default help shows just the loop; everything
// else is listed compactly below and still works + has its own --help.
const ESSENTIAL = ['do', 'new', 'go', 'init'];
const EVERYDAY = ['vet', 'audit', 'blueprint', 'brief', 'idea', 'ticket', 'sprint', 'run', 'dashboard', 'remote'];
const POWER = ['pack', 'pro', 'workflow', 'retro', 'learn', 'skill', 'projects', 'session', 'sync', 'export', 'upgrade'];
program.configureHelp({
  visibleCommands: (cmd) =>
    cmd.parent === null // only filter the ROOT help; subcommand help lists everything
      ? cmd.commands.filter(c => ESSENTIAL.includes(c.name()))
      : cmd.commands.filter(c => c.name() !== 'help'),
});
program.addHelpText('afterAll', ({ command }) =>
  command.parent === null
    ? `\nOr just say what you want — Bobby picks the skill:\n  bobby "add a health check endpoint"\n\n` +
      `The core loop:\n  bobby new "your idea"   →   bobby go   (run it again and again)\n\n` +
      `More when you want it (each has --help):\n  ${EVERYDAY.join(' · ')}\n  ${POWER.join(' · ')}\n`
    : ''
);

// Studio registry: any command run inside a project records it in
// ~/.bobby/projects.yml so cross-project commands (projects, brief --all) see it.
// BOBBY_NO_REGISTRY=1 opts out (set by the test suite; useful for CI too).
program.hook('preAction', () => {
  if (process.env.BOBBY_NO_REGISTRY) return;
  try { touchProject(); } catch { /* never block a command on registry writes */ }
});

// Natural-language front door: `bobby "add a health endpoint"` (or unquoted words)
// with a first token that isn't a command/flag is treated as `bobby do <request>`,
// so you can just say what you want without remembering "do". Real commands,
// aliases, and flags parse normally.
const KNOWN = new Set(['help']);
for (const c of program.commands) {
  KNOWN.add(c.name());
  for (const a of c.aliases()) KNOWN.add(a);
}
const first = process.argv[2];
if (first && !first.startsWith('-') && !KNOWN.has(first)) {
  process.argv.splice(2, 0, 'do');
}

// No subcommand → help.
program.showSuggestionAfterError();
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
