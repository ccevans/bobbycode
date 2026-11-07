// lib/walk.js
//
// THE ACCEPTANCE WALK. Before an epic counts as done, an agent walks the whole
// flow it built on the real, deployed site — not localhost, not a fixture
// harness — at phone and desktop width, the way a person would. The RF-956 v3
// door shipped every child ticket green and still failed its first real walk
// (CC's) on four blockers, because no stage ever ran the flow end to end on the
// real origin. The walk writes `walk.md` in the epic's folder; `bobby ticket
// move <epic> done` reads its verdict.

import fs from 'fs';
import path from 'path';

export const WALK_FILE = 'walk.md';

/** 'pass' | 'fail' | 'blocked' from walk.md's verdict line, or null when absent. */
export function walkVerdict(ticketDir) {
  const p = path.join(ticketDir, WALK_FILE);
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf8').match(/^[#>*\s-]*verdict\**\s*:?\**\s*(pass|fail|blocked)\b/im);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Throws unless an epic moving to done has a passing walk. Non-epics pass
 * through. `skipReason` is the deliberate, recorded way past the gate — never
 * a silent one.
 */
export function assertWalkedBeforeDone(ticket, skipReason = null) {
  if (!ticket || ticket.data.type !== 'epic' || skipReason) return;
  const verdict = walkVerdict(ticket.path);
  if (verdict === 'pass') return;
  const id = ticket.data.id;
  const why = verdict ? `its walk says ${verdict.toUpperCase()}` : `it has no ${WALK_FILE}`;
  throw new Error(
    `${id} is an epic and ${why}. Walk the flow on the real site first: \`bobby run walk ${id}\`. ` +
    `To close it anyway, say why: \`bobby ticket move ${id} done --skip-walk "<reason>"\`.`
  );
}
