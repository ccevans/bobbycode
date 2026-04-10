#!/usr/bin/env node

import { createRequire } from 'module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('bobby')
  .description('Bobby — your pair programmer. AI-native SDLC framework.')
  .version(pkg.version);

// Commands (16 total)
import { registerInit } from '../commands/init.js';
import { registerCreate } from '../commands/create.js';
import { registerUpdate } from '../commands/update.js';
import { registerList } from '../commands/list.js';
import { registerView } from '../commands/view.js';
import { registerMove } from '../commands/move.js';
import { registerAssign } from '../commands/assign.js';
import { registerComment } from '../commands/comment.js';
import { registerRetro } from '../commands/retro.js';
import { registerLearn } from '../commands/learn.js';
import { registerRun } from '../commands/run.js';
import { registerActivate } from '../commands/activate.js';
import { registerExport } from '../commands/export.js';
import { registerArchive } from '../commands/archive.js';
import { registerTriage } from '../commands/triage.js';
import { registerUpgrade } from '../commands/upgrade.js';
import { registerAttach } from '../commands/attach.js';
import { registerSession } from '../commands/session.js';
import { registerSync } from '../commands/sync.js';
import { registerLocalInit } from '../commands/local-init.js';
import { registerDashboard } from '../commands/dashboard.js';

registerInit(program);
registerCreate(program);
registerUpdate(program);
registerList(program);
registerView(program);
registerMove(program);
registerAssign(program);
registerComment(program);
registerRetro(program);
registerLearn(program);
registerRun(program);
registerActivate(program);
registerExport(program);
registerArchive(program);
registerTriage(program);
registerUpgrade(program);
registerAttach(program);
registerSession(program);
registerSync(program);
registerLocalInit(program);
registerDashboard(program);

// Show help when no subcommand given
program.action(() => program.help());

program.parse();
