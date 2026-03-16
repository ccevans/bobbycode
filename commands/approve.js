import { createShortcut } from '../lib/shortcuts.js';
export const registerApprove = createShortcut({
  name: 'approve', description: 'QE approve (→ ready-for-release)',
  targetStage: '7-ready-for-release', defaultBy: 'QE', defaultComment: 'QE approved',
  fromStages: ['6-ready-for-testing'],
});
