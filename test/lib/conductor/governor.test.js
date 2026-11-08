import { checkLane, checkStack } from '../../../lib/conductor/governor.js';

const config = { governor: { min_free_ram_mb: 4096, max_docker_stacks: 4 } };

describe('conductor governor', () => {
  test('lane: refuses below the floor with both numbers, passes at and above it', () => {
    expect(checkLane(config, { free_mb: 1200 })).toMatchObject({ ok: false, reason: 'free RAM 1200 MB < min 4096 MB' });
    expect(checkLane(config, { free_mb: 4095 }).ok).toBe(false);
    expect(checkLane(config, { free_mb: 4096 }).ok).toBe(true);
    expect(checkLane(config, { free_mb: 9000 })).toMatchObject({ ok: true, numbers: { free_ram_mb: 9000, min_free_ram_mb: 4096 } });
  });

  test('stack: refuses at the cap (>=) with the count and the cap', () => {
    expect(checkStack(config, { free_mb: 9000 }, 4)).toMatchObject({ ok: false, reason: 'docker stacks 4 >= max 4' });
    expect(checkStack(config, { free_mb: 9000 }, 11).ok).toBe(false);
    expect(checkStack(config, { free_mb: 9000 }, 3)).toMatchObject({ ok: true, numbers: { docker_stacks: 3, max_docker_stacks: 4 } });
  });

  test('stack: low RAM refuses first, even with room for stacks', () => {
    expect(checkStack(config, { free_mb: 100 }, 0)).toMatchObject({ ok: false, reason: 'free RAM 100 MB < min 4096 MB' });
  });
});
