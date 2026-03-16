import { createShortcut } from '../lib/shortcuts.js';
export const registerReject = createShortcut({
  name: 'reject', description: 'QE reject (→ needs-rework)',
  targetStage: '8-needs-rework', defaultBy: 'QE', defaultComment: 'Issues found during testing',
  hasReason: true, fromStages: ['6-ready-for-testing'],
});
