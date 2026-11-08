import { parseVmStat, parseMemsize, readMemory } from '../../../lib/conductor/resources.js';
import { vmStatText } from './helpers.js';

describe('conductor resources', () => {
  test('free RAM is free + speculative + file-backed + purgeable; inactive and compressor are not added', () => {
    const vm = parseVmStat(vmStatText({ freeMb: 100, specMb: 50, fileMb: 1000, purgeMb: 50, inactiveMb: 9000, storedMb: 20000, compressorMb: 8000 }));
    expect(vm.free_mb).toBe(1200);
    expect(vm.parts).toEqual({ free_mb: 100, speculative_mb: 50, file_backed_mb: 1000, purgeable_mb: 50 });
    expect(vm.compressed_mb).toBe(20000);
    expect(vm.compressor_mb).toBe(8000);
    expect(vm.page_size).toBe(16384);
  });

  test('the real-machine shape from 2026-11-08 parses (16 KB pages, trailing dots)', () => {
    const text = [
      'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
      'Pages free:                                   345210.',
      'Pages speculative:                             96412.',
      'Pages purgeable:                               31979.',
      'File-backed pages:                            492876.',
      'Pages stored in compressor:                  1428425.',
      'Pages occupied by compressor:                 564543.',
    ].join('\n');
    expect(parseVmStat(text).free_mb).toBe(Math.floor((345210 + 96412 + 31979 + 492876) * 16384 / 1048576));
  });

  test.each([
    'Pages free', 'Pages speculative', 'Pages purgeable', 'File-backed pages', 'Pages stored in compressor', 'Pages occupied by compressor',
  ])('a vm_stat without "%s" throws naming the line', (label) => {
    const text = vmStatText().split('\n').filter(l => !l.startsWith(`${label}:`)).join('\n');
    expect(() => parseVmStat(text)).toThrow(new RegExp(`no "${label}" line`));
  });

  test('a vm_stat without the page-size header throws', () => {
    expect(() => parseVmStat('Pages free: 10.\n')).toThrow(/page size/);
  });

  test('parseMemsize reads bytes and rejects garbage', () => {
    expect(parseMemsize('51539607552\n')).toBe(49152);
    expect(() => parseMemsize('nope')).toThrow(/hw\.memsize/);
  });

  test('readMemory calls vm_stat and sysctl with argv arrays', () => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, args]);
      return cmd === 'vm_stat' ? vmStatText() : '51539607552\n';
    };
    const mem = readMemory({ run });
    expect(calls).toEqual([['vm_stat', []], ['sysctl', ['-n', 'hw.memsize']]]);
    expect(mem.total_mb).toBe(49152);
    expect(mem.free_mb).toBe(1200);
  });

  test('a failing vm_stat propagates; free RAM above total RAM is refused', () => {
    expect(() => readMemory({ run: () => { throw new Error('vm_stat: not found'); } })).toThrow('vm_stat: not found');
    const run = (cmd) => (cmd === 'vm_stat' ? vmStatText({ freeMb: 90000 }) : '51539607552\n');
    expect(() => readMemory({ run })).toThrow(/exceeds hw\.memsize/);
  });
});
