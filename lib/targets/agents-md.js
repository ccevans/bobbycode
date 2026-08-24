// lib/targets/agents-md.js
//
// The generic AGENTS.md target (BOB-081) — Bobby's honest answer to "does
// Bobby support X?" for the 20+ tools that read the Linux Foundation AGENTS.md
// convention without a dedicated adapter (Windsurf/Devin Desktop, Zed,
// Antigravity CLI (ex Gemini CLI), Jules, Amp, ...).
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
//
// Windsurf → Devin Desktop (BOB-086 spike, wontfix — this tier is sufficient).
// Cognition renamed Windsurf to Devin Desktop in June 2026;
// docs.windsurf.com/windsurf/* 308-redirects (Permanent Redirect) to
// docs.devin.ai/desktop/* — curl HEAD and GET on all four cited paths,
// observed 2026-08-24. Its docs first-party-document
// BOTH halves of this tier, so no dedicated adapter ships — building one would
// target ".windsurf/", the deprecated fallback namespace of a renamed product.
// Citations (all fetched 2026-08-23, re-verified verbatim 2026-08-24):
//   rules  -> https://docs.devin.ai/desktop/cascade/agents-md — "Devin Desktop
//     automatically discovers it and feeds it into the same Rules engine";
//     root-level file: "Treated as an always-on rule — the full content is
//     included in Cascade's system prompt on every message."
//   skills -> https://docs.devin.ai/desktop/cascade/skills — "For cross-agent
//     compatibility, Devin Desktop also discovers skills in `.agents/skills/`
//     and `~/.agents/skills/`." (".claude/skills/" is scanned too, but only
//     "If you have enabled Claude Code config reading" — the unconditional
//     root is the one this target writes.)
//   claims limit -> https://docs.devin.ai/desktop/cascade/memories — native
//     rules ("The .devin/ directory is the preferred location and takes
//     precedence, with .windsurf/ kept as a fallback") cap hard: "Workspace
//     rule files are limited to 12,000 characters each." Bobby's rendered
//     rules document runs ~15.5 KB. The AGENTS.md page documents NO character
//     limit, and truncation behavior for an oversized root AGENTS.md is
//     undocumented — unverifiable without an install — so the claim for this
//     harness stays exactly "rules + skills work", nothing more.
//   not scaffolded -> https://docs.devin.ai/desktop/cascade/workflows —
//     ".windsurf/workflows/" slash commands are "manual-only — Cascade will
//     never invoke a workflow automatically. If you want Cascade to pick up a
//     procedure on its own, use a Skill instead." — and the skills above are
//     already auto-invoked, so a workflows surface would only add a second
//     syntax for an already-reachable surface.
//
// Zed (BOB-087 spike, wontfix — this tier is sufficient, on SHIPPED-CODE
// evidence). Zed is open source; every claim below is pinned to the released
// tag v1.16.1 (SHA eb8e1c8b5502b7007465fbbc465f4a736fa39210, published
// 2026-08-19), fetched 2026-08-23 and re-verified verbatim from
// raw.githubusercontent.com at the same SHA on 2026-08-24. Both halves of
// this tier are named in Zed's own shipped source, so no dedicated adapter
// ships — a ".rules" adapter would be a same-list filename swap with
// identical behavior in Zed that loses the AGENTS.md ecosystem.
//   rules  -> https://github.com/zed-industries/zed/blob/eb8e1c8b5502b7007465fbbc465f4a736fa39210/crates/prompt_store/src/prompts.rs#L22-L32
//     pub const RULES_FILE_NAMES: &[&str] = &[
//         ".rules", ".cursorrules", ".windsurfrules", ".clinerules",
//         ".github/copilot-instructions.md",
//         "AGENT.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md",
//     ];
//     Selection is first-match-only, ONE file per worktree —
//     https://github.com/zed-industries/zed/blob/eb8e1c8b5502b7007465fbbc465f4a736fa39210/crates/agent/src/agent.rs#L1261-L1269
//     "let selected_rules_file = RULES_FILE_REL_PATHS.iter()
//      .filter_map(…).next();" — the root scan stops at the first existing
//     file and every later name is ignored. Docs corroboration (same SHA,
//     docs/src/ai/instructions.md): "Zed supports AGENTS.md as the primary
//     instruction file"; "Zed uses the first matching file in this list".
//   skills -> https://github.com/zed-industries/zed/blob/eb8e1c8b5502b7007465fbbc465f4a736fa39210/crates/agent_skills/agent_skills.rs#L763-L765
//     pub fn project_skills_relative_path() -> &'static str {
//         ".agents/skills"
//     }
//     — byte-identical to this target's skills root (AGENTS_DIR_NAME
//     ".agents", #L14). Folder + SKILL.md with YAML frontmatter name +
//     description — Bobby's exact format — invoked autonomously, by /slash,
//     or by @-mention (docs/src/ai/skills.md, same SHA; Rules Library was
//     replaced by Skills in Zed v1.4.0 per docs/src/ai/rules.md).
//   claims limit (shadowing) -> Zed loads ONE rules file: a user repo that
//     already contains an earlier-precedence file (.rules, .cursorrules,
//     .windsurfrules, .clinerules, .github/copilot-instructions.md, AGENT.md
//     — the six names ahead of AGENTS.md in the list; CLAUDE.md and GEMINI.md
//     follow it) silently shadows this target's AGENTS.md. No Bobby target
//     scaffolds any of those six names as a FILE (grep over lib/, commands/,
//     templates/, re-verified 2026-08-24: lib/detect.js hits are
//     detection-only, lib/targets/copilot.js hits are never-write comments,
//     and the cline target's `.clinerules` hits — lib/targets/cline.js:14-17,
//     commands/init.js:542, commands/retro.js:103 — scaffold `.clinerules`
//     as a repo-root DIRECTORY, e.g. .clinerules/rules.md). The
//     file-vs-directory distinction is load-bearing and Zed's own source
//     settles it: the selection takes only regular files —
//     ".filter(|entry| entry.is_file())", agent.rs #L1266 at the pinned SHA —
//     and the #L1271-L1272 comment says "Cline supports `.clinerules` being a
//     directory, but that is not currently supported" (re-verified
//     2026-08-24). So AGENTS.md is the first match in a fresh agents-md
//     scaffold, and even beside a leftover cline `.clinerules/` directory
//     (an `init --refresh` target switch leaves the old target's files in
//     place) — though "not currently supported" marks the directory-skip as
//     open to change in future Zed releases.
//   claims limit (caps) -> SKILL.md hard cap 100 KB (agent_skills.rs #L47,
//     parse fails above); description soft cap 1,024 bytes (#L426 — over
//     produces a DescriptionTooLong warning, the skill still loads); name
//     <= 64 chars (#L417); 50 KB total description catalog (#L50). Bobby
//     fits: the largest scaffolded skill description is bobby-define at 943
//     bytes (measured 2026-08-24), SKILL.md files are far below 100 KB.
//   no executor -> the `zed` CLI is an editor launcher (crates/cli/src/main.rs
//     Args, same SHA) with no headless prompt-in/result-out mode — no
//     dashboard derivation, no canary, ever.
//
// Antigravity CLI, ex Gemini CLI (BOB-088 spike, wontfix — this tier is
// sufficient). The rename SETTLED: Google sunset the consumer Gemini CLI on
// 2026-06-18 and its successor Antigravity CLI (`agy`, GA 2026-05-19) is the
// current product, docs at antigravity.google/docs/cli/*. It is CLOSED
// SOURCE — the official repo github.com/google-antigravity/antigravity-cli
// is an issues/docs shell (README + CHANGELOG, no source; release line at
// v1.1.19, checked 2026-08-24) and the only installer is
// `curl -fsSL https://antigravity.google/cli/install.sh | bash` (no npm, no
// brew) — so no shipped-code tier is possible and every claim below is
// convention tier (official-docs URL + verbatim quote + fetch date),
// claims-limited to match. Never cite the retired gemini-cli conventions
// (GEMINI.md-first rules, `.gemini/commands/*.toml`) — they died with the
// old tool; `agy` has no user commands directory at all, skills ARE its
// slash-command surface.
// Citations (fetched 2026-08-23, re-verified verbatim 2026-08-24):
//   rules  -> https://antigravity.google/docs/cli/best-practices/ — "Create
//     a `GEMINI.md` or `AGENTS.md` file at your workspace root to outline
//     specific directory standards, styling paradigms, test command
//     parameters, and deprecation warnings. The agent automatically parses
//     these rules on startup and consults them before suggesting changes."
//     Root AGENTS.md is a shipped default of the CLI, not a settings opt-in.
//   skills -> https://antigravity.google/docs/cli/plugins/ — "Create a
//     directory named `.agents/skills/` at your project root."; frontmatter
//     is `name` + `description` (the page's example — Bobby's exact SKILL.md
//     keys), and "Once registered, Skills convert automatically into slash
//     commands inside the TUI" (so /bobby-plan etc. work natively).
//     Corroborated by https://antigravity.google/docs/skills — workspace
//     skill path `<workspace-root>/.agents/skills/<skill-folder>/`;
//     "Antigravity now defaults to .agents/skills, but still maintains
//     backward support for .agent/skills."
//   claims limit -> https://antigravity.google/docs/rules-workflows/ —
//     native workspace rules ("Workspace rules live in the .agents/rules
//     folder of your workspace or git root.") cap hard: "Rules files are
//     limited to 12,000 characters each." Whether that cap applies to a
//     root AGENTS.md read by the CLI is undocumented, and Bobby's rendered
//     rules document runs ~15.5 KB — unverifiable without an install, so no
//     truncation promise either way: the claim stays exactly "rules +
//     skills work", nothing more. Precedence between a repo's pre-existing
//     GEMINI.md and this target's AGENTS.md ("GEMINI.md or AGENTS.md") is
//     likewise undocumented — no promise made (Zed-shadowing precedent).
//   no executor (yet) -> https://antigravity.google/docs/cli/headless/
//     documents a real headless mode: "Pass a prompt with -p (or its
//     aliases --print and --prompt) to run once and exit";
//     `--output-format text|json|stream-json`. But the surface is young
//     (`--output-format` landed in v1.1.8 of an actively churning 1.1.x
//     line, per the repo CHANGELOG) and unverifiable without a binary —
//     docs-only executor argv claims are the epic's named failure class —
//     so NO executor claim is made. The deferred executor's concrete
//     re-open condition is recorded in the epic feature-plan (BOB-077) and
//     BOB-088/plan.md.

/**
 * Strip a leading YAML frontmatter block; keep the description as a lead line.
 * Shared with the codex adapter — one rule, one implementation. Quoted scalars
 * lose their quotes (review F10: every scaffolded command opened *"…"* —
 * literal quotes inside emphasis).
 */
export function stripFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return content;
  let desc = m[1].match(/^description:[ \t]*(.+)$/m)?.[1]?.trim();
  if (desc) desc = desc.replace(/^(["'])(.*)\1$/, '$2');
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

  keepsCommandFrontmatter() {
    return false;
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
