import { createShortcut } from '../lib/shortcuts.js';
export const registerRelease = createShortcut({
  name: 'release', description: 'Release ticket (→ released)',
  targetStage: '10-released', defaultBy: 'release-engineer', defaultComment: 'PR created and released',
  fromStages: ['7-ready-for-release'],
});
