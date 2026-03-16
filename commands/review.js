import { createShortcut } from '../lib/shortcuts.js';
export const registerReview = createShortcut({
  name: 'review', description: 'Submit for peer review',
  targetStage: '5-peer-review', defaultBy: 'engineer', defaultComment: 'Dev complete, ready for peer review',
  fromStages: ['4-in-progress'],
});
