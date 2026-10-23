// lib/targets/opencode.js
//
// OpenCode adapter (BOB-084). SHIPPED-CODE TIER: OpenCode is MIT/open source,
// so every convention here is cited to the shipped source at a pinned commit —
// immutable file+line permalink + quoted code fragment + fetch date, each
// fragment re-fetched at build time (2026-08-23, re-confirmed 2026-08-24).
// Base URL for every permalink below:
//   https://github.com/sst/opencode/blob/03bba464d46f3eddf74195919b1344aa937f7b11/
// (dev HEAD at fetch time — release drift is possible; every cited convention
// is also in the released docs quoted as corroboration, and BOB-085's
// real-binary work re-confirms against an installed version. Where docs and
// source disagree, the source wins and the claim is limited to what it shows.)
// Real-binary corroboration: the three scaffold-convention claims below
// (commands discovery, skills-by-frontmatter-name, `.opencode/bobby/agents`
// not swallowed by the agent registry) were confirmed by real
// `opencode debug config` / `debug skill` / `agent list` probes against
// opencode 1.18.21 (BOB-085 plan.md V9 ledger, 2026-08-23; re-run against
// this adapter's actual scaffold at build time, 2026-08-24).
//
//   rules    -> AGENTS.md (root; the same file cursor/codex/agents-md/copilot
//     write, so the backup/merge path is proven code). Cited:
//     - packages/opencode/src/session/instruction.ts#L64-L68:
//       `const instructionFiles = [ "AGENTS.md",
//       ...(!flags.disableClaudeCodePrompt ? ["CLAUDE.md"] : []),
//       "CONTEXT.md", // deprecated`
//     - packages/opencode/src/session/instruction.ts#L122: `// The first
//       project-level match wins so we don't stack AGENTS.md/CLAUDE.md from
//       every ancestor.` — AGENTS.md is first in the list, so it supersedes a
//       pre-existing project CLAUDE.md; writing AGENTS.md is sufficient.
//     - Docs corroboration: https://opencode.ai/docs/rules/ (fetched
//       2026-08-23): "You can provide custom instructions to opencode by
//       creating an `AGENTS.md` file."
//
//   Config discovery root -> a project-root `.opencode/` is a config
//     directory every scan below is anchored to. Cited:
//     - packages/opencode/src/config/paths.ts#L23-L41 (`directories`): walk-up
//       hits of `targets: [".opencode"]` from the working directory to the
//       worktree root, plus the global config dir.
//
//   commands -> .opencode/commands/<name>.md — slash-invocable, this adapter's
//     headline delta over the generic tier. The ticket title said `command`
//     (singular); the shipped glob accepts BOTH spellings and current docs say
//     plural, so Bobby scaffolds `commands/`. Cited:
//     - packages/opencode/src/config/command.ts#L15:
//       `Glob.scan("{command,commands}/**/*.md", { cwd: dir,` — scanned under
//       each config directory above.
//     - Frontmatter dialect — packages/core/src/v1/config/command.ts#L5-L12:
//       `Schema.Struct({ template: Schema.String, description:
//       Schema.optional(Schema.String), agent: ..., model: ..., variant: ...,
//       subtask: ... })`; `template` is synthesized from the markdown body
//       (config/command.ts#L29: `template: md.content.trim()`), so the
//       documented frontmatter keys are description/agent/model/variant/subtask.
//     - Decode failure THROWS — packages/opencode/src/config/command.ts#L36:
//       `throw new InvalidError({ path: item, message: ... })`. Bobby's
//       command templates carry `description` (all 23) and `argument-hint`
//       (19 of 23); `argument-hint` is NOT in the schema. Effect Schema's
//       default tolerates excess keys today, but with a throwing loader Bobby
//       does not bet every command load on a third-party default staying put:
//       transformCommand below REDUCES frontmatter to the documented dialect
//       (keep `description` verbatim, drop everything else). Any NEW template
//       frontmatter key must be checked against `ConfigCommandV1.Info` before
//       it ships to this target.
//     - Docs corroboration: https://opencode.ai/docs/commands/ (fetched
//       2026-08-23): "Per-project: `.opencode/commands/`"; invoked by typing
//       `/` followed by the command name.
//
//   skills   -> .opencode/skills/<name>/SKILL.md — native home. Cited:
//     - packages/opencode/src/skill/index.ts#L24:
//       `const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"` —
//       scanned under the config directories above.
//     - packages/opencode/src/skill/index.ts#L21-L23:
//       `CLAUDE_EXTERNAL_DIR = ".claude"`, `AGENTS_EXTERNAL_DIR = ".agents"`,
//       `EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"` — OpenCode also scans
//       `.claude/skills/` and `.agents/skills/`, which is why the generic tier
//       already served OpenCode skills; the native path keeps one coherent
//       `.opencode/` world.
//     - Loader tolerance — skill/index.ts#L106-L139: a parse failure is
//       logged and skipped (`Effect.logError("failed to load skill", ...)`),
//       the only frontmatter requirement is `name` being a string
//       (`isSkillFrontmatter`, #L53-L57), and the skill registers under its
//       FRONTMATTER name (`state.skills[md.data.name] = { name: md.data.name,
//       ...}`, #L134-L135) — the docs' folder-name-match rule is not enforced
//       in the load path, so `bobby-plan/SKILL.md` with `name: plan-ticket`
//       loads and lists as `plan-ticket`. Claim limited accordingly.
//     - Docs corroboration: https://opencode.ai/docs/skills/ (fetched
//       2026-08-23): lists `.opencode/skills/<name>/SKILL.md`,
//       `.claude/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md`
//       among the search paths.
//
//   agents   -> .opencode/bobby/agents/*.md — deliberately NOT
//     `.opencode/agent(s)/`. OpenCode HAS a real file-based agent registry:
//     - packages/opencode/src/config/agent.ts#L13:
//       `Glob.scan("{agent,agents}/**/*.md", ...)` under each config
//       directory, parsed by `ConfigParse.schema(ConfigAgentV1.Info, config,
//       item)` (#L29).
//     Dropping Bobby's 30 Claude-dialect agent files into it would register
//     30 unconfigured agents in the user's agent list (mode/model/permission
//     defaults unverified), with schema rejections surfacing through the
//     config loader — the native-root-pollution bug the codex header
//     documents, generalized by the epic's discovery-root rule ("never
//     scaffold non-conforming files into a harness's documented discovery
//     root"). Mapping Bobby agents onto real OpenCode agent definitions needs
//     a dialect transform verified against a live install — deferred,
//     demand-driven (BOB-085's install is the natural unlock). So agents are
//     prompt-referenced files (the cline/codex/copilot pattern) in
//     `.opencode/bobby/agents/`: at the pinned SHA no shipped glob matches
//     `bobby/**` under a config dir (the anchored patterns are
//     `{command,commands}/**/*.md`, `{agent,agents}/**/*.md`,
//     `{mode,modes}/*.md`, `{skill,skills}/**/SKILL.md`), confirmed on the
//     real binary: `opencode agent list` shows only built-ins with
//     `.opencode/bobby/agents/*.md` present. A future OpenCode version could
//     widen its scans — no canary covers scaffold-layout claims; the SHA +
//     date here is the honesty mechanism. And NOT `.agents/agents/` —
//     `.agents` is agents-md's DISTINCTIVE artifact; writing it from opencode
//     would fail the matrix leakage leg. supportsSubagents() is false: a
//     registry Bobby can land definitions in requires a verified dialect,
//     not just a directory.
//
//   Headless mode exists (prompt hint only): https://opencode.ai/docs/cli/
//     (fetched 2026-08-23): "Run opencode in non-interactive mode by passing
//     a prompt directly." (`opencode run`). All executor claims (flags, JSON
//     output, resume) belong to BOB-085 and are NOT made here.

