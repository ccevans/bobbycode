// lib/targets/agents-md.js
//
// The generic AGENTS.md target (BOB-081) — Bobby's honest answer to "does
// Bobby support X?" for the 20+ tools that read the Linux Foundation AGENTS.md
// convention without a dedicated adapter (Windsurf/Devin Desktop, Zed, Jules,
// Amp, ...).
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
