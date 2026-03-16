// lib/counter.js
import fs from 'fs';
import path from 'path';
import { STAGES } from './stages.js';

export function nextId(ticketsDir, prefix) {
  const counterFile = path.join(ticketsDir, '.counter');
  let count = 0;
  if (fs.existsSync(counterFile)) {
    const raw = fs.readFileSync(counterFile, 'utf8').trim();
    count = parseInt(raw, 10);
    if (isNaN(count)) {
      count = repairCounter(ticketsDir, prefix);
    }
  }
  count++;
  fs.writeFileSync(counterFile, String(count), 'utf8');
  return `${prefix}-${String(count).padStart(3, '0')}`;
}

export function nextIdeaId(ticketsDir, prefix) {
  const counterFile = path.join(ticketsDir, '.idea-counter');
  let count = 0;
  if (fs.existsSync(counterFile)) {
    const raw = fs.readFileSync(counterFile, 'utf8').trim();
    count = parseInt(raw, 10) || 0;
  }
  count++;
  fs.writeFileSync(counterFile, String(count), 'utf8');
  return `${prefix}-${String(count).padStart(3, '0')}`;
}

export function repairCounter(ticketsDir, prefix) {
  let maxId = 0;
  for (const stage of STAGES) {
    const stageDir = path.join(ticketsDir, stage);
    if (!fs.existsSync(stageDir)) continue;
    const entries = fs.readdirSync(stageDir);
    for (const entry of entries) {
      const match = entry.match(new RegExp(`^${prefix}-(\\d+)`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  }
  fs.writeFileSync(path.join(ticketsDir, '.counter'), String(maxId), 'utf8');
  return maxId;
}
