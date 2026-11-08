import { checkLane, checkStack } from '../../../lib/conductor/governor.js';

const config = { governor: { min_free_ram_mb: 4096, max_docker_stacks: 4, min_free_disk_gb: 50 } };
const roomy = { free_gb: 200 };

describe('conductor governor', () => {
  test('lane: refuses below the RAM floor with both numbers, passes at and above it', () => {
    expect(checkLane(config, { free_mb: 1200 }, roomy)).toMatchObject({ ok: false, reason: expect.stringMatching(/^free RAM 1200 MB < min 4096 MB/) });
    expect(checkLane(config, { free_mb: 4095 }, roomy).ok).toBe(false);
    expect(checkLane(config, { free_mb: 4096 }, roomy).ok).toBe(true);
    expect(checkLane(config, { free_mb: 9000 }, roomy)).toMatchObject({
      ok: true,
      numbers: { free_ram_mb: 9000, min_free_ram_mb: 4096, free_disk_gb: 200, min_free_disk_gb: 50 },
    });
  });

  test('lane: refuses below the disk floor with both numbers, passes at it', () => {
    expect(checkLane(config, { free_mb: 9000 }, { free_gb: 14.2 })).toMatchObject({
      ok: false,
      reason: 'free RAM 9000 MB >= min 4096 MB; free disk 14.2 GB < min 50 GB',
    });
    expect(checkLane(config, { free_mb: 9000 }, { free_gb: 49.9 }).ok).toBe(false);
    expect(checkLane(config, { free_mb: 9000 }, { free_gb: 50 }).ok).toBe(true);
  });

  test('lane: when RAM and disk are both short the reason names both', () => {
    const r = checkLane(config, { free_mb: 100 }, { free_gb: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('free RAM 100 MB < min 4096 MB; free disk 3 GB < min 50 GB');
  });

  test('stack: refuses at the cap (>=) with the count and the cap', () => {
    expect(checkStack(config, { free_mb: 9000 }, roomy, 4)).toMatchObject({ ok: false, reason: 'docker stacks 4 >= max 4' });
    expect(checkStack(config, { free_mb: 9000 }, roomy, 11).ok).toBe(false);
    expect(checkStack(config, { free_mb: 9000 }, roomy, 3)).toMatchObject({ ok: true, numbers: { docker_stacks: 3, max_docker_stacks: 4 } });
  });

  test('stack: low RAM or low disk refuses first, even with room for stacks', () => {
    expect(checkStack(config, { free_mb: 100 }, roomy, 0)).toMatchObject({ ok: false, reason: expect.stringMatching(/^free RAM 100 MB < min 4096 MB/) });
    expect(checkStack(config, { free_mb: 9000 }, { free_gb: 10 }, 0)).toMatchObject({ ok: false, reason: expect.stringMatching(/free disk 10 GB < min 50 GB/) });
  });
});
