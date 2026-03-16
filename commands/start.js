import { createShortcut } from '../lib/shortcuts.js';
export const registerStart = createShortcut({
  name: 'start', description: 'Pick up ticket (→ in-progress)',
  targetStage: '4-in-progress', defaultBy: 'engineer', defaultComment: 'Started work',
  fromStages: ['3-ready-for-development'],
});
