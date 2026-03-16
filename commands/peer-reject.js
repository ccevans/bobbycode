import { createShortcut } from '../lib/shortcuts.js';
export const registerPeerReject = createShortcut({
  name: 'peer-reject', description: 'Reject peer review (→ needs-rework)',
  targetStage: '8-needs-rework', defaultBy: 'reviewer', defaultComment: 'Issues found during peer review',
  hasReason: true, fromStages: ['5-ready-for-review'],
});
