// lib/targets/codex.js
//
// OpenAI Codex CLI adapter.
//
// Everything below was verified against the real @openai/codex 0.146.0 binary
// (strings + --help), not documentation — see TKT-003. Two findings shaped it:
//
//   AGENTS.md is Codex's native project-instruction mechanism. The binary
//   carries a full "AGENTS.md spec" in its base instructions: scope is the
//   directory tree rooted at the containing folder, more-deeply-nested files
//   take precedence, and the root file ships with the developer message. Codex
//   even has `/init` to create one. So rules go there, same as the cursor and
//   agents-md targets.
//
//   Skills are USER-level. Every in-binary reference resolves to
//   `$CODEX_HOME/skills` (default `~/.codex/skills`), and the binary's own
//   skill-install text says so. Project-level auto-loading of `.codex/skills/`
//   is NOT confirmed. Bobby still writes skills there for namespace
//   consistency, and the loop does not depend on auto-loading: AGENTS.md names
//   the skills directory and every generated prompt references its agent and
//   skill by path. If a future Codex scans project skills, this lands correctly
//   with no change.
//
// `supportsSubagents()` is false deliberately. The binary mentions a subagents
// concept, but the definition file format and directory are unverified — and
// the rule for this epic is that unverified conventions do not ship. Agents are
// plain prompt-referenced files, which works regardless.

import fs from 'fs';
import path from 'path';

export default {
  name: 'codex',

  displayName() {
    return 'Codex';
  },

  paths() {
    return {
      agents: '.codex/agents',
      skills: '.codex/skills',
      commands: '.codex/prompts',
      rules: 'AGENTS.md',
    };
  },

  supportsSubagents() {
    return false;
  },

  promptHint() {
    return 'Paste this prompt into Codex, or run it headless with `codex exec`:';
  },

  // Codex custom prompts are plain markdown and are marked deprecated in favor
  // of skills; nothing confirms it parses YAML frontmatter, so a block would
  // render as body text. Keep the description as a visible lead line.
  transformCommand(content) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(content);
    if (!fm) return content;
    const body = content.slice(fm[0].length).replace(/^[\r\n]+/, '');
    const desc = /^description:[ \t]*(.*)$/m.exec(fm[1]);
    if (!desc) return body;
    const text = desc[1].trim().replace(/^["']|["']$/g, '');
    return text ? `_${text}_\n\n${body}` : body;
  },

  extraPaths() {
    return [];
  },

  scaffoldExtras(rootDir) {
    // Codex reads .gitignore for what to skip; there is no separate ignore
    // convention to write. Ensure the session-log directory stays out of the
    // repo's own ignore only if the user already has a .gitignore — never
    // create one, since that would be a surprising side effect of `bobby init`.
    const gitignore = path.join(rootDir, '.gitignore');
    if (!fs.existsSync(gitignore)) return;
    const content = fs.readFileSync(gitignore, 'utf8');
    if (content.split('\n').some(l => l.trim() === '.bobby/sessions/')) return;
    const prefix = content && !content.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignore, `${content}${prefix}.bobby/sessions/\n`, 'utf8');
  },
};
