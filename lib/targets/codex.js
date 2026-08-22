// lib/targets/codex.js
//
// Codex CLI adapter (BOB-079). Per the epic's hard rule, every convention here
// cites its verification — a real CLI run or a reading of the shipped binary
// (codex-cli 0.146.0, codex-darwin-x64, read 2026-08-22). The rule exists
// because three shipped-broken claims in the Cursor work were all of one
// species: conventions documented but never checked against the binary.
//
//   rules    -> AGENTS.md
//     VERIFIED: the shipped binary's base instructions embed a full "AGENTS.md
//     spec" section — natively read, directory-scoped, nested files take
//     precedence. Same file the cursor target writes, so the backup/merge path
//     is already proven.
//
//   skills   -> .codex/skills/<name>/SKILL.md
//     VERIFIED twice: the binary's own skill tooling resolves project-relative
//     `.codex/skills/<name>` (its init_skill helper text) with $CODEX_HOME/skills
//     as the user-level root; and Cursor 3.13's shipped binary scans
//     .codex/skills/ as a skill root (recorded in lib/targets/cursor.js).
//
//   commands -> .codex/commands/ — REFERENCE DOCS ONLY, and knowingly so.
//     VERIFIED: the current binary carries no `.codex/prompts` strings (custom
//     prompts deprecated as the docs said) and no project-level command
//     surface at all — the invocable unit is the skill, and Bobby's skills
//     already scaffold above. The flat command files are kept because prompts
//     reference them by path; they are documentation, not invocables, and the
//     rules file says so. Writing them into .codex/skills/ instead would
//     pollute a native discovery root with files Codex ignores.
//
//   agents   -> .codex/agents/ as prompt-referenced files (the cline pattern).
//     VERIFIED: Codex HAS subagents — spawn_agent/wait_agent/close_agent tools
//     and SubagentStart/SubagentStop hook events are in the binary — but NO
//     file-based project agent registry: the only `agents_dir` in the shipped
//     code is `<skill_dir>/agents/openai.yaml`, per-skill metadata. So
//     supportsSubagents() is false in Bobby's sense (no registry to land
//     definition files in), and the prompts reference each agent file by path,
//     which works in any harness.

export default {
  name: 'codex',

  displayName() {
    return 'Codex CLI';
  },

  paths() {
    return {
      agents: '.codex/agents',
      skills: '.codex/skills',
      commands: '.codex/commands',
      rules: 'AGENTS.md',
    };
  },

  supportsSubagents() {
    // Subagent TOOLS exist (spawn_agent et al.), but there is no file registry
    // for definitions — see the header. Bobby's meaning is registry dispatch.
    return false;
  },

  promptHint() {
    return 'Copy this prompt into Codex CLI (or run headless: codex exec):';
  },

  transformCommand(content) {
    // Codex parses no command frontmatter (there is no command surface at all —
    // header). These files are reference docs; keep them intact so the prompts
    // that cite them read the same everywhere.
    return content;
  },

  extraPaths() {
    return [];
  },

  scaffoldExtras() {
    // Nothing extra: AGENTS.md is shared-by-design, and skills/agents land in
    // .codex/ which the scaffold already creates.
  },
};
