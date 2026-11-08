// lib/conductor/governor.js
//
// Yes/no answers for "may I start a lane / a docker stack?". It only answers; it
// never acts on the machine.

/** { ok, reason, numbers } for starting a lane: free RAM must reach governor.min_free_ram_mb. */
export function checkLane(config, memory) {
  const min = config.governor.min_free_ram_mb;
  const ok = memory.free_mb >= min;
  return {
    ok,
    reason: ok ? `free RAM ${memory.free_mb} MB >= min ${min} MB` : `free RAM ${memory.free_mb} MB < min ${min} MB`,
    numbers: { free_ram_mb: memory.free_mb, min_free_ram_mb: min },
  };
}

/** { ok, reason, numbers } for starting a docker stack: the lane check, then stack count < governor.max_docker_stacks. */
export function checkStack(config, memory, stackCount) {
  const lane = checkLane(config, memory);
  const cap = config.governor.max_docker_stacks;
  const numbers = { ...lane.numbers, docker_stacks: stackCount, max_docker_stacks: cap };
  if (!lane.ok) return { ok: false, reason: lane.reason, numbers };
  if (stackCount >= cap) return { ok: false, reason: `docker stacks ${stackCount} >= max ${cap}`, numbers };
  return { ok: true, reason: `${lane.reason}; docker stacks ${stackCount} < max ${cap}`, numbers };
}
