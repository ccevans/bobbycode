import { createShortcut } from '../lib/shortcuts.js';
export const registerRefine = createShortcut({
  name: 'refine', description: 'Move ticket to refinement',
  targetStage: '2-ready-for-refinement', defaultBy: 'PM', defaultComment: 'Prioritized for refinement',
  fromStages: ['1-backlog'],
});