import { stripFrontmatter } from './agents-md.js';

/**
 * Reduce a command's frontmatter to OpenCode's documented dialect: keep the
 * single-line `description:` byte-for-byte (quoted scalars stay valid YAML),
 * drop `argument-hint` and any other undocumented key — the loader's failure
 * mode is a thrown InvalidError (header citation), so only schema-named keys
 * ship. Multiline (`>`, `|`) or absent descriptions fall back to a full strip,
 * the same guard stripFrontmatter uses.
 */
function toOpenCodeCommandFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return content;
  const desc = m[1].match(/^description:[ \t]*(.+)$/m)?.[0];
  if (!desc || /^description:[ \t]*[>|]/.test(desc)) return stripFrontmatter(content);
  const body = content.slice(m[0].length).replace(/^\s*\n/, '');
  return `---\n${desc}\n---\n\n${body}`;
}

export default {
  name: 'opencode',

  displayName() {
    return 'OpenCode';
  },

  paths() {
    return {
      agents: '.opencode/bobby/agents',
      skills: '.opencode/skills',
      commands: '.opencode/commands',
      rules: 'AGENTS.md',
    };
  },

  supportsSubagents() {
    // `.opencode/agent(s)/` exists as a real registry, but Bobby's files do
    // not conform to its (unverified) dialect and are kept out of it — header.
    return false;
  },

  promptHint() {
    return 'Copy this prompt into OpenCode (or run headless: opencode run):';
  },

  keepsCommandFrontmatter() {
    // Truthful: OpenCode genuinely parses command frontmatter (`description`
    // feeds the `/` menu) and every scaffolded file keeps a frontmatter block —
    // reduced to the documented dialect by transformCommand below.
    return true;
  },

  transformCommand(content) {
    return toOpenCodeCommandFrontmatter(content);
  },

  // No commandFileName(): OpenCode commands are plain `<name>.md` (header
  // citation), so init.js's `${base}.md` default is correct.

  extraPaths() {
    return [];
  },

  scaffoldExtras() {
    // Nothing extra: AGENTS.md is shared-by-design, and commands/skills/agents
    // land under .opencode/ which the scaffold already creates.
  },
};
