import { createShortcut } from '../lib/shortcuts.js';
export const registerReady = createShortcut({
  name: 'ready', description: 'Mark ticket ready for development',
  targetStage: '3-ready-for-development', defaultBy: 'team', defaultComment: 'Refined with plan and test cases',
  fromStages: ['2-ready-for-refinement'],
});
