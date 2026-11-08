// lib/conductor/status.js
//
// Builds the read-only status report: lanes grouped by state, what waits on CC,
// handoff markers and board counts. `buildStatus` returns the data that `--json`
// prints; `renderStatus` formats that same data as text.

import os from 'os';
import { readAgents, classifySessions, groupSessions } from './sessions.js';
import { boardCounts } from './board.js';
import { loadConductorConfig } from './config.js';
import { bold, dim } from '../colors.js';

export function buildStatus(studioRoot, { run, now = Date.now() } = {}) {
  const config = loadConductorConfig(studioRoot);
  const sessions = classifySessions(readAgents({ run }), { hookStateDir: config.hook_state_dir, now });
  const groups = groupSessions(sessions);
  return {
    generated_at: new Date(now).toISOString(),
    working: groups.working,
    waiting_on_cc: groups.waiting_on_cc,
    done: groups.done,
    unknown: groups.unknown,
    handoffs: sessions.filter(s => s.handed_off),
    board: boardCounts(studioRoot, config.projects),
  };
}

export function formatAge(ms) {
  if (ms === null) return '?';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortPath(p) {
  if (!p) return '?';
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

// Interactive sessions have no short background id; show the sessionId prefix.
function laneId(s) {
  return s.id || s.session_id.slice(0, 8);
}

function laneLine(s, { detail = false } = {}) {
  const name = s.name || '(unnamed)';
  const parts = [`  ${laneId(s)}  ${name}`, dim(`${formatAge(s.age_ms)}  ${shortPath(s.cwd)}`)];
  if (detail && s.waiting_for) parts.push(dim(`waiting for: ${s.waiting_for}`));
  if (s.state === 'unknown') parts.push(dim(`[state: ${s.raw_state ?? 'none'}${s.kind ? `, ${s.kind}` : ''}]`));
  return parts.join('  ');
}

function section(lines, title, sessions, opts) {
  lines.push(`${bold(title)} ${dim(`(${sessions.length})`)}`);
  if (sessions.length === 0) lines.push(dim('  none'));
  for (const s of sessions) lines.push(laneLine(s, opts));
  lines.push('');
}

export function renderStatus(status) {
  const lines = ['', bold('BOBBY CONDUCTOR'), dim(`  ${status.generated_at}`), ''];
  section(lines, 'WORKING', status.working);
  section(lines, 'WAITING ON CC', status.waiting_on_cc, { detail: true });
  section(lines, 'DONE', status.done);
  section(lines, 'UNKNOWN STATE', status.unknown);

  lines.push(`${bold('HANDOFFS')} ${dim(`(${status.handoffs.length})`)}`);
  if (status.handoffs.length === 0) lines.push(dim('  none'));
  for (const s of status.handoffs) {
    const successor = s.successor ? `successor ${s.successor} ${s.successor_live ? 'live' : 'not live'}` : 'no successor id in marker';
    lines.push(`  ${laneId(s)}  ${s.name || '(unnamed)'}  ${dim(successor)}`);
  }
  lines.push('');

  lines.push(bold('BOARD'));
  for (const [project, b] of Object.entries(status.board)) {
    const counts = Object.entries(b.stages).filter(([, n]) => n > 0).map(([stage, n]) => `${stage} ${n}`);
    const blocked = b.blocked ? `  ${dim(`(${b.blocked} flagged blocked)`)}` : '';
    lines.push(`  ${bold(project)}  ${counts.join(' · ') || 'no tickets'}${blocked}`);
  }
  lines.push('');
  return lines.join('\n');
}
