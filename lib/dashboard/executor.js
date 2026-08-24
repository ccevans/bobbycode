// lib/dashboard/executor.js
//
// Spawns an agent CLI as a child process for a workspace. Streams stdout
// (parsed as JSON lines when --output-format=stream-json is available, or
// raw text otherwise) and forwards events to a callback. Handles graceful
// stop (SIGTERM → SIGKILL after timeout).
//
// Two CLIs are supported. Both take a prompt via -p and both can emit JSONL
// via --output-format stream-json, so only argv construction differs — the
// event shapes are passed through untouched and nothing downstream inspects
// them (the orchestrator reads ticket stage from disk, not from the stream).
//
// Testable: pass a `spawn` override through opts for unit tests.

import { spawn as defaultSpawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const GRACEFUL_TIMEOUT_MS = 5000;

/**
 * The environment to hand a spawned executor, with Claude Code's own session
 * identity stripped out (PRO-025).
 *
 * When `bobby remote` / `bobby app` / `bobby run` is launched from a shell that
 * is itself inside a Claude Code session, that shell carries `CLAUDECODE=1` and
 * the `CLAUDE_CODE_*` family. The executor spawns the agent as a headless
 * `claude -p` child, which inherits that env and trips Claude Code's own
 * nested-session guard ("cannot be launched inside another Claude Code
 * session"), so every agent run fails.
 *
 * The spawned executor is an independent headless run — inheriting the parent
 * session's Claude Code identity is never correct. Stripping it here, at the one
 * shared spawn point, covers every entry (remote, app, run). The strip is
 * harmless for the cursor-agent path, which does not read these vars.
 *
 * Nothing else is touched: only keys matching /^CLAUDE_CODE/ and exactly
 * 'CLAUDECODE' are removed; PATH, HOME, and everything else pass through.
 */
export function cleanExecutorEnv(env = process.env) {
  const cleaned = { ...env };
  for (const key of Object.keys(cleaned)) {
    if (key === 'CLAUDECODE' || /^CLAUDE_CODE/.test(key)) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

/**
 * Whether an executor binary is runnable — an explicit path must be an absolute
 * path to an executable file, a bare name must resolve on PATH. Used as a
 * dashboard preflight so a missing CLI is reported once at startup instead of
 * as a spawn error per agent.
 *
 * Relative paths are rejected on purpose: the check would resolve them against
 * the repo root while agents are spawned with cwd set to their own worktree, so
 * a relative path that passes here would still ENOENT on every run.
 */
export function commandExists(bin) {
  if (!bin) return false;
  // Both separators, not path.sep — a forward-slash path is still a path on Windows.
  if (/[/\\]/.test(bin)) {
    if (!path.isAbsolute(bin)) return false;
    try {
      // existsSync alone is true for directories and non-executable files.
      if (!fs.statSync(bin).isFile()) return false;
      fs.accessSync(bin, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * argv builders per CLI flavor. Each receives the resolved run options and
 * returns the full argument list after the binary name.
 */
const EXECUTORS = {
  claude: {
    bin: 'claude',
    buildArgs({ prompt, outputFormat, allowedTools, permissionMode, model, resume }) {
      const args = ['-p', prompt];
      // Continue a prior Claude conversation (TKT-021). `resume` is the CLAUDE
      // session id captured off an earlier run's stream, not bobby's ses- id.
      if (resume) args.push('--resume', resume);
      if (outputFormat) {
        args.push('--output-format', outputFormat);
        // stream-json requires verbose
        if (outputFormat === 'stream-json') args.push('--verbose');
      }
      if (allowedTools) args.push('--allowed-tools', allowedTools);
      if (permissionMode) args.push('--permission-mode', permissionMode);
      if (model) args.push('--model', model);
      return args;
    },
  },

  'cursor-agent': {
    bin: 'cursor-agent',
    buildArgs({ prompt, outputFormat, permissionMode, model }) {
      const args = ['-p', prompt];
      // No --verbose: cursor-agent streams JSONL from --output-format alone.
      if (outputFormat) args.push('--output-format', outputFormat);
      if (model) args.push('--model', model);
      // Bobby always runs headless in a fresh worktree, which cursor-agent
      // would otherwise prompt about before doing any work.
      args.push('--trust');
      // cursor-agent has no per-tool allowlist; it's all-or-nothing via
      // --force, so allowedTools has no equivalent and is dropped.
      if (permissionMode === 'bypassPermissions' || permissionMode === 'acceptEdits') {
        args.push('--force');
      } else if (permissionMode === 'plan') {
        args.push('--mode', 'plan');
      }
      return args;
    },
  },

  // Codex CLI (BOB-080). Flags verified against the real binary, codex-cli
  // 0.146.0 (`codex exec --help`, run 2026-08-22) — the sonnet-4-thinking
  // lesson: never from remembered help text.
  codex: {
    bin: 'codex',
    buildArgs({ prompt, outputFormat, permissionMode, model, resume }) {
      // exec is the headless subcommand; resume is ITS subcommand, before the
      // prompt: `codex exec resume <id> [prompt]`.
      const args = ['exec'];
      if (resume) args.push('resume', resume);
      // --json is the only structured output; outputFormat's specific value is
      // claude vocabulary, so any request for structured output maps to it.
      if (outputFormat) args.push('--json');
      if (model) args.push('--model', model);
      // Bobby's permission modes → codex sandbox policy (-s, possible values
      // verified: read-only | workspace-write | danger-full-access):
      //   bypassPermissions → danger-full-access. Bobby's bypass means "the
      //     worktree is the sandbox; do not stop" — and the agent runs
      //     `bobby ticket move`, which writes the STUDIO board OUTSIDE the
      //     worktree cwd, so workspace-write would block the workflow's own
      //     bookkeeping. Approvals are moot in exec (non-interactive), but the
      //     bypass flag is what disables the FS sandbox: verified name
      //     --dangerously-bypass-approvals-and-sandbox.
      //   acceptEdits → workspace-write: writes in the workspace, nothing past it.
      //   plan → read-only.
      // No per-tool allowlist exists (like cursor-agent), so allowedTools drops.
      // A subcommand's flag set is not its parent's (review F7): `exec resume`
      // accepts --json, -m and the bypass flag but has NO -s/--sandbox — the
      // first cut emitted `exec resume <id> --sandbox …` and the real parser
      // refused it, on exactly the path the chat's discussion turns take
      // (resume + 'plan'). Verified against codex-cli 0.146.0 as a
      // CROSS-PRODUCT this time, not each flag once. On resume, non-bypass
      // modes omit the sandbox flag: the resumed session keeps its posture.
      if (permissionMode === 'bypassPermissions') {
        args.push('--dangerously-bypass-approvals-and-sandbox');
      } else if (!resume && permissionMode === 'acceptEdits') {
        args.push('--sandbox', 'workspace-write');
      } else if (!resume && permissionMode === 'plan') {
        args.push('--sandbox', 'read-only');
      }
      args.push(prompt);
      return args;
    },
  },
};

export const EXECUTOR_NAMES = Object.keys(EXECUTORS);

/**
 * Pick the CLI flavor for a project. An explicit `dashboard.executor` wins;
 * otherwise it follows `target` so a Cursor project drives cursor-agent
 * without extra configuration.
 *
 * An unrecognized value is treated as a custom binary path using claude-style
 * flags, which is what `dashboard.executor: /path/to/claude` already meant.
 */
export function resolveExecutor(config = {}) {
  const explicit = config.dashboard?.executor;
  if (explicit) {
    return EXECUTORS[explicit]
      ? { name: explicit, ...EXECUTORS[explicit] }
      : { name: explicit, bin: explicit, buildArgs: EXECUTORS.claude.buildArgs };
  }
  const name = config.target === 'cursor' ? 'cursor-agent'
    : config.target === 'codex' ? 'codex'
    : 'claude';
  return { name, ...EXECUTORS[name] };
}

/**
 * Permission posture defaults, per kind of run. Mirrored by
 * `dashboard.worktree_permission_mode` / `dashboard.repo_permission_mode` in
 * lib/config.js DEFAULTS, which is where the reasoning is written down; these
 * constants cover configs that predate the keys, exactly as
 * DEFAULT_MAX_CONCURRENT does for the concurrency cap.
 */
export const DEFAULT_WORKTREE_PERMISSION_MODE = 'bypassPermissions';
export const DEFAULT_REPO_PERMISSION_MODE = 'acceptEdits';

/**
 * The permission mode a run of this kind should be launched with.
 *
 * Precedence: the per-kind key, then the older single `permission_mode` (which
 * applied to everything and still does when set), then the per-kind default.
 * An explicit value always wins — including `'default'`, which is a real CLI
 * posture meaning "ask", and is the way to opt back into asking.
 *
 * `null` is treated as unset rather than as a value, because that is what it
 * means in a YAML file: the key was left at its placeholder. The alternative is
 * a config that reads as deliberate and behaves as broken.
 */
export function resolvePermissionMode(config = {}, kind = 'worktree') {
  const dashboard = config.dashboard || {};
  const perKind = kind === 'repo'
    ? dashboard.repo_permission_mode
    : dashboard.worktree_permission_mode;
  if (perKind) return perKind;
  if (dashboard.permission_mode) return dashboard.permission_mode;
  return kind === 'repo' ? DEFAULT_REPO_PERMISSION_MODE : DEFAULT_WORKTREE_PERMISSION_MODE;
}

/**
 * The refusals a headless agent gets when its permission posture is too strict
 * for the work it was asked to do. Taken verbatim from the shapes in the real
 * sessions on TKT-062, not invented:
 *
 *   "Claude requested permissions to write to <path>, but you haven't granted
 *    it yet."                                        (default posture, Write)
 *   "This command requires approval"                 (acceptEdits, Bash)
 *   "This Bash command contains multiple operations. The following part
 *    requires approval: bobby ticket move …"         (acceptEdits, Bash)
 *
 * Deliberately narrow. Blocks that a permission mode cannot lift — output
 * redirection, for one — are left out: telling someone to raise a config key
 * that will not help is worse than saying nothing.
 */
const PERMISSION_DENIAL_PATTERNS = [
  /requested permissions? to/i,
  /requires approval/i,
];

/**
 * Is this event a tool call the CLI refused for permission reasons?
 *
 * Reads the CLI's own `tool_result` for the refusal rather than guessing from
 * the agent's prose, which is the only part of the stream that means the same
 * thing every time. Shaped for the claude CLI; another CLI that words its
 * refusals differently simply never matches, and the run falls back to the
 * end-of-run no-op check.
 */
export function isPermissionDenial(event) {
  if (!event || event.type !== 'stdout' || event.kind !== 'json') return false;
  const content = event.data?.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!part || part.type !== 'tool_result' || part.is_error !== true) return false;
    const text = typeof part.content === 'string'
      ? part.content
      : JSON.stringify(part.content ?? '');
    return PERMISSION_DENIAL_PATTERNS.some(re => re.test(text));
  });
}

/**
 * The CLI's own conversation id a stream event carries, or null
 * (TKT-021, BOB-133).
 *
 * Resuming needs the CLI's OWN id — the one it prints on its structured stream
 * events, not the `ses-YYYYMMDD-…` id bobby generates for its session log. The
 * chat manager reads this off the first turn's events and stores it so
 * subsequent turns can resume the same conversation.
 *
 * Two verified shapes, read in order (first non-empty string wins):
 *   - claude: every event carries top-level `session_id` (TKT-021).
 *   - codex: the first event announces the thread —
 *       {"type":"thread.started","thread_id":"01a0316a-5d66-7a80-900b-f0af9fe878d8"}
 *     top-level `thread_id` on `thread.started` only; later events carry no id.
 *     Captured from real codex-cli 0.146.0 runs, 2026-08-23 (BOB-133 plan
 *     ledger V1) and BOB-080 test-evidence/real-run-readonly.jsonl. `exec
 *     resume <id>` re-announces `thread.started` with the SAME id (V2), so
 *     re-capture on resumed turns never overwrites with a different one.
 *
 * Reading both fields off one seam cannot cross-contaminate: only one CLI's
 * stream is read per turn, and claude never emits a top-level `thread_id`.
 * A CLI that emits neither (or a stream read mid-run) simply yields null and
 * the conversation runs without resume (degraded but functional). Any future
 * executor's id field must be verified from a REAL captured event before being
 * added here (feature-plan rule) — never from remembered or invented shapes.
 */
export function sessionIdFromEvent(event) {
  if (!event || event.type !== 'stdout' || event.kind !== 'json') return null;
  for (const field of ['session_id', 'thread_id']) {
    const sid = event.data?.[field];
    if (typeof sid === 'string' && sid) return sid;
  }
  return null;
}

/**
 * Normalize agent CLI output into structured events. Both CLIs support
 * --output-format=stream-json which emits JSONL. If a line parses as JSON,
 * we forward it as a structured event; otherwise we emit it as a raw text line.
 */
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    return { kind: 'json', data: obj };
  } catch {
    return { kind: 'text', data: trimmed };
  }
}

/**
 * The cost a CLI reported on one of its events, or null (TKT-019).
 *
 * `total_cost_usd` is what the claude CLI puts on its final `result` event. We
 * match on the FIELD rather than on `type === 'result'` so a CLI that names its
 * final event something else still has its cost read; a CLI that never reports
 * one (cursor-agent today) yields null and stays null all the way to the UI.
 *
 * Strictly a finite number: a 0 here is a real "this run was free" and is kept,
 * while a string or a NaN is junk and must not be passed off as a figure.
 */
function readCostUsd(data) {
  if (!data || typeof data !== 'object') return null;
  const value = data.total_cost_usd;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Run an agent CLI subprocess in the given worktree. Returns a handle with:
 *   - pid
 *   - stop()        — graceful SIGTERM, SIGKILL after 5s
 *   - done          — Promise that resolves with { exitCode, signal } when the proc exits
 *
 * Options:
 *   - worktreePath   (required) cwd for the child
 *   - prompt         (required) prompt text to pass via `-p`
 *   - sessionId      (required) bobby session id, set as BOBBY_SESSION_ID env
 *   - onEvent        callback(event) for each parsed stdout event — event is
 *                    { type: 'stdout', kind, data, at } | { type: 'stderr', text, at }
 *                    | { type: 'exit', exitCode, signal, at }
 *   - onExit         callback({exitCode, signal}) — also fires once on exit
 *   - executor       'claude' | 'cursor-agent' | custom bin (default: 'claude')
 *   - claudeBin      explicit binary override, wins over the executor's default
 *   - claudeArgs     full arg list override (bypasses the flavor's builder)
 *   - env            extra env vars to merge
 *   - spawn          injection point for tests (default: child_process.spawn)
 *   - outputFormat   default: 'stream-json' — set to null to omit
 *   - allowedTools   optional string passed as --allowed-tools (claude only)
 *   - permissionMode optional: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
 *   - model          optional model name passed as --model
 *   - resume         optional CLI conversation id (see sessionIdFromEvent):
 *                    claude `--resume <session_id>`, codex `exec resume <thread_id>`;
 *                    cursor-agent drops it (no verified resume flag)
 */
export function runAgent({
  worktreePath,
  prompt,
  sessionId,
  onEvent,
  onExit,
  executor = 'claude',
  claudeBin,
  claudeArgs,
  env = {},
  spawn = defaultSpawn,
  outputFormat = 'stream-json',
  allowedTools,
  permissionMode,
  model,
  resume,
}) {
  if (!worktreePath) throw new Error('runAgent: worktreePath is required');
  if (!prompt) throw new Error('runAgent: prompt is required');

  const flavor = EXECUTORS[executor]
    ? { bin: EXECUTORS[executor].bin, buildArgs: EXECUTORS[executor].buildArgs }
    : { bin: executor, buildArgs: EXECUTORS.claude.buildArgs };

  const bin = claudeBin || flavor.bin;
  const args = claudeArgs
    ? [...claudeArgs]
    : flavor.buildArgs({ prompt, outputFormat, allowedTools, permissionMode, model, resume });

  const child = spawn(bin, args, {
    cwd: worktreePath,
    // cleanExecutorEnv strips the parent Claude Code session identity
    // (CLAUDECODE / CLAUDE_CODE_*) so the headless child never trips the
    // nested-session guard (PRO-025). Applied to the fully merged env so a
    // caller-supplied `env` cannot reintroduce those keys either.
    env: cleanExecutorEnv({
      ...process.env,
      BOBBY_SESSION_ID: sessionId,
      ...env,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // What this run cost, as last reported by the CLI. Null until one says.
  // `total_cost_usd` is cumulative for the run, so a later figure supersedes an
  // earlier one rather than adding to it.
  let costUsd = null;

  /** Forward a parsed line, reading any cost off it on the way past. */
  function handleParsed(parsed) {
    if (!parsed) return;
    if (parsed.kind === 'json') {
      const reported = readCostUsd(parsed.data);
      if (reported !== null) costUsd = reported;
    }
    if (onEvent) onEvent({ type: 'stdout', ...parsed, at: new Date().toISOString() });
  }

  // Line-buffered stdout parser
  let stdoutBuf = '';
  child.stdout?.on('data', chunk => {
    stdoutBuf += chunk.toString('utf8');
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      handleParsed(parseLine(line));
    }
  });

  child.stderr?.on('data', chunk => {
    const text = chunk.toString('utf8');
    if (onEvent) onEvent({ type: 'stderr', text, at: new Date().toISOString() });
  });

  const done = new Promise((resolve) => {
    child.on('exit', (exitCode, signal) => {
      // Flush any remaining stdout buffer. This matters more than it looks: the
      // result event carrying the cost is the LAST thing a CLI writes, so it is
      // the line most likely to arrive without a trailing newline and be sitting
      // here. Flushed unconditionally now — it used to be skipped entirely when
      // no onEvent was supplied, which would have dropped the cost with it.
      if (stdoutBuf.trim()) {
        handleParsed(parseLine(stdoutBuf));
        stdoutBuf = '';
      }
      const result = { exitCode, signal, costUsd };
      if (onEvent) onEvent({ type: 'exit', ...result, at: new Date().toISOString() });
      if (onExit) onExit(result);
      resolve(result);
    });
    child.on('error', (err) => {
      if (onEvent) onEvent({ type: 'stderr', text: `spawn error: ${err.message}`, at: new Date().toISOString() });
      // A run that spent money and then crashed still spent it.
      const result = { exitCode: null, signal: null, error: err.message, costUsd };
      if (onExit) onExit(result);
      resolve(result);
    });
  });

  function stop() {
    if (child.killed || child.exitCode !== null) return;
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }, GRACEFUL_TIMEOUT_MS);
  }

  return {
    pid: child.pid,
    stop,
    done,
    _child: child, // for tests
  };
}

// Previous name, kept so existing callers keep working.
export const runClaude = runAgent;
