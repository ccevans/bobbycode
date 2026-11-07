// lib/ticket-logs.js
// Raw test/ship logs stay local (gitignored); the committed record is a .log.md summary (TKT-086).
import fs from 'fs';
import path from 'path';

export const STUDIO_TICKET_LOG_PATTERN = '.bobby/*/tickets/*/**/*.log';

export function ticketLogPattern(config) {
  return config.studio ? STUDIO_TICKET_LOG_PATTERN : `${config.tickets_dir}/*/**/*.log`;
}

// Append each line not already present (exact trimmed match). Returns the lines added.
export function ensureGitignoreLines(root, lines, file = '.gitignore') {
  const gi = path.join(root, file);
  let text = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const existing = text.split('\n');
  const added = [];
  for (const n of lines) {
    if (existing.some(l => l.trim() === n) || added.includes(n)) continue;
    text += (text.endsWith('\n') || text === '' ? '' : '\n') + n + '\n';
    added.push(n);
  }
  if (added.length) fs.writeFileSync(gi, text, 'utf8');
  return added;
}

export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

const RESULT_PATTERNS = [
  /^Finished in /,
  /^\d+ examples?, \d+ failures?/,
  /^Tests:\s+/,
  /^Test Suites:\s+/,
  /^EXITCODE=\d+/,
];

export function extractResult(lines) {
  const out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (RESULT_PATTERNS.some(p => p.test(l))) out.push(l);
  }
  return out;
}

const FAILURE_CAP = 50;
const FAILURE_PATTERNS = [/^rspec \.\/\S+/, /^\s*● /, /^FAIL\s/];

export function extractFailures(lines) {
  const all = lines.filter(l => FAILURE_PATTERNS.some(p => p.test(l))).map(l => l.trimEnd());
  if (all.length <= FAILURE_CAP) return all;
  return [...all.slice(0, FAILURE_CAP), `… and ${all.length - FAILURE_CAP} more`];
}

export function summarizeLog(text, { name, source, command } = {}) {
  const lines = stripAnsi(text).split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const result = extractResult(lines);
  const failures = extractFailures(lines);
  const tail = lines.slice(-100);
  return [
    `# ${name}`,
    '',
    `- Source: ${source}`,
    `- Command: ${command || 'not recorded (pass --cmd)'}`,
    `- Result: ${result.length ? result.join(' · ') : 'no rspec or jest summary line found'}`,
    `- Raw log: logs/${name} (gitignored, kept on this machine only)`,
    '',
    '## Failures',
    failures.length ? failures.join('\n') : 'None found.',
    '',
    '## Last 100 lines',
    '~~~~text',
    tail.join('\n'),
    '~~~~',
    '',
  ].join('\n');
}
