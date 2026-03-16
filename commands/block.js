import { createShortcut } from '../lib/shortcuts.js';
export const registerBlock = createShortcut({
  name: 'block', description: 'Block ticket',
  targetStage: '9-blocked', defaultBy: 'engineer', defaultComment: 'Blocked — see dev notes',
  hasReason: true,
});
