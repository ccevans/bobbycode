// lib/sprint.js
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { nextId } from './counter.js';
import { slugify } from './tickets.js';

export const SPRINT_PREFIX = 'SPR';
export const SPRINT_STATUSES = ['planned', 'active', 'done', 'abandoned'];

function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Render the starter sprint-plan.md — prose context for the sprint runner.
 * The authoritative, ordered ticket list lives in sprint.yml, not here.
 */
function renderSprintPlan(data) {
  return `# Sprint ${data.id} — ${data.name}

_A batch of related tickets worked one-by-one on a single branch, so \`main\` stays clean while a bigger change comes together._

**Goal:** ${data.goal || '_What does finishing this batch deliver?_'}

**Branch:** \`${data.branch}\`

> The authoritative, ordered ticket list lives in \`sprint.yml\`.
> Edit this file with the cross-cutting context the runner and agents should know.

## Sequencing rationale

_Why this order? Note dependencies between tickets so each one lands safely on top of the last._

## Cross-ticket notes

_Shared decisions, naming conventions, and integration concerns that span tickets._

## Out of scope

_What this batch explicitly does NOT cover._
`;
}

/**
 * Read a sprint's manifest from sprint.yml.
 */
export function readSprint(sprintDir) {
  const file = path.join(sprintDir, 'sprint.yml');
  if (!fs.existsSync(file)) return null;
  const data = YAML.parse(fs.readFileSync(file, 'utf8')) || {};
  if (!Array.isArray(data.tickets)) data.tickets = [];
  return { data, path: sprintDir, dirname: path.basename(sprintDir) };
}

/**
 * Write a sprint's manifest back to sprint.yml.
 */
export function writeSprint(sprintDir, data) {
  const file = path.join(sprintDir, 'sprint.yml');
  fs.writeFileSync(file, YAML.stringify(data, { lineWidth: 120 }), 'utf8');
}

/**
 * Find a sprint by ID in the sprints directory.
 */
export function findSprint(sprintsDir, id) {
  if (!fs.existsSync(sprintsDir)) return null;
  for (const entry of fs.readdirSync(sprintsDir)) {
    if (entry.startsWith(`${id}--`) || entry === id) {
      const full = path.join(sprintsDir, entry);
      if (fs.statSync(full).isDirectory()) {
        const sprint = readSprint(full);
        if (sprint) return sprint;
      }
    }
  }
  return null;
}

/**
 * List all sprints, sorted by ID.
 */
export function listSprints(sprintsDir) {
  if (!fs.existsSync(sprintsDir)) return [];
  const sprints = [];
  for (const entry of fs.readdirSync(sprintsDir)) {
    if (entry.startsWith('.')) continue;
    const full = path.join(sprintsDir, entry);
    if (!fs.statSync(full).isDirectory()) continue;
    const sprint = readSprint(full);
    if (sprint) sprints.push({ ...sprint.data, path: full, dirname: entry });
  }
  sprints.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return sprints;
}

/**
 * Create a new sprint — a directory with sprint.yml and a starter sprint-plan.md.
 */
export function createSprint(sprintsDir, { name, goal = '', workflow = 'default', tickets = [], branchPrefix = 'feature' }) {
  if (!name || !name.trim()) {
    throw new Error('Sprint name is required');
  }
  fs.mkdirSync(sprintsDir, { recursive: true });
  const slug = slugify(name);
  const { id, dirpath } = nextId(sprintsDir, SPRINT_PREFIX, slug);
  const dt = today();
  const data = {
    id,
    name: name.trim(),
    goal: goal || '',
    status: 'planned',
    branch: `${branchPrefix}/${id.toLowerCase()}-${slug}`,
    workflow: workflow || 'default',
    tickets: [...tickets],
    created: dt,
    updated: dt,
  };
  writeSprint(dirpath, data);
  fs.writeFileSync(path.join(dirpath, 'sprint-plan.md'), renderSprintPlan(data), 'utf8');
  return { id, path: dirpath, data };
}

/**
 * Add ticket(s) to a sprint, preserving order and skipping duplicates.
 */
export function addTicketsToSprint(sprintsDir, id, ticketIds) {
  const sprint = findSprint(sprintsDir, id);
  if (!sprint) throw new Error(`Sprint ${id} not found`);
  const existing = new Set(sprint.data.tickets);
  const added = [];
  for (const ticketId of ticketIds) {
    if (!existing.has(ticketId)) {
      existing.add(ticketId);
      sprint.data.tickets.push(ticketId);
      added.push(ticketId);
    }
  }
  sprint.data.updated = today();
  writeSprint(sprint.path, sprint.data);
  return { sprint: sprint.data, added };
}

/**
 * Remove ticket(s) from a sprint.
 */
export function removeTicketsFromSprint(sprintsDir, id, ticketIds) {
  const sprint = findSprint(sprintsDir, id);
  if (!sprint) throw new Error(`Sprint ${id} not found`);
  const toRemove = new Set(ticketIds);
  const before = sprint.data.tickets.length;
  sprint.data.tickets = sprint.data.tickets.filter(t => !toRemove.has(t));
  sprint.data.updated = today();
  writeSprint(sprint.path, sprint.data);
  return { sprint: sprint.data, removed: before - sprint.data.tickets.length };
}

/**
 * Set a sprint's status.
 */
export function setSprintStatus(sprintsDir, id, status) {
  if (!SPRINT_STATUSES.includes(status)) {
    throw new Error(`Invalid status '${status}'. Valid: ${SPRINT_STATUSES.join(', ')}`);
  }
  const sprint = findSprint(sprintsDir, id);
  if (!sprint) throw new Error(`Sprint ${id} not found`);
  sprint.data.status = status;
  sprint.data.updated = today();
  writeSprint(sprint.path, sprint.data);
  return sprint.data;
}
