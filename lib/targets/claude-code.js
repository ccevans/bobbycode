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

  promptHint() {
    return 'Copy this prompt into Claude Code or run with a subagent:';
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
