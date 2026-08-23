// lib/tickets.js
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { STAGES, isValidStage, stageIndex } from './stages.js';
import { nextId } from './counter.js';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
// Lower = further along = sort first (finish in-progress work before starting new).
// Every stage in lib/stages.js STAGES must have a rank — a stage without one
// sorts wrong silently (the design stages were missing here for a release).
// Exported so the stages invariant test can enforce exactly that.
// `security` sits between reviewing and building: the secure workflow runs
// build → security → review, so security is further along than building and
// less far than reviewing.
export const STAGE_ORDER = {
  done: 0, shipping: 1, testing: 2, reviewing: 3, security: 4, building: 5,
  'design-spec': 6, 'design-mockup': 7, 'design-analyze': 8, 'design-research': 9,
  planning: 10,
  'define-blueprint': 11, 'define-mockups': 12, 'define-features': 13,
  'define-architecture': 14, 'define-data-model': 15,
  'define-journeys': 16, 'define-personas': 17, 'define-brief': 18,
  backlog: 19, blocked: 20,
};

/**
 * Days between a YYYY-MM-DD date string and now
 */
export function daysBetween(dateStr) {
  if (!dateStr) return 0;
  // Parse as UTC midnight — ticket dates are written as UTC (toISOString) via
  // today(), so comparing in UTC keeps this timezone-independent. Parsing as
  // local time made "today" come out as -1 in behind-UTC zones after midnight UTC.
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * A ticket's merge timestamp as a trustworthy ISO string, or null (TKT-013).
 *
 * Every consumer goes through this rather than handing frontmatter straight to
 * `new Date()`, because two of the values it can hold are actively dangerous:
 * `new Date(undefined)` is an Invalid Date, and `new Date(null)` is the UNIX
 * epoch — which a relative-time renderer reports, quite sincerely, as "merged
 * 56 years ago". Tickets merged before the field existed have neither, and must
 * render no time at all rather than a wrong one.
 *
 * The rest is the cost of putting the field in frontmatter, where it is visible
 * and hand-editable: whatever a human typed there is untrusted input, so
 * anything that does not parse as a date becomes null.
 */
export function normalizeMergedAt(value) {
  // Strings and Dates only. `Date.parse` stringifies whatever it is given, and
  // V8 reads the resulting "0" as the year 2000 — so a stray number would come
  // back as a confident, entirely invented date.
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Read ticket frontmatter + body from ticket.md
 */
export function readTicket(ticketPath) {
  const ticketFile = path.join(ticketPath, 'ticket.md');
  if (!fs.existsSync(ticketFile)) return null;
  const raw = fs.readFileSync(ticketFile, 'utf8');
  const { data, content } = matter(raw);
  return { data, content, filePath: ticketFile };
}

/**
 * Write ticket frontmatter + body back to ticket.md
 */
export function writeTicket(ticketPath, data, content) {
  const ticketFile = path.join(ticketPath, 'ticket.md');
  const output = matter.stringify(content, data);
  fs.writeFileSync(ticketFile, output, 'utf8');
}

/**
 * Find a ticket by ID in the single tickets directory
 */
export function findTicket(ticketsDir, id) {
  if (!fs.existsSync(ticketsDir)) return null;
  const entries = fs.readdirSync(ticketsDir);
  for (const entry of entries) {
    if (entry.startsWith(`${id}--`)) {
      const fullPath = path.join(ticketsDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        const ticket = readTicket(fullPath);
        if (ticket) {
          return {
            stage: ticket.data.stage || 'backlog',
            path: fullPath,
            dirname: entry,
            data: ticket.data,
            content: ticket.content,
          };
        }
      }
    }
  }
  return null;
}

/**
 * List all tickets, optionally filtered and sorted
 */
export function listTickets(ticketsDir, { stage, blocked, epic, area, priority, type, staleDays, sort, feature } = {}) {
  if (!fs.existsSync(ticketsDir)) return [];
  const entries = fs.readdirSync(ticketsDir);
  const tickets = [];

  for (const entry of entries) {
    const fullPath = path.join(ticketsDir, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;
    if (entry.startsWith('.')) continue;

    const ticket = readTicket(fullPath);
    if (!ticket) continue;

    const t = {
      ...ticket.data,
      path: fullPath,
      dirname: entry,
    };

    // Apply filters
    if (stage && t.stage !== stage) continue;
    if (blocked === true && !t.blocked) continue;
    if (blocked === false && t.blocked) continue;
    if (epic && t.parent !== epic) continue;
    if (area && t.area !== area) continue;
    if (priority && t.priority !== priority) continue;
    if (feature && t.feature !== feature) continue;
    if (type && t.type !== type) continue;
    if (staleDays && daysBetween(t.updated || t.created) < staleDays) continue;

    tickets.push(t);
  }

  // Apply sorting
  if (sort === 'newest') tickets.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if (sort === 'oldest') tickets.sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  if (sort === 'updated') tickets.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  if (sort === 'priority') tickets.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

  return tickets;
}

/**
 * Compute backlog health metrics
 */
export function backlogHealth(ticketsDir, staleDays = 30) {
  const backlog = listTickets(ticketsDir, { stage: 'backlog' });
  const stale = backlog.filter(t => daysBetween(t.updated || t.created) >= staleDays);

  // Check for tickets with only template placeholder acceptance criteria
  const PLACEHOLDER_AC = /\[First criterion\]|\[Second criterion\]|\[Third criterion\]/;
  let noAcceptanceCriteria = 0;
  for (const t of backlog) {
    const ticket = readTicket(t.path);
    if (!ticket) continue;
    const content = ticket.content;
    // Extract AC section
    const acMatch = content.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/);
    if (!acMatch) { noAcceptanceCriteria++; continue; }
    const acSection = acMatch[1].trim();
    // No checkboxes at all, or only template placeholders
    if (!acSection.includes('- [') || PLACEHOLDER_AC.test(acSection)) {
      noAcceptanceCriteria++;
    }
  }

  return { total: backlog.length, stale: stale.length, noAcceptanceCriteria, staleDays };
}

/**
 * Create a new ticket in the tickets directory
 */
export function createTicket(ticketsDir, { prefix, title, type = 'feature', priority = 'medium', author = 'unknown', area = '', parent = null, services = null, repos = null, workflow = null, description = '', criteria = [], feature = null, persona = null }) {
  const slug = slugify(title);
  const { id, dirpath, dirname } = nextId(ticketsDir, prefix, slug);
  const dt = today();

  const frontmatter = {
    id,
    title,
    stage: 'backlog',
    type,
    priority,
    area: area || null,
    author,
    assigned: null,
    services: services && services.length > 0 ? services : null,
    // v2: which repos from the project's group this ticket touches — build/test/
    // ship act only on these.
    repos: repos && repos.length > 0 ? repos : null,
    workflow: workflow || null,
    blocked: false,
    blocked_reason: null,
    previous_stage: null,
    parent: parent || null,
    // Traceability into .bobby/product/: the feature-map row this ticket
    // implements (e.g. F1.2) and the persona it serves (e.g. P1).
    feature: feature || null,
    persona: persona || null,
    created: dt,
    updated: dt,
  };

  // Callers that know what the work is (bobby audit, scripted seeding) pass it
  // in; everyone else gets the fill-in-the-blanks template.
  const describedBody = `
## Description

${description.trim()}

## Acceptance Criteria

${(criteria.length > 0 ? criteria : ['[First criterion]']).map((c) => `- [ ] ${c}`).join('\n')}

## Comments
`;

  // Steps to Reproduce is a bug section. Emitting it on every type left a
  // "(bugs only)" heading sitting in the middle of every feature ticket — and
  // contradicted our own intake rule ("Bugs get Steps to Reproduce — all other
  // types do not"). It renders in the app now, so the leak is visible.
  const reproSection = type === 'bug' ? `
## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]
` : '';

  const templateBody = `
## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]
${reproSection}
## Comments
`;

  const body = description.trim() || criteria.length > 0 ? describedBody : templateBody;

  writeTicket(dirpath, frontmatter, body);

  // Create starter test-cases.md
  const testCasesContent = `# Test Cases

_Add test cases here during planning._

## Test Case 1

**Preconditions:**
**Steps:**
1.
**Expected Result:**
`;
  fs.writeFileSync(path.join(dirpath, 'test-cases.md'), testCasesContent, 'utf8');

  return { id, path: dirpath, dirname };
}

/**
 * Move a ticket to a new stage by updating frontmatter
 */
export function moveTicket(ticketsDir, id, targetStage, by = 'system', comment = '') {
  if (!isValidStage(targetStage)) {
    throw new Error(`Invalid stage '${targetStage}'. Valid stages: ${STAGES.join(', ')}`);
  }

  const found = findTicket(ticketsDir, id);
  if (!found) {
    throw new Error(`Ticket ${id} not found`);
  }

  if (found.stage === targetStage && !comment) {
    return found;
  }

  const dt = today();
  const data = { ...found.data };
  let body = found.content;

  // Handle blocked: store previous_stage
  if (targetStage === 'blocked') {
    data.previous_stage = data.stage;
    data.blocked = true;
    if (comment) data.blocked_reason = comment;
  }

  // Handle unblock: restore previous_stage (called from move.js with special logic)
  if (data.blocked && targetStage !== 'blocked') {
    data.blocked = false;
    data.blocked_reason = null;
    data.previous_stage = null;
  }

  data.stage = targetStage;
  data.updated = dt;

  // Append comment
  if (comment) {
    const commentLine = `\n- [${dt}] ${by}: ${comment}`;
    if (body.includes('## Comments')) {
      body = body.replace('## Comments', `## Comments${commentLine}`);
    } else {
      body += `\n## Comments${commentLine}\n`;
    }
  }

  writeTicket(found.path, data, body);

  // Auto-advance parent epic if all children have reached this stage or beyond
  if (found.data.parent && found.data.type !== 'epic') {
    const parent = findTicket(ticketsDir, found.data.parent);
    if (parent && parent.data.type === 'epic') {
      const siblings = listTickets(ticketsDir, { epic: found.data.parent });
      const activeChildren = siblings.filter(c => c.stage !== 'blocked');
      if (activeChildren.length > 0) {
        const minChildIndex = Math.min(...activeChildren.map(c => stageIndex(c.stage)));
        const parentIndex = stageIndex(parent.data.stage);
        if (minChildIndex > parentIndex && minChildIndex <= stageIndex('done')) {
          const newStage = STAGES[minChildIndex];
          const epicData = { ...parent.data, stage: newStage, updated: today() };
          writeTicket(parent.path, epicData, parent.content);
        }
      }
    }
  }

  return { stage: targetStage, path: found.path, dirname: found.dirname };
}

/**
 * Add a comment to a ticket without changing stage
 */
export function addComment(ticketsDir, id, by, comment) {
  const found = findTicket(ticketsDir, id);
  if (!found) {
    throw new Error(`Ticket ${id} not found`);
  }

  const dt = today();
  let body = found.content;
  const commentLine = `\n- [${dt}] ${by}: ${comment}`;

  if (body.includes('## Comments')) {
    body = body.replace('## Comments', `## Comments${commentLine}`);
  } else {
    body += `\n## Comments${commentLine}\n`;
  }

  found.data.updated = dt;
  writeTicket(found.path, found.data, body);
}

/**
 * Update arbitrary fields on a ticket's frontmatter
 */
export function updateTicket(ticketsDir, id, updates) {
  const found = findTicket(ticketsDir, id);
  if (!found) {
    throw new Error(`Ticket ${id} not found`);
  }

  const data = { ...found.data, ...updates, updated: today() };
  writeTicket(found.path, data, found.content);

  return { id, path: found.path };
}

/**
 * Get an epic and its sorted child tickets for feature workflow
 */
export function getFeatureTickets(ticketsDir, epicId) {
  const epic = findTicket(ticketsDir, epicId);
  if (!epic) throw new Error(`Ticket ${epicId} not found`);
  if (epic.data.type !== 'epic') throw new Error(`${epicId} is not an epic (type: ${epic.data.type})`);

  const children = listTickets(ticketsDir, { epic: epicId });

  // Sort: stage progress (further along first), then priority, then ID.
  // An unknown stage sorts with backlog (derived, not pinned — a literal here
  // silently drifted when a new stage renumbered the ranks).
  children.sort((a, b) => {
    const stageDiff = (STAGE_ORDER[a.stage] ?? STAGE_ORDER.backlog) - (STAGE_ORDER[b.stage] ?? STAGE_ORDER.backlog);
    if (stageDiff !== 0) return stageDiff;
    const priDiff = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    if (priDiff !== 0) return priDiff;
    return (a.id || '').localeCompare(b.id || '');
  });

  return { epic, children };
}

/**
 * List all epics with child count and stage summary
 */
export function listEpics(ticketsDir) {
  const all = listTickets(ticketsDir);
  const epics = all.filter(t => t.type === 'epic');

  return epics.map(epic => {
    const children = all.filter(t => t.parent === epic.id);
    const stageCounts = {};
    for (const child of children) {
      stageCounts[child.stage] = (stageCounts[child.stage] || 0) + 1;
    }
    const summary = Object.entries(stageCounts)
      .map(([stage, count]) => `${count} ${stage}`)
      .join(', ');

    return {
      ...epic,
      childCount: children.length,
      stageSummary: summary || 'no children',
    };
  });
}
