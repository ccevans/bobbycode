// lib/tickets.js
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { STAGES, isValidStage, stageIndex } from './stages.js';
import { nextId } from './counter.js';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
// Lower = further along = sort first (finish in-progress work before starting new)
const STAGE_ORDER = { done: 0, shipping: 1, testing: 2, reviewing: 3, building: 4, planning: 5, backlog: 6, blocked: 7 };

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
 * List all tickets, optionally filtered by stage
 */
export function listTickets(ticketsDir, { stage, blocked, epic } = {}) {
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

    tickets.push(t);
  }

  return tickets;
}

/**
 * Create a new ticket in the tickets directory
 */
export function createTicket(ticketsDir, { prefix, title, type = 'feature', priority = 'medium', author = 'unknown', area = '', parent = null }) {
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
    blocked: false,
    blocked_reason: null,
    previous_stage: null,
    parent: parent || null,
    created: dt,
    updated: dt,
  };

  const body = `
## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Steps to Reproduce (bugs only)

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
`;

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
  data.assigned = null;
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
 * Get an epic and its sorted child tickets for feature workflow
 */
export function getFeatureTickets(ticketsDir, epicId) {
  const epic = findTicket(ticketsDir, epicId);
  if (!epic) throw new Error(`Ticket ${epicId} not found`);
  if (epic.data.type !== 'epic') throw new Error(`${epicId} is not an epic (type: ${epic.data.type})`);

  const children = listTickets(ticketsDir, { epic: epicId });

  // Sort: stage progress (further along first), then priority, then ID
  children.sort((a, b) => {
    const stageDiff = (STAGE_ORDER[a.stage] ?? 7) - (STAGE_ORDER[b.stage] ?? 7);
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
