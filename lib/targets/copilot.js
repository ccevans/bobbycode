// lib/targets/copilot.js
//
// GitHub Copilot adapter (BOB-083). CONVENTION TIER: no Copilot binary or
// VS Code + Copilot install existed on the build machine, so every convention
// here is cited to an official GitHub / VS Code doc — URL + verbatim quoted
// sentence + fetch date, each quote re-fetched at build time (2026-08-23).
// Claims are limited to what those docs state: nothing that would require a
// live install (prompt invocation actually working, the custom-agent dialect,
// executor behavior) is claimed, and there is no dashboard executor — the
// dashboard falls back to `claude` like any target without an EXECUTORS entry.
//
//   rules    -> AGENTS.md (root; the same file cursor/codex/agents-md write,
//     so the backup/merge path is proven code). Cited:
//     - https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
//       (fetched 2026-08-23): "You can create one or more `AGENTS.md` files,
//       stored anywhere within the repository." and "When Copilot is working,
//       the nearest `AGENTS.md` file in the directory tree will take
//       precedence."
//     - https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/
//       (fetched 2026-08-23): title "Copilot coding agent now supports
//       AGENTS.md custom instructions".
//     - https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions
//       (fetched 2026-08-23): Copilot CLI reads `AGENTS.md` / `CLAUDE.md` /
//       `GEMINI.md` agent instructions alongside
//       `.github/copilot-instructions.md`.
//
//   .github/copilot-instructions.md is NEVER scaffolded — AGENTS.md is the
//     only instructions file Bobby writes for this target. The CLI docs (URL
//     above, fetched 2026-08-23) say instruction files are COMBINED, not
//     ranked: "When multiple applicable user-level and repository instruction
//     files exist, Copilot CLI combines their instructions" and the dedup
//     paragraph "does not define a general precedence order between these
//     files." Writing the same rules into two combined files is a drift bug
//     (edit one, forget the other) — the CLAUDE.md bug in a new costume. A
//     pre-existing copilot-instructions.md is detected (lib/detect.js) and
//     left byte-for-byte untouched: it is the user's file.
//
//   commands -> .github/prompts/<name>.prompt.md — Copilot's reusable-prompt
//     convention, this adapter's whole delta over the generic tier. Cited:
//     - https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files/your-first-prompt-file
//       (fetched 2026-08-23): "Save the prompt file above as
//       `explain-code.prompt.md` in your `.github/prompts` folder." Invocation:
//       "In Visual Studio Code, display the Copilot Chat view and enter
//       `/explain-code`." Scope limit: "Prompt files are only available in
//       VS Code, Visual Studio, and JetBrains IDEs." — prompt files are
//       IDE-only; CLI/coding-agent users drive the same flows through skills
//       (every command body is a one-line pointer at its skill).
//     - https://code.visualstudio.com/docs/copilot/customization/prompt-files
//       (fetched 2026-08-23): default workspace location is `.github/prompts`;
//       documented header fields include `description` ("A short description
//       of the prompt.") and `argument-hint` ("Hint text shown in the chat
//       input field to guide users on how to interact with the prompt."),
//       plus `name`/`agent`/`model`/`tools`.
//     Frontmatter is KEPT: Bobby's 23 command templates carry exactly two
//     frontmatter keys — `description` (23) and `argument-hint` (19), both in
//     the documented dialect above — so transformCommand is the identity.
//     Any NEW frontmatter key added to templates/commands/*.md.ejs must be
//     checked against the documented prompt-file dialect before it ships to
//     this target (how Copilot treats unknown keys is unverifiable without an
//     install, so we never rely on it).
//
//   skills   -> .github/skills/<name>/SKILL.md — native, broadest surface.
//     Cited: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
//     (fetched 2026-08-23): "Project skills, stored in your repository
//     (.github/skills, .claude/skills, or .agents/skills)" and "Agent skills
//     work with Copilot cloud agent, Copilot code review, the GitHub Copilot
//     CLI, the GitHub Copilot app, and agent mode in Visual Studio Code and
//     JetBrains IDEs." The page points at the open Agent Skills specification
//     (agentskills.io), whose SKILL.md name/description frontmatter Bobby's
//     skills already carry.
//
//   agents   -> .github/bobby/agents/*.md — deliberately NOT .github/agents/.
//     Copilot has a documented custom-agent registry at `.github/agents/`:
//     - https://docs.github.com/en/copilot/tutorials/customization-library/custom-agents/your-first-custom-agent
//       (fetched 2026-08-23): "An agent profile template called
//       `my-agent.agent.md` will open in the `.github/agents` directory, in
//       the repository you chose."
//     - https://docs.github.com/en/copilot/reference/custom-agents-configuration
//       (fetched 2026-08-23): "The configuration file's name (minus `.md` or
//       `.agent.md`) is used for deduplication between levels so that the
//       lowest level configuration takes precedence." — i.e. plain `.md`
//       names there can be read as agent profiles, so dropping 30 Bobby agent
//       files with Claude-dialect frontmatter into that root would populate
//       the user's agent picker with unverified profiles (the
//       native-root-pollution bug the codex header documents for
//       .codex/skills). Mapping Bobby agents onto real `.agent.md` profiles
//       needs a live install to verify the dialect — deferred, demand-driven.
//     So agents are prompt-referenced files (the cline/codex pattern) in
//     `.github/bobby/agents/`, a path no Copilot doc names as a discovery
//     root, and supportsSubagents() is false: "a file-based registry Bobby
//     can land definitions in" requires a verified dialect, not just a
//     directory.
//
//   DISTINCTIVE-map note: this target's matrix leakage artifact is `.github`.
//     No other target or template writes anything under .github in the
//     matrix's temp-dir world today; if a future target ever scaffolds CI
//     files there, narrow the map entry to
//     ['.github/prompts', '.github/skills', '.github/bobby'].

export default {
  name: 'copilot',

  displayName() {
    return 'GitHub Copilot';
  },

  paths() {
    return {
      agents: '.github/bobby/agents',
      skills: '.github/skills',
      commands: '.github/prompts',
      rules: 'AGENTS.md',
    };
  },

  supportsSubagents() {
    // `.github/agents/` exists as a registry, but Bobby's files do not conform
    // to its (unverified) dialect and are kept out of it — see the header.
    return false;
  },

  promptHint() {
    return 'Copy this prompt into Copilot Chat (VS Code) or the GitHub Copilot CLI:';
  },

  keepsCommandFrontmatter() {
    return true;
  },

  transformCommand(content) {
    // Identity: both shipped frontmatter keys (description, argument-hint) are
    // in the documented prompt-file dialect — see the header before adding any
    // new key to the command templates.
    return content;
  },

  commandFileName(base) {
    // Prompt files must carry the .prompt.md extension to be discovered
    // (your-first-prompt-file tutorial, header citation).
    return `${base}.prompt.md`;
  },

  extraPaths() {
    return [];
  },

  scaffoldExtras() {
    // Nothing extra: AGENTS.md is shared-by-design, and prompts/skills/agents
    // land under .github/ which the scaffold already creates.
  },
};
