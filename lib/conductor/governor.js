// lib/conductor/governor.js
//
// Yes/no answers for "may I start a lane / a docker stack?". It only answers; it
// never acts on the machine.

/**
 * { ok, reason, numbers } for starting a lane: free RAM must reach governor.min_free_ram_mb
 * and free disk on the studio volume must reach governor.min_free_disk_gb (BOB-189).
 * Both numbers are always reported, so a refusal for one never hides the other.
 */
export function checkLane(config, memory, disk) {
  const minRam = config.governor.min_free_ram_mb;
  const minDisk = config.governor.min_free_disk_gb;
  const ramOk = memory.free_mb >= minRam;
  const diskOk = disk.free_gb >= minDisk;
  const ramText = `free RAM ${memory.free_mb} MB ${ramOk ? '>=' : '<'} min ${minRam} MB`;
  const diskText = `free disk ${disk.free_gb} GB ${diskOk ? '>=' : '<'} min ${minDisk} GB`;
  return {
    ok: ramOk && diskOk,
    reason: `${ramText}; ${diskText}`,
    numbers: { free_ram_mb: memory.free_mb, min_free_ram_mb: minRam, free_disk_gb: disk.free_gb, min_free_disk_gb: minDisk },
  };
}

/** { ok, reason, numbers } for starting a docker stack: the lane check, then stack count < governor.max_docker_stacks. */
export function checkStack(config, memory, disk, stackCount) {
  const lane = checkLane(config, memory, disk);
  const cap = config.governor.max_docker_stacks;
  const numbers = { ...lane.numbers, docker_stacks: stackCount, max_docker_stacks: cap };
  if (!lane.ok) return { ok: false, reason: lane.reason, numbers };
  if (stackCount >= cap) return { ok: false, reason: `docker stacks ${stackCount} >= max ${cap}`, numbers };
  return { ok: true, reason: `${lane.reason}; docker stacks ${stackCount} < max ${cap}`, numbers };
}
