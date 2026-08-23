// lib/targets/agents-md.js
//
// The generic AGENTS.md target (BOB-081) — Bobby's honest answer to "does
// Bobby support X?" for the 20+ tools that read the Linux Foundation AGENTS.md
// convention without a dedicated adapter (Copilot, Windsurf, Zed, Jules, Amp,
// opencode, Devin, ...).
//
// THE TIER IS "rules + skills work in any AGENTS.md tool" — NOT full parity.
// Overclaiming here is the exact trap the epic exists to avoid, so this
// adapter claims nothing it cannot: no subagent registry, no command surface,
// no executor derivation.
//
// Verifications:
//   rules  -> AGENTS.md — the convention itself; same file cursor and codex
//     write, so backup/merge is proven.
//   skills -> .agents/skills/ — verified against a shipped binary ON THIS
//     MACHINE: cursor-agent 2026.07.23 scans ".agents/skills/" as a skill root
//     beside .claude/skills/ and .codex/skills/ (strings of 4517.index.js).
//   agents -> .agents/agents/ prompt-referenced files. supportsSubagents()
//     false: no generic registry exists, and the prompts reference each agent
//     by path, which works in any tool.
//   commands -> .agents/commands/ reference docs, frontmatter STRIPPED: no
//     cross-tool command convention exists and no generic tool parses command
//     frontmatter, so shipping it would render as literal YAML in whatever
//     does read the file.

/** Strip a leading YAML frontmatter block; keep the description as a lead line. */
function stripFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return content;
  const desc = m[1].match(/^description:[ \t]*(.+)$/m)?.[1]?.trim();
  const body = content.slice(m[0].length).replace(/^\s*\n/, '');
  return desc && !/^[>|]/.test(desc) ? `*${desc}*\n\n${body}` : body;
}

export default {
  name: 'agents-md',

  displayName() {
    return 'AGENTS.md (generic)';
  },

  paths() {
    return {
      agents: '.agents/agents',
      skills: '.agents/skills',
      commands: '.agents/commands',
      rules: 'AGENTS.md',
    };
  },

  supportsSubagents() {
    return false;
  },

  promptHint() {
    return 'Copy this prompt into your AGENTS.md-compatible tool:';
  },

  transformCommand(content) {
    return stripFrontmatter(content);
  },

  extraPaths() {
    return [];
  },

  scaffoldExtras() {
    // Nothing: the whole point of this tier is the shared convention.
  },
};
