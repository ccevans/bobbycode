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

  supportsAgentEffort() {
    // Claude Code reads `effort:` (low | medium | high | xhigh | max) from
    // subagent frontmatter. Only CLAUDE_CODE_EFFORT_LEVEL outranks it.
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

  // Only when scaffoldExtras writes there (orchestration: workflow): the target
  // matrix (BOB-078) requires every extraPath to exist after a default scaffold.
  extraPaths(config = {}) {
    return config.orchestration === 'workflow' ? ['.claude/workflows'] : [];
  },

  // Saved Workflow-tool scripts, only when .bobbyrc.yml has orchestration: workflow.
  // With no config (or the flag off) this writes nothing and prunes stale bobby-*.js.
  scaffoldExtras(rootDir, config = {}) {
    writeWorkflowScripts(rootDir, config);
  },
};
