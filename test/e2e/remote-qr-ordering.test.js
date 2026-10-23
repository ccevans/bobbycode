// test/e2e/remote-qr-ordering.test.js — BOB-064, rejection round.
//
// The live test pass failed exactly one AC: with the relay down (or
// black-holed) the QR, link, and pairing code printed BEFORE verification, so
// a scannable QR sat on screen — for up to the full 8s verify timeout —
// before the failure landed. The AC says "a clear failure, not a QR".
//
// The verifier attaches to the relay as its own client, so nothing about
// verification needs the QR displayed first. These tests drive the actual
// command (`node bin/bobby.js remote`), not an extracted helper, and pin the
// ordering:
//   - on any failure path, no QR / link / pairing code is ever printed
//   - on success, the verified verdict prints BEFORE the QR block
import { jest } from '@jest/globals';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { scaffoldProject } from '../../commands/init.js';

jest.setTimeout(60000);

const bobby = path.resolve('bin/bobby.js');
const hasProRelay = fs.existsSync(path.resolve('../bobbycode-pro/hq/relay/server.js'));
const maybe = hasProRelay ? test : test.skip;

// Markers for the three pieces the AC says must not appear before the verdict.
// 'Scan with your phone camera' heads the QR, '/#' is the pairing link
// fragment, 'Pairing code' heads the paste-able code.
const QR_MARKERS = ['Scan with your phone camera', '/#', 'Pairing code'];

function spawnRemote(cwd, args) {
  const env = { ...process.env };
  // The command defaults its URLs from these; a developer's shell must not
  // steer the test.
  delete env.BOBBY_RELAY_URL;
  delete env.BOBBY_APP_URL;
  const child = spawn('node', [bobby, 'remote', ...args], { cwd, env });
  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });
  return { child, getOutput: () => output };
}

function waitForExit(child) {
  return new Promise((resolve) => child.on('exit', (code) => resolve(code)));
}

function waitForOutput(getOutput, marker, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (getOutput().includes(marker)) { clearInterval(poll); resolve(); }
      else if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        reject(new Error(`never saw ${JSON.stringify(marker)} in:\n${getOutput()}`));
      }
    }, 100);
  });
}

describe('E2E: bobby remote prints the QR only after the verified verdict (BOB-064)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-remote-qr-'));
    scaffoldProject(tmpDir, {
      project: 'remote-qr-e2e', stack: 'generic',
      health_checks: [], areas: ['cli'],
      commands: { test: 'echo pass', lint: 'echo clean' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });
    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init', { cwd: tmpDir });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('relay down: a clear failure and NO QR, link, or pairing code', async () => {
    // Nothing listens on port 1 — the exact t3-relay-down.log scenario that
    // was rejected: full QR first, then the failure.
    const { child, getOutput } = spawnRemote(tmpDir, ['--relay', 'ws://127.0.0.1:1']);
    const code = await waitForExit(child);
    const output = getOutput();

    expect(code).toBe(1);
    // The failure is still clear (unchanged from the accepted scenarios)…
    expect(output).toContain('Connecting…');
    expect(output).toMatch(/relay could not be reached/i);
    // …but nothing scannable ever appeared.
    for (const marker of QR_MARKERS) {
      expect(output).not.toContain(marker);
    }
  });

  maybe('happy path: verified verdict first, THEN the QR, link, and code', async () => {
    const { createRelay } = await import(path.resolve('../bobbycode-pro/hq/relay/server.js'));
    const relay = createRelay({});
    const relayPort = await new Promise((r) => relay.httpServer.listen(0, '127.0.0.1', () => r(relay.httpServer.address().port)));
    const { child, getOutput } = spawnRemote(tmpDir, ['--relay', `ws://127.0.0.1:${relayPort}`]);
    try {
      await waitForOutput(getOutput, 'Pairing code');
      const output = getOutput();

      const tickAt = output.indexOf('Team is reachable');
      expect(tickAt).toBeGreaterThan(-1);
      expect(output.indexOf('Connecting…')).toBeLessThan(tickAt);
      // Every scannable artifact prints after the verdict is earned.
      for (const marker of QR_MARKERS) {
        const at = output.indexOf(marker);
        expect(at).toBeGreaterThan(tickAt);
      }
    } finally {
      child.kill('SIGINT');
      const killer = setTimeout(() => child.kill('SIGKILL'), 10000);
      await waitForExit(child);
      clearTimeout(killer);
      await relay.close();
    }
  });
});
