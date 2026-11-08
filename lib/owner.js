// lib/owner.js — who owns a ticket (session + machine) and the handoff note format.
import os from 'os';
import { execFileSync } from 'child_process';

const PLACEHOLDER = 'TODO(handoff)';

export const HANDOFF_SECTIONS = [
  ['Where it stopped', 'what is done, and the exact step in progress'],
  ['Branch and commit', 'repo, branch, last commit SHA, pushed or not'],
  ['Unpushed patches', 'stashes, uncommitted files, local-only commits, or "none"'],
  ['Resources held', 'dev servers, docker DBs, ports, worktrees, run.lock, or "none"'],
  ['Open decisions for the human', 'questions waiting on the human, or "none"'],
  ['Next step', 'the one command or action the next session starts with'],
];

const defaultRun = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The OS computer name: scutil ComputerName on macOS, hostname elsewhere. */
export function machineName({ platform = process.platform, run = defaultRun } = {}) {
  let name;
  if (platform === 'darwin') {
    try {
      name = String(run('scutil', ['--get', 'ComputerName'])).trim();
    } catch (e) {
      throw new Error(`Could not read this computer's name (scutil --get ComputerName): ${e.message}`);
    }
    if (!name) throw new Error("Could not read this computer's name (scutil --get ComputerName): empty result");
  } else {
    name = os.hostname().trim();
    if (!name) throw new Error("Could not read this computer's name (hostname): empty result");
  }
  return name;
}

/** Map of section heading -> trimmed body, for the six handoff headings only. */
export function parseHandoff(text) {
  const known = new Set(HANDOFF_SECTIONS.map(([n]) => n));
  const result = new Map();
  let current = null;
  let lines = [];
  const flush = () => {
    if (current !== null) result.set(current, lines.join('\n').trim());
  };
  for (const line of String(text || '').split('\n')) {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = known.has(m[1]) && !result.has(m[1]) ? m[1] : null;
      lines = [];
    } else if (current !== null) {
      lines.push(line);
    }
  }
  flush();
  return result;
}

/** Sections that are missing, empty, or still hold the placeholder. */
export function unfilledSections(text) {
  const parsed = parseHandoff(text);
  return HANDOFF_SECTIONS.map(([n]) => n).filter(n => {
    const body = parsed.get(n);
    return !body || body.includes(PLACEHOLDER);
  });
}

const sectionBlock = ([name, hint]) => `## ${name}\n\n${PLACEHOLDER}: ${hint}\n`;

/** The handoff template, merged with whatever progress.md already holds. */
export function renderHandoffTemplate(id, existingText = '') {
  const existing = String(existingText || '');
  const parsed = parseHandoff(existing);
  if (parsed.size > 0) {
    const missing = HANDOFF_SECTIONS.filter(([n]) => !parsed.has(n));
    if (missing.length === 0) return existing;
    return `${existing.replace(/\s*$/, '')}\n\n${missing.map(sectionBlock).join('\n')}`;
  }
  let out = `# Handoff — ${id}\n\n${HANDOFF_SECTIONS.map(sectionBlock).join('\n')}`;
  if (existing.trim()) out += `\n## Earlier notes\n\n${existing.trim()}\n`;
  return out;
}
