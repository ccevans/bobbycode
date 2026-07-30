// lib/targets/cursor.js
//
// Cursor adapter. Three of the four scaffold paths land on things Cursor
// already understands natively:
//
//   skills   -> .cursor/skills/<name>/SKILL.md   invocable as /bobby-build
//   commands -> .cursor/commands/<name>.md       invocable as /bobby-build
//   rules    -> AGENTS.md                        read automatically at repo root
//
// Skills and commands intentionally share every name: Cursor gained skills
// after commands, so older versions only honor the latter. Both resolve to the
// same work (the command body is a one-line pointer at the skill), at the cost
// of each /bobby-* appearing twice in the picker on versions supporting both.
//
//   agents   -> .cursor/agents/<name>.md        workspace-scoped subagents
//
// Verified against Cursor 3.13's shipped code: `.cursor/agents` (workspace) and
// `~/.cursor/agents` (user) are watched as subagent definitions, subagent
// identity is keyed on the `name` frontmatter field, and dispatch happens
// through a task tool. Bobby's agent files already carry `name` + `description`,
// so they land in the right shape. Older Cursor builds predate subagents and
// simply ignore the directory; the prompts reference each agent by path anyway,
// so the loop works either way.
//
// Rules deliberately go to AGENTS.md rather than .cursor/rules/*.mdc. Project
// rules must use the .mdc extension and carry frontmatter to be picked up at
// all, whereas AGENTS.md is plain markdown, always applied, and shared with
// every other tool that reads the same convention.

import fs from 'fs';
import path from 'path';

/**
 * Pull the `description` out of a YAML frontmatter block as plain text.
 * Handles quoted scalars and folded/literal blocks (`>`, `|`, `>-`, `|-`),
 * whose text lives on the following indented lines rather than inline.
 * Returns '' when there is no usable description.
 */
function extractDescription(frontmatter) {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex(l => /^description:/.test(l));
  if (start === -1) return '';

  let value = lines[start].replace(/^description:[ \t]*/, '').trim();
  if (/^[>|][-+]?$/.test(value)) {
    const folded = [];
    for (let i = start + 1; i < lines.length && /^[ \t]+\S/.test(lines[i]); i++) {
      folded.push(lines[i].trim());
    }
    value = folded.join(' ');
  }
  return value.replace(/^["']|["']$/g, '').trim();
}

export default {
  name: 'cursor',

  displayName() {
    return 'Cursor';
  },

  paths() {
    return {
      agents: '.cursor/agents',
      skills: '.cursor/skills',
      commands: '.cursor/commands',
      rules: 'AGENTS.md',
    };
  },

  supportsSubagents() {
    return true;
  },

  promptHint() {
    return 'Paste this prompt into Cursor, or run it headless with `cursor-agent -p`:';
  },

  // Cursor commands are plain markdown — the filename is the command name and
  // frontmatter is not parsed, so a YAML block would render as body text. Keep
  // the description as a visible first line and drop the rest.
  transformCommand(content) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(content);
    if (!fm) return content;
    const body = content.slice(fm[0].length).replace(/^[\r\n]+/, '');
    const desc = extractDescription(fm[1]);
    return desc ? `_${desc}_\n\n${body}` : body;
  },

  // Files scaffoldExtras writes, so auto-sync can stage them.
  extraPaths() {
    return ['.cursorindexingignore'];
  },

  scaffoldExtras(rootDir) {
    // Session logs are append-only JSONL that would otherwise dominate
    // codebase search. Indexing-ignore (not .cursorignore) because Bobby's
    // agents must still be able to read everything under .bobby/ — tickets,
    // architecture notes, decisions — on demand.
    const ignorePath = path.join(rootDir, '.cursorindexingignore');
    const entries = ['.bobby/sessions/'];
    const existing = fs.existsSync(ignorePath)
      ? fs.readFileSync(ignorePath, 'utf8')
      : '';
    const missing = entries.filter(e => !existing.split('\n').some(l => l.trim() === e));
    if (missing.length === 0) return;
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(ignorePath, existing + prefix + missing.join('\n') + '\n', 'utf8');
  },
};
