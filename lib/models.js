// lib/models.js
//
// WHICH MODEL EACH AGENT RUNS ON.
//
// Bobby's stages are not the same kind of work. Planning an epic, drawing the
// v1 line, and hunting a regression in a diff are judgment; writing the code
// the plan already specified is execution; recording a page's load time is
// bookkeeping. Running all of them on one model means paying frontier prices
// for the bookkeeping or shipping frontier decisions from a small model.
//
// So each agent carries a TIER in the registry (`tier: 'opus' | 'sonnet' |
// 'haiku'`), and this module turns a tier plus the project's config into the
// concrete `--model` value an executor gets, or the `model:` line a scaffolded
// subagent file carries.
//
// TIERS ARE NOT MODEL NAMES. `opus` / `sonnet` / `haiku` are aliases the claude
// CLI and Claude Code subagent frontmatter both accept, which is what lets the
// shipped defaults mean something without pinning a version that ages out.
// cursor-agent, codex and opencode take full model names (`cursor-agent
// --list-models`, `provider/model` for opencode), so a tier is meaningless to
// them and the shipped defaults DO NOT APPLY — those projects get no model
// flag until they name one in `models:`, exactly as before this file existed.

import { AGENT_REGISTRY } from './agent-registry.js';

/** The tiers a registry entry may declare. */
export const MODEL_TIERS = ['opus', 'sonnet', 'haiku'];

/**
 * The value that means "pass no model at all — let the harness decide".
 * Claude Code's subagent frontmatter spells it this way, so it is the spelling
 * Bobby accepts, and it is how a user opts one stage back out of a `models:`
 * default without deleting the block.
 */
export const INHERIT = 'inherit';

/**
 * Agent file name → registry key.
 *
 * Two ways in, because neither alone covers the set: entries carry an explicit
 * `agentName` (`intake` → `bobby-ticket-intake`, where the key and the file
 * name genuinely differ), and every key is also reachable as `bobby-<key>`
 * (which is how `ship` — a `custom: true` entry with no `agentName` — is found,
 * since `bobby-ship.md` is still scaffolded).
 */
const FILE_TO_KEY = (() => {
  const map = new Map();
  for (const key of Object.keys(AGENT_REGISTRY)) {
    map.set(`bobby-${key}`, key);
  }
  for (const [key, entry] of Object.entries(AGENT_REGISTRY)) {
    if (entry.agentName) map.set(entry.agentName, key);
  }
  return map;
})();

/** The registry key a scaffolded agent file belongs to, or null. */
export function agentKeyForFile(fileName) {
  return FILE_TO_KEY.get(fileName) || null;
}

/**
 * The model an agent should run on, or null for "say nothing".
 *
 * Precedence, most specific first:
 *   1. `models.<agent>`      — this stage, named by the user
 *   2. `models.default`      — every stage, named by the user
 *   3. `dashboard.model`     — the older single global. Kept ABOVE the shipped
 *                              tiers on purpose: a project that already says
 *                              "everything runs on X" keeps meaning that, and
 *                              never silently acquires per-stage defaults it
 *                              did not ask for.
 *   4. the registry tier     — Bobby's opinion, and only where a tier alias is
 *                              a real model name (see the header).
 *
 * `inherit` at any level resolves to null, which is how a user turns one stage
 * back off under a `models.default` they otherwise want.
 *
 * A `null` in the config is treated as unset, not as a value — that is what it
 * means in a YAML file whose commented template ships the key with `null` next
 * to it, and it matches how `resolvePermissionMode` reads the same shape.
 */
export function resolveModel(agentKey, config = {}, { acceptsTiers = true } = {}) {
  const models = config.models || {};
  const named = models[agentKey] || models.default || config.dashboard?.model;
  if (named) return named === INHERIT ? null : named;

  if (!acceptsTiers) return null;
  // No entry (a custom agent, or an orchestration key with nothing to say) is
  // deliberately silent rather than defaulted: Bobby has no opinion about an
  // agent it did not ship.
  const tier = AGENT_REGISTRY[agentKey]?.tier;
  return tier || null;
}

/** Same resolution, addressed by scaffolded file name instead of registry key. */
export function resolveModelForFile(fileName, config = {}, opts = {}) {
  const key = agentKeyForFile(fileName);
  if (!key) return null;
  return resolveModel(key, config, opts);
}

/**
 * Every agent's resolved model, for display (`bobby run` header, docs, tests).
 * Registry order, so it reads like the registry it came from.
 */
export function resolvedModelTable(config = {}, opts = {}) {
  return Object.keys(AGENT_REGISTRY).map(key => ({
    agent: key,
    tier: AGENT_REGISTRY[key].tier || null,
    model: resolveModel(key, config, opts),
  }));
}

/**
 * Put a `model:` line into a scaffolded agent file's frontmatter.
 *
 * Done as a post-process on the rendered markdown rather than as an EJS branch
 * in each of the thirty agent templates: the line is identical everywhere, and
 * thirty copies of it is thirty chances for one to be forgotten when an agent
 * is added.
 *
 * Only a LEADING frontmatter block is touched, and only when it does not
 * already declare a model — a template that decides to pin its own keeps it.
 * No model, no frontmatter, or a target that has no place to put it (see
 * `supportsAgentModel` on the target adapters) all return the content
 * untouched.
 */
export function withAgentModel(content, model) {
  if (!model) return content;
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return content;
  if (/^model:/m.test(match[1])) return content;
  return content.replace(match[0], `---\n${match[1]}\nmodel: ${model}\n---\n`);
}
