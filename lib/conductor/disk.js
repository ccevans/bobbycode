// lib/conductor/disk.js
//
// Free disk on the volume that holds the studio (BOB-189). Read-only: one statfs call,
// which is instant (unlike measuring directory sizes). `bavail` is what a normal process
// can still write, so APFS purgeable space is not counted as free.
//
// Any unreadable or implausible figure throws; there is no fallback value.

import fs from 'fs';

const GB = 1024 ** 3;

/** { path, total_gb, free_gb } for the volume holding `studioRoot`, GB with one decimal. */
export function readDisk(studioRoot, { statfs = fs.statfsSync } = {}) {
  let st;
  try {
    st = statfs(studioRoot);
  } catch (e) {
    throw new Error(`Cannot read free disk space for ${studioRoot}: ${e.message}`);
  }
  const free = Number(st.bavail) * Number(st.bsize);
  const total = Number(st.blocks) * Number(st.bsize);
  if (!Number.isFinite(free) || !Number.isFinite(total) || total <= 0 || free < 0 || free > total) {
    throw new Error(`statfs of ${studioRoot} returned implausible figures (free ${free} bytes of ${total} bytes); refusing to trust the reading`);
  }
  // Free is floored to a tenth, so a reading never passes the floor by rounding up.
  const tenths = (bytes, round) => round((bytes / GB) * 10) / 10;
  return { path: studioRoot, total_gb: tenths(total, Math.round), free_gb: tenths(free, Math.floor) };
}
