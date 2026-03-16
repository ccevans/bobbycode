import { createShortcut } from '../lib/shortcuts.js';
export const registerUnblock = createShortcut({
  name: 'unblock', description: 'Unblock ticket (→ backlog)',
  targetStage: '1-backlog', defaultBy: 'engineer', defaultComment: 'Unblocked, returning to backlog',
  fromStages: ['9-blocked'],
});
