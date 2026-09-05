// lib/targets/claude-code.js

export default {
  name: 'claude-code',

  displayName() {
    return 'Claude Code';
  },

  paths() {
    return {
      agents: '.claude/agents',
      skills: '.claude/skills',
      commands: '.claude/commands',
      rules: 'CLAUDE.md',
    };
  },

  supportsSubagents() {
    return true;
  },

  supportsAgentModel() {
    // Claude Code parses `model:` in subagent frontmatter and accepts the same
    // tier aliases Bobby's registry ships (opus | sonnet | haiku | inherit), so
    // a per-stage model reaches an agent launched from THIS session — not just
    // one spawned headless by the dashboard.
    //
    // Deliberately not extended to cursor, the other supportsSubagents target:
    // its subagent frontmatter takes cursor's own model names, and this repo
    // does not write a model name it has not verified against the real binary.
    // A cursor project sets `models:` with names from `cursor-agent
    // --list-models` and gets the same behaviour, named rather than guessed.
    return true;
  },

  promptHint() {
    return 'Copy this prompt into Claude Code or run with a subagent:';
  },

  keepsCommandFrontmatter() {
    // Claude Code parses command frontmatter (allowed-tools etc.) — kept.
    return true;
  },

  transformCommand(content) {
    return content;
  },

  extraPaths() {
    return [];
  },

  scaffoldExtras() {
    // No extras needed for Claude Code
  },
};
