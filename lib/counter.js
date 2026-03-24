// lib/counter.js
import fs from 'fs';
import path from 'path';

const MAX_RETRIES = 20;

/**
 * Claim the next ticket ID by atomically creating the ticket directory.
 * Uses mkdir as the atomic operation — if two agents race for the same ID,
 * one gets EEXIST and retries with the next number.
 *
 * @param {string} ticketsDir - Path to the tickets directory
 * @param {string} prefix - Ticket prefix (e.g. 'TKT')
 * @param {string} slug - URL-safe slug for the ticket title
 * @returns {{ id: string, dirpath: string, dirname: string }}
 */
export function nextId(ticketsDir, prefix, slug) {
  const counterFile = path.join(ticketsDir, '.counter');
  let candidate = readCounter(counterFile);
  if (isNaN(candidate)) {
    candidate = repairCounter(ticketsDir, prefix);
  }

  // Read existing entries once to know which IDs are taken
  const existing = fs.existsSync(ticketsDir) ? fs.readdirSync(ticketsDir) : [];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    candidate++;
    const id = `${prefix}-${String(candidate).padStart(3, '0')}`;

    // Skip if any directory already claims this ID (even with a different slug)
    if (existing.some(e => e.startsWith(`${id}--`))) {
      continue;
    }

    const dirname = `${id}--${slug}`;
    const dirpath = path.join(ticketsDir, dirname);

    try {
      fs.mkdirSync(dirpath); // atomic — throws EEXIST on collision
      fs.writeFileSync(counterFile, String(candidate), 'utf8');
      return { id, dirpath, dirname };
    } catch (err) {
      if (err.code === 'EEXIST') {
        continue; // another agent raced us — try next
      }
      throw err; // unexpected error — propagate
    }
  }

  throw new Error(`Failed to claim ticket ID after ${MAX_RETRIES} retries`);
}

function readCounter(counterFile) {
  if (!fs.existsSync(counterFile)) return 0;
  const raw = fs.readFileSync(counterFile, 'utf8').trim();
  return parseInt(raw, 10);
}

export function repairCounter(ticketsDir, prefix) {
  let maxId = 0;
  if (!fs.existsSync(ticketsDir)) return maxId;

  const entries = fs.readdirSync(ticketsDir);
  for (const entry of entries) {
    const match = entry.match(new RegExp(`^${prefix}-(\\d+)`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) maxId = num;
    }
  }

  fs.writeFileSync(path.join(ticketsDir, '.counter'), String(maxId), 'utf8');
  return maxId;
}
