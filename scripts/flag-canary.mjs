#!/usr/bin/env node
// scripts/flag-canary.mjs
//
// Detects when an agent CLI renames or drops a flag Bobby depends on.
//
// Per-PR verification proves an executor's argv is correct at merge time and
// nothing after that; these CLIs ship weekly. This probes the real binaries on
// a schedule, with no account required.
//
// The mechanism: an agent CLI parses argv before checking auth. So Bobby's
// exact command line, run unauthenticated, must fail with an auth error —
// never "unknown option". Two probes per flavor:
//
//   acceptance — Bobby's real argv. PASS if it clears argument parsing
//                (auth failure is the expected, passing outcome).
//                FAIL if the CLI rejects a flag.
//   control    — the same argv plus a deliberately bogus flag. This MUST be
//                rejected. If it isn't, the CLI ignores unknown flags and the
//                acceptance probe proves nothing, so the whole result is void.
//
// argv comes from the real buildArgs functions — never hand-copied here, or
// the canary would drift from the code it guards.
//
// Usage: node scripts/flag-canary.mjs <flavor>
// Exit:  0 = pass, 1 = drift detected, 2 = could not run (install/CLI missing)

import { spawnSync } from 'child_process';
import { resolveExecutor, EXECUTOR_NAMES } from '../lib/dashboard/executor.js';

const BOGUS_FLAG = '--bobby-canary-definitely-not-a-flag';

// Matching an unknown-option rejection across clap (codex), commander
// (cursor-agent), and claude's own parser.
const UNKNOWN_OPTION = /unknown (option|argument|flag)|unrecognized (option|argument)|unexpected argument|error: unexpected/i;
// Reaching auth means argv parsed cleanly — the passing outcome.
const REACHED_AUTH = /auth|login|api[_ -]?key|credential|not logged in|sign in|unauthor/i;

function run(bin, args) {
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (r.error && r.error.code === 'ENOENT') return { missing: true, output: '' };
  return { missing: false, output: `${r.stdout || ''}${r.stderr || ''}`.slice(0, 4000) };
}

const flavor = process.argv[2];
if (!flavor) {
  console.error('usage: flag-canary.mjs <flavor>');
  process.exit(2);
}

// resolveExecutor treats an unrecognized name as a custom binary path and falls
// back to claude-style flags. That is right for `dashboard.executor: /path/to/x`
// but catastrophic here: probing an unregistered flavor would build the wrong
// argv and report it as drift in a CLI that is behaving perfectly.
if (!EXECUTOR_NAMES.includes(flavor)) {
  console.log(`::error::'${flavor}' is not a registered executor flavor. ` +
    `Known: ${EXECUTOR_NAMES.join(', ')}. Either the canary matrix is stale or ` +
    `a flavor was removed from lib/dashboard/executor.js.`);
  console.log(`RESULT=unknown-flavor FLAVOR=${flavor}`);
  process.exit(2);
}

const ex = resolveExecutor({ dashboard: { executor: flavor } });

// Exercise every option Bobby can emit, so a rename in any of them is caught.
const argv = ex.buildArgs({
  prompt: 'canary: reply with the single word ok',
  outputFormat: 'stream-json',
  model: 'canary-nonexistent-model',
  permissionMode: 'bypassPermissions',
});

const version = run(ex.bin, ['--version']);
if (version.missing) {
  console.log(`::warning::${flavor}: binary '${ex.bin}' not found — install step failed`);
  console.log(`RESULT=install-failed FLAVOR=${flavor}`);
  process.exit(2);
}
console.log(`${flavor} version: ${version.output.trim().split('\n')[0]}`);
console.log(`argv: ${JSON.stringify(argv)}`);

// --- control probe: the CLI must still reject nonsense -----------------------
const control = run(ex.bin, [...argv, BOGUS_FLAG]);
if (!UNKNOWN_OPTION.test(control.output)) {
  console.log(`::error::${flavor}: control probe failed — the CLI did not reject ` +
    `${BOGUS_FLAG}. It may now ignore unknown flags, which makes the acceptance ` +
    `probe meaningless. Treating as drift.`);
  console.log(`--- control output ---\n${control.output}`);
  console.log(`RESULT=control-failed FLAVOR=${flavor}`);
  process.exit(1);
}

// --- acceptance probe: Bobby's real argv must clear parsing ------------------
const accept = run(ex.bin, argv);
if (UNKNOWN_OPTION.test(accept.output)) {
  console.log(`::error::${flavor}: FLAG DRIFT — the CLI rejected a flag Bobby sends.`);
  console.log(`--- output ---\n${accept.output}`);
  console.log(`RESULT=drift FLAVOR=${flavor}`);
  process.exit(1);
}

const note = REACHED_AUTH.test(accept.output)
  ? 'stopped at authentication, as expected'
  : 'cleared argument parsing (did not reach an auth error; output captured below)';
console.log(`${flavor}: OK — ${note}`);
if (!REACHED_AUTH.test(accept.output)) {
  console.log(`--- output ---\n${accept.output.slice(0, 1000)}`);
}
console.log(`RESULT=pass FLAVOR=${flavor}`);
process.exit(0);
