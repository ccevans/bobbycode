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

// Init
import { registerInit } from '../commands/init.js';

// Core commands
import { registerCreate } from '../commands/create.js';
import { registerList } from '../commands/list.js';
import { registerView } from '../commands/view.js';
import { registerPlan } from '../commands/plan.js';
import { registerFiles } from '../commands/files.js';
import { registerMove } from '../commands/move.js';
import { registerAssign } from '../commands/assign.js';
import { registerComment } from '../commands/comment.js';

// Ideas, retros, learnings
import { registerIdea } from '../commands/idea.js';
import { registerPromote } from '../commands/promote.js';
import { registerRetro } from '../commands/retro.js';
import { registerLearn } from '../commands/learn.js';

// Workflow shortcuts
import { registerRefine } from '../commands/refine.js';
import { registerReady } from '../commands/ready.js';
import { registerStart } from '../commands/start.js';
import { registerReview } from '../commands/review.js';
import { registerPeerApprove } from '../commands/peer-approve.js';
import { registerPeerReject } from '../commands/peer-reject.js';
import { registerApprove } from '../commands/approve.js';
import { registerReject } from '../commands/reject.js';
import { registerRelease } from '../commands/release.js';
import { registerReopen } from '../commands/reopen.js';
import { registerBlock } from '../commands/block.js';
import { registerUnblock } from '../commands/unblock.js';

// Pro commands
import { registerActivate } from '../commands/activate.js';
import { registerDashboard } from '../commands/dashboard.js';
import { registerVelocity } from '../commands/velocity.js';
import { registerReport } from '../commands/report.js';
import { registerSkills } from '../commands/skills.js';

registerInit(program);
registerCreate(program);
registerList(program);
registerView(program);
registerPlan(program);
registerFiles(program);
registerMove(program);
registerAssign(program);
registerComment(program);
registerIdea(program);
registerPromote(program);
registerRetro(program);
registerLearn(program);
registerRefine(program);
registerReady(program);
registerStart(program);
registerReview(program);
registerPeerApprove(program);
registerPeerReject(program);
registerApprove(program);
registerReject(program);
registerRelease(program);
registerReopen(program);
registerBlock(program);
registerUnblock(program);
registerActivate(program);
registerDashboard(program);
registerVelocity(program);
registerReport(program);
registerSkills(program);

// Show help when no subcommand given
program.action(() => program.help());

program.parse();
