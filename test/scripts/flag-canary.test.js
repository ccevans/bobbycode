// test/scripts/flag-canary.test.js — the flag-drift canary's self-checks (BOB-089).
//
// The canary guards buildArgs against upstream CLI drift; these tests guard the
// canary against its own two failure modes:
//   T1 — a flavor registered in lib/dashboard/executor.js but missing from the
//        workflow matrix would silently never be probed (the BOB-078
//        leakage-map pattern, transplanted to executors).
//   T2 — a flag literal hand-written into the YAML would rot independently of
//        buildArgs, which is the exact drift the canary exists to catch (AC2
//        as a test, not a review-time grep).
// The classifier fixtures are real outputs from the verification ledger in
// plan.md (V1–V5), captured from claude 2.1.233, cursor-agent 2026.07.23 and
// codex-cli 0.146.0 — not invented shapes.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EXECUTOR_NAMES } from '../../lib/dashboard/executor.js';
import {
  BOGUS_FLAG,
  buildProbeSet,
  controlArgs,
  classify,
  controlVacuity,
} from '../../scripts/flag-canary.js';

const YAML_PATH = fileURLToPath(new URL('../../.github/workflows/flag-canary.yml', import.meta.url));
const yamlText = () => fs.readFileSync(YAML_PATH, 'utf8');

// --- T1: registration completeness -----------------------------------------

test('every registered executor flavor appears in the canary matrix', () => {
  const yaml = yamlText();
  expect(EXECUTOR_NAMES.length).toBeGreaterThan(0);
  for (const name of EXECUTOR_NAMES) {
    // Exact matrix entry, anchored so `claude` can't be satisfied by a
    // hypothetical `claude-next` line.
    expect(yaml).toMatch(new RegExp(`flavor:\\s*${name}\\s*$`, 'm'));
  }
});

test('the workflow never triggers on push or pull_request', () => {
  const yaml = yamlText();
  expect(yaml).toMatch(/^\s+schedule:\s*$/m);
  expect(yaml).toMatch(/^\s+workflow_dispatch:\s*$/m);
  expect(yaml).not.toMatch(/^\s+push:/m);
  expect(yaml).not.toMatch(/^\s+pull_request:/m);
});

// --- T2: no flag duplication in the YAML ------------------------------------

test('no flag emitted by any flavor\'s buildProbeSet appears in the YAML text', () => {
  const yaml = yamlText();
  const flags = new Set();
  for (const name of EXECUTOR_NAMES) {
    for (const { argv } of buildProbeSet(name)) {
      for (const tok of argv) {
        if (tok.startsWith('-')) flags.add(tok);
      }
    }
  }
  // Guard against vacuous truth: an empty flag set would pass every not-match.
  expect(flags.size).toBeGreaterThan(0);
  for (const flag of flags) {
    const esc = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Token-boundary match so `-p` can't false-positive inside a word like
    // `timeout-minutes`, while still catching the flag quoted or bare.
    expect(yaml).not.toMatch(new RegExp(`(^|[\\s"'=])${esc}([\\s"']|$)`, 'm'));
  }
});

// --- T3: the probe set is the full mode×resume cross-product -----------------

describe('buildProbeSet', () => {
  test('codex set contains an exec-resume argv and the resume+bypass argv (F7 class)', () => {
    const argvs = buildProbeSet('codex').map((p) => p.argv);
    expect(argvs.some((a) => a[0] === 'exec' && a[1] === 'resume')).toBe(true);
    expect(argvs.some((a) => a[1] === 'resume'
      && a.includes('--dangerously-bypass-approvals-and-sandbox'))).toBe(true);
    // The F7 bug shape itself: `exec resume` has no sandbox flag, so no
    // resumed argv may carry one.
    for (const a of argvs) {
      if (a[1] === 'resume') expect(a).not.toContain('--sandbox');
    }
  });

  test('codex set has at least 6 distinct argvs; claude covers all four permission modes', () => {
    const codex = buildProbeSet('codex').map((p) => JSON.stringify(p.argv));
    expect(new Set(codex).size).toBe(codex.length); // deduped
    expect(codex.length).toBeGreaterThanOrEqual(6);

    const claude = buildProbeSet('claude').map((p) => p.argv);
    for (const mode of ['default', 'acceptEdits', 'bypassPermissions', 'plan']) {
      expect(claude.some((a) => {
        const i = a.indexOf('--permission-mode');
        return i !== -1 && a[i + 1] === mode;
      })).toBe(true);
    }
  });

  test('cursor-agent set dedupes argv-identical mode combinations', () => {
    // acceptEdits and bypassPermissions build the same argv; resume is ignored
    // entirely — 8 combinations collapse to 3 distinct probes.
    const argvs = buildProbeSet('cursor-agent').map((p) => JSON.stringify(p.argv));
    expect(new Set(argvs).size).toBe(argvs.length);
    expect(argvs.length).toBe(3);
  });

  test('an unregistered flavor throws naming the valid flavors, never falls back to claude flags', () => {
    expect(() => buildProbeSet('opencode')).toThrow(/opencode/);
    expect(() => buildProbeSet('opencode')).toThrow(new RegExp(EXECUTOR_NAMES.join(', ')));
  });
});

// --- T4: classifier fixtures (verification ledger V1–V5) ---------------------

describe('classify', () => {
  test.each([
    ['V1/V2 claude & cursor-agent unknown option',
      "error: unknown option '--bobby-definitely-not-a-flag'"],
    ['V3 codex (clap) unexpected argument',
      "error: unexpected argument '--bobby-definitely-not-a-flag' found"],
    ['V4 clap invalid value (a renamed sandbox mode)',
      "error: invalid value 'bogus' for '--sandbox <SANDBOX_MODE>'"],
    ['commander choices refusal (defensive — V5 shows claude does not enforce today)',
      "error: option '--permission-mode <mode>' argument 'default' is invalid. Allowed choices are acceptEdits, bypassPermissions, plan."],
    ['getopt family (defensive)',
      "cursor-agent: unrecognized option '--force'"],
  ])('%s → drift', (_label, output) => {
    expect(classify(output)).toBe('drift');
  });

  test.each([
    ['claude auth refusal', 'Invalid API key · Please run /login'],
    ['V5/V6 model error after clean parse',
      '{"type":"result","subtype":"error","is_error":true,"error":{"type":"invalid_request_error","message":"unrecognized_model: x"}}'],
    ['codex login prompt', 'Please run `codex login` to authenticate.'],
    ['cursor-agent login prompt', 'Not logged in. Run cursor-agent login first.'],
    ['empty output (timeout)', ''],
  ])('%s → pass', (_label, output) => {
    expect(classify(output)).toBe('pass');
  });
});

// --- T5: control probe -------------------------------------------------------

describe('control probe', () => {
  test('controlArgs appends the bogus flag to an acceptance argv', () => {
    const argv = ['exec', '--json', 'hi'];
    expect(controlArgs(argv)).toEqual(['exec', '--json', 'hi', BOGUS_FLAG]);
    expect(argv).toEqual(['exec', '--json', 'hi']); // no mutation
  });

  test('a pass-shaped control output yields the distinct vacuity message', () => {
    const msg = controlVacuity('ok', 'codex');
    expect(msg).toMatch(/control probe passed/);
    expect(msg).toMatch(/codex no longer rejects unknown flags/);
    expect(msg).toMatch(/vacuous/);
  });

  test('a drift-shaped control output is the healthy state — no vacuity', () => {
    expect(controlVacuity("error: unknown option '--bobby-definitely-not-a-flag'", 'claude'))
      .toBeNull();
  });
});
