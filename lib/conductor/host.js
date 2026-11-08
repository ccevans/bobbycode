// lib/conductor/host.js
//
// Mutating conductor commands run on the M4 only (CC's decision on BOB-173,
// 2026-11-08). The other machine runs the robin ops jobs and must never reap the
// studio's sessions. The machine is identified by its CPU brand string, read
// through the injected exec; anything that is not an Apple M4 is refused.

import { run as defaultRun } from './exec.js';

const REQUIRED_BRAND = /^Apple M4\b/;

/** Throws unless this machine is the M4. */
export function assertM4Host({ run = defaultRun } = {}) {
  const brand = run('sysctl', ['-n', 'machdep.cpu.brand_string']).trim();
  if (!REQUIRED_BRAND.test(brand)) {
    throw new Error(`Refusing to run: this command runs on the M4 only, and this host reports "${brand || 'no CPU brand'}".`);
  }
  return brand;
}
