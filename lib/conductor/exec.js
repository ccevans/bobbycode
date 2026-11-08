// lib/conductor/exec.js
//
// The single place the conductor shells out. execFile with an argv array: no
// shell, no string interpolation. Callers take `run` as a parameter so tests
// inject a mock instead of touching the real `claude` / `docker` binaries.

import { execFileSync } from 'child_process';

/**
 * Run `cmd` with `args` and return stdout. Throws an Error that carries the
 * command line and stderr when the process cannot start or exits non-zero.
 */
export function run(cmd, args) {
  if (!Array.isArray(args)) throw new Error('conductor exec.run: args must be an array');
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr).trim() : '';
    const detail = stderr || e.message;
    throw new Error(`\`${[cmd, ...args].join(' ')}\` failed: ${detail}`);
  }
}
