// lib/brief.js
// "Where was I?" — the solo builder's standup-of-one. Reconstructs what was in
// flight, what's blocked, and the single next action from ticket + sprint state,
// so a session picked up hours or days later starts with context instead of a cold board.
import fs from 'fs';
import path from 'path';
import { listTickets } from './tickets.js';
import { listSprints } from './sprint.js';
import { findTicket } from './tickets.js';

// Pipeline stages, named so the maps below can't silently miss one.
const DESIGN_STAGES = ['design-research', 'design-analyze', 'design-mockup', 'design-spec'];
const DEFINE_STAGES = ['define-brief', 'define-personas', 'define-journeys', 'define-features'];

// Stages that count as "in flight" — started but not shipped. define-* stages
// live on epics, which are routed by the epic logic, not the work-item list.
const IN_FLIGHT_STAGES = ['planning', ...DESIGN_STAGES, 'building', 'reviewing', 'testing', 'shipping'];
// Lower = further along; finish work in progress before starting new.
const STAGE_RANK = {
  shipping: 0, testing: 1, reviewing: 2, building: 3,
  'design-spec': 4, 'design-mockup': 5, 'design-analyze': 6, 'design-research': 7,
  planning: 8,
};
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
// The agent that naturally comes next for a ticket sitting in a given stage.
// For design stages the workflow's agent for a stage IS that stage's agent —
// a ticket parked in design-mockup resumes design-mockup.
const NEXT_AGENT = {
  planning: 'build', building: 'review', reviewing: 'test', testing: 'ship', shipping: 'ship',
  'design-research': 'design-research', 'design-analyze': 'design-analyze',
  'design-mockup': 'design-mockup', 'design-spec': 'design-spec',
};

function sortByProgress(a, b) {
  const s = (STAGE_RANK[a.stage] ?? 9) - (STAGE_RANK[b.stage] ?? 9);
  if (s !== 0) return s;
  const p = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
  if (p !== 0) return p;
  return (a.id || '').localeCompare(b.id || '');
}

/**
 * Build a structured brief of the project's current state.
 *
 * @returns {{ inFlight, blocked, backlogTop, backlogCount, sprints, nextAction }}
 */
export function buildBrief(ticketsDir, sprintsDir, { productDir = null } = {}) {
  const all = listTickets(ticketsDir);
  // Product definition status: null = unknown (caller didn't say where to look —
  // legacy behavior), true/false = the feature map exists / is missing.
  const hasProductDef = productDir
    ? fs.existsSync(path.join(productDir, 'feature-map.md'))
    : null;
  // Epics are containers, not work items — you never run an agent directly on an
  // epic (that's `run feature`). Exclude them from per-ticket next-action picking;
  // the dedicated epic logic below handles them. They still appear in the display.
  const workItems = all.filter(t => t.type !== 'epic');

  const inFlight = workItems
    .filter(t => IN_FLIGHT_STAGES.includes(t.stage) && !t.blocked)
    .sort(sortByProgress);

  const blocked = workItems
    .filter(t => t.blocked || t.stage === 'blocked')
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));

  // For display: the full backlog (may include an un-broken-down epic).
  const backlog = all
    .filter(t => t.stage === 'backlog')
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));
  // For selection: only workable (non-epic) backlog tickets.
  const backlogWork = backlog.filter(t => t.type !== 'epic');

  // Epics drive the `bobby new` flow: a fresh epic needs breaking down (run plan);
  // once it has children, the feature workflow builds them (run feature).
  const epics = all.filter(t => t.type === 'epic' && t.stage !== 'done').map(e => {
    const children = all.filter(t => t.parent === e.id);
    return {
      id: e.id,
      stage: e.stage,
      childCount: children.length,
      incompleteCount: children.filter(c => c.stage !== 'done').length,
    };
  });

  // Active sprints with unfinished tickets.
  const sprints = listSprints(sprintsDir)
    .filter(s => s.status === 'active' || s.status === 'planned')
    .map(s => {
      const tickets = s.tickets || [];
      const done = tickets.filter(id => findTicket(ticketsDir, id)?.data.stage === 'done').length;
      return { id: s.id, name: s.name, status: s.status, total: tickets.length, done };
    })
    .filter(s => s.total === 0 || s.done < s.total);

  const nextAction = pickNextAction({ inFlight, blocked, backlog: backlogWork, epics, hasProductDef });

  return {
    inFlight,
    blocked,
    backlogTop: backlog.slice(0, 3),
    backlogCount: backlog.length,
    sprints,
    nextAction,
  };
}

function pickNextAction({ inFlight, blocked, backlog, epics = [], hasProductDef = null }) {
  // `argv` is the machine-executable form (used by `bobby go`); `command` is the display form.

  // Epic-driven flow (from `bobby new`) takes priority, so `go` walks the idea
  // from definition to breakdown to build without the user learning any verbs.
  const freshEpic = epics.find(e => e.childCount === 0);
  if (freshEpic) {
    // Mid-definition: resume the define pipeline where it stands.
    if (DEFINE_STAGES.includes(freshEpic.stage)) {
      return {
        reason: `${freshEpic.id} definition is in progress (${freshEpic.stage}) — resume it`,
        command: `bobby run define ${freshEpic.id}`,
        argv: ['run', 'define', freshEpic.id],
      };
    }
    // A fresh idea with no product definition: think before decomposing.
    // (Only when the caller told us where to look and the map is absent.)
    if (hasProductDef === false) {
      return {
        reason: `${freshEpic.id} is an idea with no product definition — define it first`,
        command: `bobby run define ${freshEpic.id}`,
        argv: ['run', 'define', freshEpic.id],
      };
    }
    return {
      reason: `${freshEpic.id} is a fresh idea — break it into MVP tickets`,
      command: `bobby run plan ${freshEpic.id}`,
      argv: ['run', 'plan', freshEpic.id],
    };
  }
  // Prefer pushing in-flight work over kicking off a whole feature build, so
  // half-done tickets land first. Only fall to `run feature` when nothing's in flight.
  if (inFlight.length === 0) {
    const epicToBuild = epics.find(e => e.childCount > 0 && e.incompleteCount > 0);
    if (epicToBuild) {
      return {
        reason: `${epicToBuild.id} is planned — build the MVP`,
        command: `bobby run feature ${epicToBuild.id}`,
        argv: ['run', 'feature', epicToBuild.id],
      };
    }
  }

  // The furthest-along in-flight ticket is the thing to push over the line first.
  if (inFlight.length > 0) {
    const t = inFlight[0];
    const agent = NEXT_AGENT[t.stage] || 'next';
    return {
      reason: `${t.id} is in ${t.stage} — closest to done`,
      command: `bobby run ${agent} ${t.id}`,
      argv: ['run', agent, t.id],
    };
  }
  if (blocked.length > 0) {
    const t = blocked[0];
    return {
      reason: `${t.id} is blocked${t.blocked_reason ? ` (${t.blocked_reason})` : ''} — unblock to make progress`,
      command: `bobby ticket move ${t.id} unblock`,
      argv: ['ticket', 'move', t.id, 'unblock'],
    };
  }
  if (backlog.length > 0) {
    const t = backlog[0];
    return {
      reason: `Nothing in flight — start the top backlog item (${t.priority})`,
      command: `bobby run workflow ${t.id}`,
      argv: ['run', 'workflow', t.id],
    };
  }
  return {
    reason: 'Board is empty',
    command: 'bobby ticket create -t "Your next task"  (or: bobby idea "a thought")',
    argv: null,
  };
}
