// Shared fixtures for the conductor tests (not a test file: jest only runs *.test.js).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initStudio, createProject } from '../../../lib/studio.js';
import { createTicket, moveTicket, updateTicket } from '../../../lib/tickets.js';

/** A temp studio with projects `alpha` (AL) and `beta` (BE), a hook-state dir and no conductor.yml. */
export function makeStudio() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-conductor-'));
  initStudio(root);
  createProject(root, 'alpha', { prefix: 'AL' });
  createProject(root, 'beta', { prefix: 'BE' });
  const hookDir = path.join(root, 'hook-state');
  fs.mkdirSync(hookDir);
  return { root, hookDir };
}

export function writeConductorYml(root, text) {
  fs.mkdirSync(path.join(root, '.bobby'), { recursive: true });
  fs.writeFileSync(path.join(root, '.bobby', 'conductor.yml'), text);
}

export function validYml(hookDir, projects = ['alpha', 'beta']) {
  return `projects:\n${projects.map(p => `  - ${p}`).join('\n')}\nhook_state_dir: ${hookDir}\n`;
}

/** Create tickets in `project` through the library: [{title, stage?, blocked?}]. */
export function seedTickets(root, project, tickets) {
  const dir = path.join(root, '.bobby', project, 'tickets');
  const prefix = project === 'alpha' ? 'AL' : 'BE';
  for (const t of tickets) {
    const { id } = createTicket(dir, { prefix, title: t.title });
    if (t.stage && t.stage !== 'backlog') moveTicket(dir, id, t.stage, 'test');
    if (t.blocked) updateTicket(dir, id, { blocked: true, blocked_reason: 'waiting' });
  }
}

export const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

/** Raw `claude agents --json --all` fixture: working, blocked, done, plus odd states. */
export function agentsFixture() {
  const mk = (id, name, state, hoursAgo, extra = {}) => ({
    id,
    sessionId: `${id}-0000-4000-8000-000000000000`,
    name,
    cwd: '/studio',
    kind: 'background',
    startedAt: NOW - hoursAgo * HOUR,
    ...(state ? { state } : {}),
    ...extra,
  });
  return [
    mk('aaaa1111', 'lane one', 'working', 2),
    mk('bbbb2222', 'lane two', 'blocked', 5, { waitingFor: 'approve edit' }),
    mk('cccc3333', 'lane three', 'done', 30),
    mk('dddd4444', 'lane four', 'stopped', 50),
    { ...mk('eeee5555', 'interactive', undefined, 1, { kind: 'interactive' }), id: undefined, sessionId: 'eeee5555-0000-4000-8000-000000000000' },
  ];
}
