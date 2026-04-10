// lib/dashboard/executor.js
//
// Spawns `claude` CLI as a child process for a workspace. Streams stdout
// (parsed as JSON lines when --output-format=stream-json is available, or
// raw text otherwise) and forwards events to a callback. Handles graceful
// stop (SIGTERM → SIGKILL after timeout).
//
// Testable: pass a `spawn` override through opts for unit tests.

import { spawn as defaultSpawn } from 'child_process';

const GRACEFUL_TIMEOUT_MS = 5000;

/**
 * Normalize claude CLI output into structured events. The `claude` CLI supports
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
 * Run a claude subprocess in the given worktree. Returns a handle with:
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
 *   - claudeBin      default 'claude'
 *   - claudeArgs     extra args (default: ['-p', prompt])
 *   - env            extra env vars to merge
 *   - spawn          injection point for tests (default: child_process.spawn)
 *   - outputFormat   default: 'stream-json' — set to null to omit
 *   - allowedTools   optional string passed as --allowed-tools
 *   - permissionMode optional: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
 */
export function runClaude({
  worktreePath,
  prompt,
  sessionId,
  onEvent,
  onExit,
  claudeBin = 'claude',
  claudeArgs,
  env = {},
  spawn = defaultSpawn,
  outputFormat = 'stream-json',
  allowedTools,
  permissionMode,
}) {
  if (!worktreePath) throw new Error('runClaude: worktreePath is required');
  if (!prompt) throw new Error('runClaude: prompt is required');

  const args = claudeArgs ? [...claudeArgs] : ['-p', prompt];
  if (outputFormat && !args.includes('--output-format')) {
    args.push('--output-format', outputFormat);
    // stream-json requires verbose
    if (outputFormat === 'stream-json') args.push('--verbose');
  }
  if (allowedTools && !args.includes('--allowed-tools')) {
    args.push('--allowed-tools', allowedTools);
  }
  if (permissionMode && !args.includes('--permission-mode')) {
    args.push('--permission-mode', permissionMode);
  }

  const child = spawn(claudeBin, args, {
    cwd: worktreePath,
    env: {
      ...process.env,
      BOBBY_SESSION_ID: sessionId,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Line-buffered stdout parser
  let stdoutBuf = '';
  child.stdout?.on('data', chunk => {
    stdoutBuf += chunk.toString('utf8');
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      const parsed = parseLine(line);
      if (parsed && onEvent) {
        onEvent({ type: 'stdout', ...parsed, at: new Date().toISOString() });
      }
    }
  });

  child.stderr?.on('data', chunk => {
    const text = chunk.toString('utf8');
    if (onEvent) onEvent({ type: 'stderr', text, at: new Date().toISOString() });
  });

  const done = new Promise((resolve) => {
    child.on('exit', (exitCode, signal) => {
      // Flush any remaining stdout buffer
      if (stdoutBuf.trim() && onEvent) {
        const parsed = parseLine(stdoutBuf);
        if (parsed) onEvent({ type: 'stdout', ...parsed, at: new Date().toISOString() });
        stdoutBuf = '';
      }
      const result = { exitCode, signal };
      if (onEvent) onEvent({ type: 'exit', ...result, at: new Date().toISOString() });
      if (onExit) onExit(result);
      resolve(result);
    });
    child.on('error', (err) => {
      if (onEvent) onEvent({ type: 'stderr', text: `spawn error: ${err.message}`, at: new Date().toISOString() });
      const result = { exitCode: null, signal: null, error: err.message };
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
