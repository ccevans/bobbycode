// lib/tickets.js
import fs from 'fs';
import path from 'path';
import { STAGES, isValidStage } from './stages.js';
import { nextId } from './counter.js';

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

export function findTicket(ticketsDir, id) {
  for (const stage of STAGES) {
    const stageDir = path.join(ticketsDir, stage);
    if (!fs.existsSync(stageDir)) continue;
    const entries = fs.readdirSync(stageDir);
    for (const entry of entries) {
      if (entry.startsWith(`${id}--`)) {
        const fullPath = path.join(stageDir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          return { stage, path: fullPath, dirname: entry };
        }
      }
    }
  }
  return null;
}

export function findIdea(ticketsDir, id) {
  const ideasDir = path.join(ticketsDir, '0-ideas');
  if (!fs.existsSync(ideasDir)) return null;
  const entries = fs.readdirSync(ideasDir);
  for (const entry of entries) {
    if (entry.startsWith(`${id}--`) && entry.endsWith('.md')) {
      return path.join(ideasDir, entry);
    }
  }
  return null;
}

export function createTicket(ticketsDir, { prefix, title, type = 'feature', priority = 'medium', author = 'unknown', area = '', areas = [], skillRouting = {} }) {
  const id = nextId(ticketsDir, prefix);
  const slug = slugify(title);
  const dirname = `${id}--${slug}`;
  const dirpath = path.join(ticketsDir, '1-backlog', dirname);
  const dt = today();

  // Create folder structure
  fs.mkdirSync(path.join(dirpath, 'screenshots'), { recursive: true });

  // Build areas string for template
  const areasStr = areas.length > 0 ? areas.join(' | ') : '_unspecified_';

  // Resolve skills from area
  let skills = '';
  if (area && skillRouting[area]) {
    skills = skillRouting[area].join(', ');
  }

  // Create ticket.md
  const ticketContent = `# ${id} — ${title}

**Type:** ${type}
**Priority:** ${priority}
**Area:** ${area || areasStr}
**Stack:** _unspecified_
**Skills:** ${skills || '_none_'}
**Created by:** ${author}
**Assigned to:** —
**Created:** ${dt}
**Updated:** ${dt}

---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

---

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

---

## Environment

- **URL:** _set in .bobbyrc.yml health_checks_
- **Related test suite:** _none_
- **Related test ID:** _none_

---

## Implementation Plan

_Plan is stored as \`plan.md\` in this ticket's folder._

---

## Steps to Reproduce (bugs only)

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

---

## Dev Notes

_Engineer updates go here. Add notes as work progresses._

---

## QE Notes

_QE/testing feedback goes here. If sending back to dev, explain what failed and how to reproduce._

---

## History

| Date | From | To | By | Comment |
|------|------|----|-----|---------|
| ${dt} | — | backlog | ${author} | Ticket created |
`;

  fs.writeFileSync(path.join(dirpath, 'ticket.md'), ticketContent, 'utf8');

  // Create starter test-cases.md
  const testCasesContent = `# Test Cases

_Add test cases here during refinement._

## Test Case 1

**Preconditions:**
**Steps:**
1.
**Expected Result:**
`;
  fs.writeFileSync(path.join(dirpath, 'test-cases.md'), testCasesContent, 'utf8');

  return { id, path: dirpath, dirname };
}

export function moveTicket(ticketsDir, id, targetStage, by = 'system', comment = '') {
  if (!isValidStage(targetStage)) {
    throw new Error(`Invalid stage '${targetStage}'. Valid stages: ${STAGES.join(', ')}`);
  }

  const found = findTicket(ticketsDir, id);
  if (!found) {
    throw new Error(`Ticket ${id} not found`);
  }

  if (found.stage === targetStage) {
    return found; // Already there
  }

  const newPath = path.join(ticketsDir, targetStage, found.dirname);
  fs.renameSync(found.path, newPath);

  // Append to history in ticket.md
  const ticketFile = path.join(newPath, 'ticket.md');
  if (fs.existsSync(ticketFile)) {
    const dt = today();
    const historyLine = `| ${dt} | ${found.stage} | ${targetStage} | ${by} | ${comment || 'Moved'} |\n`;
    fs.appendFileSync(ticketFile, historyLine, 'utf8');

    // Update the "Updated" date
    let content = fs.readFileSync(ticketFile, 'utf8');
    content = content.replace(/^\*\*Updated:\*\*.*/m, `**Updated:** ${dt}`);
    fs.writeFileSync(ticketFile, content, 'utf8');
  }

  return { stage: targetStage, path: newPath, dirname: found.dirname };
}
