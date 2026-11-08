// lib/conductor/board.js
//
// Ticket counts per stage for each project named in conductor.yml. Reads the same
// tickets `bobby ticket list` reads, through the same config helpers.

import { configForProject, listStudioProjects, resolveTicketsDir } from '../config.js';
import { STAGES } from '../stages.js';
import { listTickets } from '../tickets.js';

/**
 * { <project>: { stages: {<stage>: n}, blocked: n, total: n } }.
 * Counting rules mirror `bobby ticket list`: a missing stage counts as backlog and
 * archived tickets are not shown under done. `blocked` is the number of tickets
 * flagged blocked, already counted inside their stage.
 */
export function boardCounts(studioRoot, projects) {
  const known = listStudioProjects(studioRoot);
  const board = {};
  for (const project of projects) {
    if (!known.includes(project)) {
      throw new Error(`conductor.yml key "projects": "${project}" is not a project in this studio (${known.join(', ')})`);
    }
    const config = configForProject(studioRoot, project);
    const tickets = listTickets(resolveTicketsDir(studioRoot, config));
    const stages = Object.fromEntries(STAGES.map(s => [s, 0]));
    let blocked = 0;
    let total = 0;
    for (const t of tickets) {
      const stage = t.stage || 'backlog';
      if (stage === 'done' && t.archived) continue;
      stages[stage] = (stages[stage] || 0) + 1;
      total += 1;
      if (t.blocked) blocked += 1;
    }
    board[project] = { stages, blocked, total };
  }
  return board;
}
