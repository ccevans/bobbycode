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
    buildArgs({ prompt, outputFormat, allowedTools, permissionMode, model }) {
      const args = ['-p', prompt];
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
  const name = config.target === 'cursor' ? 'cursor-agent' : 'claude';
  return { name, ...EXECUTORS[name] };
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
}) {
  if (!worktreePath) throw new Error('runAgent: worktreePath is required');
  if (!prompt) throw new Error('runAgent: prompt is required');

  const flavor = EXECUTORS[executor]
    ? { bin: EXECUTORS[executor].bin, buildArgs: EXECUTORS[executor].buildArgs }
    : { bin: executor, buildArgs: EXECUTORS.claude.buildArgs };

  const bin = claudeBin || flavor.bin;
  const args = claudeArgs
    ? [...claudeArgs]
    : flavor.buildArgs({ prompt, outputFormat, allowedTools, permissionMode, model });

  const child = spawn(bin, args, {
    cwd: worktreePath,
    env: {
      ...process.env,
      BOBBY_SESSION_ID: sessionId,
      ...env,
    },
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
