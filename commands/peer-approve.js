import { createShortcut } from '../lib/shortcuts.js';
export const registerPeerApprove = createShortcut({
  name: 'peer-approve', description: 'Approve peer review (→ testing)',
  targetStage: '6-ready-for-testing', defaultBy: 'reviewer', defaultComment: 'Peer review passed',
  fromStages: ['5-peer-review'],
});
