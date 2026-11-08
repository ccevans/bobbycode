// lib/conductor/resources.js
//
// Machine RAM probe (macOS `vm_stat` + `sysctl hw.memsize`). Read-only.
//
// "Free RAM" here is memory the OS can hand to a new process without compressing
// or swapping anything else:
//
//   free_mb = (Pages free + File-backed pages + Pages purgeable) x page size
//
// - Pages free: unused (vm_stat reports it without the speculative pages).
// - File-backed pages: the file cache. Clean cache is dropped on demand, so it is
//   available. This is Activity Monitor's "Cached Files". It already contains the
//   speculative (read-ahead) pages: on a live M4, File-backed + Anonymous pages
//   equalled Active + Inactive + Speculative to the page. Adding "Pages speculative"
//   on top would count them twice, so they are reported but not added.
// - Pages purgeable: app data the app has marked as discardable.
//
// Deliberately NOT counted:
// - Pages inactive: mostly anonymous memory of idle processes (the ~30 idle claude
//   sessions). Reusing it means compressing or swapping it, which is exactly the
//   pressure the governor exists to prevent. Counting it would make the check pass
//   on a machine that is already thrashing.
// - Anything in the compressor. It is reported, not added: "stored" is the
//   uncompressed size the compressor holds (the 27 GB signal), "occupied" is the
//   RAM it takes.
//
// Any missing or unparseable line throws; there is no fallback value.

import { run as defaultRun } from './exec.js';

const MB = 1024 * 1024;

function pagesLine(text, label) {
  const m = new RegExp(`^${label}:\\s+(\\d+)\\.?\\s*$`, 'm').exec(text);
  if (!m) throw new Error(`vm_stat output has no "${label}" line`);
  return Number(m[1]);
}

/** Parse `vm_stat` text into MB figures. Throws on any missing line. */
export function parseVmStat(text) {
  const header = /page size of (\d+) bytes/.exec(text);
  if (!header) throw new Error('vm_stat output has no "page size of N bytes" header');
  const pageSize = Number(header[1]);
  if (!(pageSize > 0)) throw new Error(`vm_stat reported page size ${header[1]}`);
  const mbOf = (pages) => Math.floor((pages * pageSize) / MB);
  const mb = (label) => mbOf(pagesLine(text, label));
  const free = pagesLine(text, 'Pages free');
  const speculative = pagesLine(text, 'Pages speculative');
  const fileBacked = pagesLine(text, 'File-backed pages');
  const purgeable = pagesLine(text, 'Pages purgeable');
  return {
    page_size: pageSize,
    parts: { free_mb: mbOf(free), speculative_mb: mbOf(speculative), file_backed_mb: mbOf(fileBacked), purgeable_mb: mbOf(purgeable) },
    free_mb: mbOf(free + fileBacked + purgeable),
    compressed_mb: mb('Pages stored in compressor'),
    compressor_mb: mb('Pages occupied by compressor'),
  };
}

/** Total physical RAM in MB from `sysctl -n hw.memsize`. */
export function parseMemsize(text) {
  const bytes = Number(String(text).trim());
  if (!Number.isInteger(bytes) || bytes <= 0) throw new Error(`sysctl hw.memsize returned "${String(text).trim()}"`);
  return Math.floor(bytes / MB);
}

/** { total_mb, free_mb, compressed_mb, compressor_mb, page_size, parts }. */
export function readMemory({ run = defaultRun } = {}) {
  const vm = parseVmStat(run('vm_stat', []));
  const total_mb = parseMemsize(run('sysctl', ['-n', 'hw.memsize']));
  if (vm.free_mb > total_mb) {
    throw new Error(`vm_stat free RAM ${vm.free_mb} MB exceeds hw.memsize ${total_mb} MB; refusing to trust the reading`);
  }
  return { total_mb, ...vm };
}
