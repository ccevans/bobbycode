// lib/targets/agents-md.js
//
// The generic tier: any tool that reads the AGENTS.md convention.
//
// AGENTS.md is a Linux Foundation-stewarded standard read natively by Codex,
// Copilot, Cursor, Gemini, Jules, Windsurf, Zed, Amp, Factory, opencode and
// others. This target exists so Bobby works in tools that have no dedicated
// adapter, and so "does Bobby support X?" has an honest answer for any X.
//
// Verified against shipped code, not documentation:
//   - Cursor 3.13's skill-root array literally contains ".agents/skills/",
//     alongside ".cursor/skills/", ".claude/skills/" and ".codex/skills/".
//   - @openai/codex 0.146.0 carries a full "AGENTS.md spec" in its base
//     instructions and uses the adjacent ".agents/plugins" namespace.
//
// Scope, stated plainly because overclaiming here is the trap this whole epic
// exists to avoid: this tier gives you rules and skills. It does NOT claim
// subagent dispatch, and it derives no dashboard executor — a tool reached only
// through this target is driven by hand or by whatever `dashboard.executor` you
// set. Use a dedicated target (claude-code, cursor, codex) where one exists.

export default {
  name: 'agents-md',

  displayName() {
    return 'your agent';
  },

  paths() {
    return {
      agents: '.agents/agents',
      skills: '.agents/skills',
      commands: '.agents/commands',
      rules: 'AGENTS.md',
    };
  },

  // No cross-tool subagent convention exists. Agent definitions are plain files
  // that the generated prompts reference by path, which works everywhere.
  supportsSubagents() {
    return false;
  },

  promptHint() {
    return 'Paste this prompt into your agent:';
  },

  // No generic tool is known to parse command frontmatter, so a YAML block
  // would render as body text. Keep the description as a visible lead line.
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

  // Nothing tool-specific to write — that is the point of the generic tier.
  scaffoldExtras() {},
};
