import { createShortcut } from '../lib/shortcuts.js';
export const registerReopen = createShortcut({
  name: 'reopen', description: 'Reopen for rework (→ in-progress)',
  targetStage: '4-in-progress', defaultBy: 'team', defaultComment: 'Reopened for rework',
  fromStages: ['8-needs-rework'],
});
