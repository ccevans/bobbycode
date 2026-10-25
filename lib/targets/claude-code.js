// lib/targets/claude-code.js
import { writeWorkflowScripts } from '../workflow-script.js';

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
    return ['.claude/workflows'];
  },

  // Saved Workflow-tool scripts, only when .bobbyrc.yml has orchestration: workflow.
  // With no config (or the flag off) this writes nothing and prunes stale bobby-*.js.
  scaffoldExtras(rootDir, config = {}) {
    writeWorkflowScripts(rootDir, config);
  },
};
