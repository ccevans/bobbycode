import { readDisk } from '../../../lib/conductor/disk.js';

const GB = 1024 ** 3;
const fake = (over = {}) => () => ({ bsize: 4096, blocks: (926 * GB) / 4096, bavail: (14.27 * GB) / 4096, ...over });

describe('conductor disk probe', () => {
  test('reports total and free GB of the volume holding the studio', () => {
    expect(readDisk('/studio', { statfs: fake() })).toEqual({ path: '/studio', total_gb: 926, free_gb: 14.2 });
  });

  test('free is floored to a tenth, never rounded up past the floor', () => {
    expect(readDisk('/studio', { statfs: fake({ bavail: (49.99 * GB) / 4096 }) }).free_gb).toBe(49.9);
  });

  test('a failing statfs is an error naming the path', () => {
    const statfs = () => { throw new Error('ENOENT: no such file'); };
    expect(() => readDisk('/studio', { statfs })).toThrow(/Cannot read free disk space for \/studio: ENOENT/);
  });

  test('implausible figures are refused, not trusted', () => {
    expect(() => readDisk('/studio', { statfs: fake({ blocks: 0 }) })).toThrow(/implausible/);
    expect(() => readDisk('/studio', { statfs: fake({ bavail: (2000 * GB) / 4096 }) })).toThrow(/implausible/);
    expect(() => readDisk('/studio', { statfs: fake({ bavail: undefined }) })).toThrow(/implausible/);
  });

  test('the real probe reads this machine', () => {
    const d = readDisk(process.cwd());
    expect(d.total_gb).toBeGreaterThan(0);
    expect(d.free_gb).toBeLessThanOrEqual(d.total_gb);
  });
});
