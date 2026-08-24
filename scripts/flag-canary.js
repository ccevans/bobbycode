#!/usr/bin/env node
// scripts/flag-canary.js — scheduled flag-drift canary for executor CLIs (BOB-089).
//
// Per-PR verification proves an executor's argv is correct at merge time and
// nothing after that; agent CLIs ship weekly. This probes the real binaries on
// a schedule (.github/workflows/flag-canary.yml), no account required.
//
// Mechanism — parse-vs-auth: an agent CLI parses argv before checking auth, so
// Bobby's exact command line run unauthenticated must fail with an auth error,
// never "unknown option". Two probes per flavor:
//
//   acceptance — every distinct argv buildArgs can emit (the full
//                permissionMode × resume cross-product, deduped). PASS when
//                the failure is anything but a parse rejection; FAIL (drift)
//                when the output matches an unknown-option shape.
//   control    — the first acceptance argv plus a deliberately bogus flag.
//                This MUST be rejected: a CLI that silently ignores unknown
//                flags would make every acceptance pass vacuous, so a passing
//                control probe is itself reported as drift.
//
// argv comes from the real buildArgs functions via resolveExecutor — never
// hand-copied here or into the YAML (unit-enforced by
// test/scripts/flag-canary.test.js), or the canary would drift from the code
// it guards.
//
// Usage: node scripts/flag-canary.js <flavor>
//        BOBBY_CANARY_BIN=/path/to/shim overrides the binary (test/drill seam,
//        mirroring executor.js's spawn override pattern).
// Exit:  0 = pass, 1 = drift detected, 2 = could not run (unknown flavor or
//        binary missing — reported as install-failed, never as drift).

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { resolveExecutor, EXECUTOR_NAMES, cleanExecutorEnv } from '../lib/dashboard/executor.js';

export const BOGUS_FLAG = '--bobby-definitely-not-a-flag';

const PROBE_TIMEOUT_MS = 90_000;
const REPORT_PATH = path.join('.canary', 'report.md');

// Every option Bobby can emit; permissionMode and resume vary per probe.
const PROBE_OPTIONS = {
  prompt: 'Reply with the single word ok',
  outputFormat: 'stream-json',
  allowedTools: 'Bash',
  model: 'x',
};
const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
const RESUMES = [undefined, 'bobby-canary-resume'];

// Drift shapes, each cited to a real run (plan.md verification ledger,
// 2026-08-23). Anchored to parser wording so auth/model errors cannot match —
// "unrecognized_model" does not match /unrecognized (option|argument|flag)/.
const DRIFT_PATTERNS = [
  /unknown option/i, // V1 claude 2.1.233, V2 cursor-agent 2026.07.23
  /unexpected argument .* found/i, // V3 codex-cli 0.146.0 (clap)
  /invalid value '[^']*' for '--/, // V4 clap value-set drift (e.g. sandbox mode renamed)
  /error: option '.*' argument '.*' is invalid/, // commander choices refusal (defensive; V5)
  /unrecognized (option|argument|flag)/i, // getopt family (defensive)
];

/**
 * All distinct acceptance argvs for a flavor: the flavor's real buildArgs over
 * the permissionMode × resume cross-product, deduped by argv. The cross-product
 * matters — probing each flag once missed codex's `exec resume` refusing the
 * sandbox flag (the F7 class).
 *
 * Unregistered flavors throw rather than probe: resolveExecutor's fallback
 * treats an unknown name as a custom binary with claude-style flags, which is
 * right for `dashboard.executor: /path/to/x` and catastrophic here.
 */
export function buildProbeSet(flavor) {
  if (!EXECUTOR_NAMES.includes(flavor)) {
    throw new Error(`'${flavor}' is not a registered executor flavor. `
      + `Known flavors: ${EXECUTOR_NAMES.join(', ')}. Either the canary matrix `
      + 'is stale or the flavor was removed from lib/dashboard/executor.js.');
  }
  const { buildArgs } = resolveExecutor({ dashboard: { executor: flavor } });
  const seen = new Map();
  for (const permissionMode of PERMISSION_MODES) {
    for (const resume of RESUMES) {
      const argv = buildArgs({ ...PROBE_OPTIONS, permissionMode, resume });
      const key = JSON.stringify(argv);
      if (!seen.has(key)) {
        seen.set(key, {
          argv,
          label: `permissionMode=${permissionMode} resume=${resume ? 'yes' : 'no'}`,
        });
      }
    }
  }
  return [...seen.values()];
}

/** The control argv: an acceptance argv plus the bogus flag (position-independent per V3). */
export function controlArgs(argv) {
  return [...argv, BOGUS_FLAG];
}

/**
 * 'drift' iff the output matches a known parse-rejection shape, else 'pass'.
 * Everything not drift-shaped passes — auth failure, model-not-found, timeout
 * are all passing states; vacuous passes are excluded by the control probe,
 * not by trying to enumerate auth wordings.
 */
export function classify(output) {
  return DRIFT_PATTERNS.some((re) => re.test(output || '')) ? 'drift' : 'pass';
}

/**
 * The control probe's verdict: null when the CLI rejected the bogus flag (the
 * healthy state), else the distinct vacuity message — reported as drift with
 * its own wording, never as a generic drift line (AC4).
 */
export function controlVacuity(output, bin) {
  if (classify(output) === 'drift') return null;
  return `control probe passed: ${bin} no longer rejects unknown flags — `
    + 'acceptance results are vacuous';
}

// --- runner (CLI main below) -------------------------------------------------

function probeEnv() {
  // cleanExecutorEnv strips the parent Claude Code session identity; the API
  // keys go too — the canary must never become an authenticated run.
  const env = cleanExecutorEnv(process.env);
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.CURSOR_API_KEY;
  env.NO_COLOR = '1';
  return env;
}

function runOnce(bin, argv, cwd) {
  const r = spawnSync(bin, argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: probeEnv(),
    timeout: PROBE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  return {
    output: `${r.stdout || ''}${r.stderr || ''}`,
    missing: r.error?.code === 'ENOENT',
    // Parse errors are instant; surviving the timeout means the argv parsed.
    timedOut: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGKILL',
  };
}

function tail(text, n = 2000) {
  const t = (text || '').trim();
  return t.length > n ? `…${t.slice(-n)}` : t;
}

function writeReport({ flavor, bin, version, outcome, probes, note }) {
  const lines = [
    `# Flag canary — ${flavor}`,
    '',
    `outcome: ${outcome}`,
    '',
    `- binary: ${bin}`,
    `- version: ${version}`,
  ];
  if (note) lines.push(`- note: ${note}`);
  for (const p of probes) {
    lines.push('', `## ${p.kind} — ${p.result} (${p.label})`, '',
      `argv: \`${JSON.stringify(p.argv)}\``, '', '```', tail(p.output), '```');
  }
  lines.push('');
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
}

function stepSummary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
}

function main() {
  const flavor = process.argv[2];
  if (!flavor) {
    console.error('usage: node scripts/flag-canary.js <flavor>');
    process.exit(2);
  }

  let probes;
  try {
    probes = buildProbeSet(flavor);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  const resolved = resolveExecutor({ dashboard: { executor: flavor } });
  const bin = process.env.BOBBY_CANARY_BIN || resolved.bin;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-canary-'));

  const versionRun = runOnce(bin, ['--version'], cwd);
  if (versionRun.missing) {
    writeReport({
      flavor, bin, version: '(binary not found)', outcome: 'install-failed', probes: [],
      note: `binary '${bin}' not found on PATH — the install step lied or PATH is wrong`,
    });
    console.error(`${flavor}: binary '${bin}' not found — install-failed`);
    process.exit(2);
  }
  const version = versionRun.output.trim().split('\n')[0] || '(no version output)';
  console.log(`${flavor} version: ${version}`);
  stepSummary(`**${flavor}** version: \`${version}\``);

  const results = [];
  const failures = [];

  probes.forEach(({ argv, label }, i) => {
    const run = runOnce(bin, argv, cwd);
    let result = classify(run.output);
    let probeLabel = `acceptance ${i + 1} of ${probes.length}: ${label}`;
    if (run.timedOut && result === 'pass') {
      probeLabel += ' — timed out unauthenticated (parse refusal is instant, so the argv parsed)';
    }
    if (result === 'drift') failures.push(`acceptance ${i + 1} (${label})`);
    results.push({ kind: 'acceptance', label: probeLabel, argv, output: run.output, result });
    console.log(`${flavor} acceptance ${i + 1}/${probes.length} [${label}]: ${result}`);
  });

  const ctrlArgv = controlArgs(probes[0].argv);
  const ctrl = runOnce(bin, ctrlArgv, cwd);
  const vacuity = controlVacuity(ctrl.output, bin);
  results.push({
    kind: 'control',
    label: vacuity ? 'VACUOUS — bogus flag was not rejected' : 'bogus flag rejected (healthy)',
    argv: ctrlArgv,
    output: ctrl.output,
    result: vacuity ? 'drift' : 'pass',
  });
  if (vacuity) {
    failures.push('control');
    console.error(`${flavor}: ${vacuity}`);
  } else {
    console.log(`${flavor} control: bogus flag rejected (healthy)`);
  }

  const outcome = failures.length ? 'drift' : 'pass';
  writeReport({
    flavor, bin, version, outcome, probes: results,
    note: vacuity || (failures.length ? `failing probe(s): ${failures.join('; ')}` : undefined),
  });
  stepSummary(`**${flavor}** outcome: ${outcome}`);
  console.log(`${flavor}: ${outcome.toUpperCase()}${failures.length ? ` — ${failures.join('; ')}` : ''}`);
  process.exit(outcome === 'drift' ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
