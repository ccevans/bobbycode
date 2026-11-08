import { ticketKeyFromProject, readStacks, mapStacks, laneStateFor } from '../../../lib/conductor/stacks.js';
import { psLine } from './helpers.js';

const NOW = Date.parse('2026-11-08T12:00:00Z');

function dockerMock({ ps, inspect, fail }) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, args]);
    if (fail) throw new Error(fail);
    return args[0] === 'ps' ? ps : inspect;
  };
  return { run, calls };
}

describe('conductor stacks', () => {
  test.each([
    ['rf-1683api', 'RF-1683'],
    ['rf-1123-rcapi', 'RF-1123'],
    ['rf-1279-switchapi', 'RF-1279'],
    ['bob-175api', 'BOB-175'],
    ['ops-005api', 'OPS-5'],
    ['promote-api-mainapi', null],
    ['listrobin_api', null],
    ['rf-1683', null],
    ['rf-api', null],
  ])('project %s maps to ticket %s by the new-api-worktree.sh naming', (project, ticket) => {
    expect(ticketKeyFromProject(project)).toBe(ticket);
  });

  test('stacks group by compose project label; a comma-laden config_files label does not confuse it', () => {
    const ps = [psLine('a1', 'rf-1683api'), psLine('a2', 'rf-1683api'), psLine('b1', 'rf-1745api'), psLine('c1', null)].join('\n');
    const inspect = [
      '2026-11-08T11:00:00.000000000Z', '2026-11-08T10:00:00.000000000Z', // rf-1683api: newest = 11:00
      '2026-11-08T06:00:00.000000000Z',
      '2026-11-08T11:59:00.000000000Z', // standalone
    ].join('\n');
    const { run, calls } = dockerMock({ ps, inspect });
    const out = readStacks({ run, now: NOW });
    expect(calls[0]).toEqual(['docker', ['ps', '--format', 'json']]);
    expect(calls[1][1].slice(0, 2)).toEqual(['inspect', '--format']);
    expect(out.standalone_containers).toBe(1);
    expect(out.stacks).toEqual([
      { project: 'rf-1683api', containers: 2, newest_start: '2026-11-08T11:00:00.000Z', idle_ms: 3600000 },
      { project: 'rf-1745api', containers: 1, newest_start: '2026-11-08T06:00:00.000Z', idle_ms: 6 * 3600000 },
    ]);
  });

  test('no running containers is zero stacks and never calls inspect', () => {
    const { run, calls } = dockerMock({ ps: '', inspect: '' });
    expect(readStacks({ run, now: NOW })).toEqual({ stacks: [], standalone_containers: 0 });
    expect(calls).toHaveLength(1);
  });

  test('a docker failure throws the docker error, not zero stacks', () => {
    const { run } = dockerMock({ fail: 'Cannot connect to the Docker daemon' });
    expect(() => readStacks({ run, now: NOW })).toThrow(/Cannot connect to the Docker daemon/);
  });

  test('unparseable ps output, a short inspect result and a bad start time all throw', () => {
    expect(() => readStacks({ run: dockerMock({ ps: 'not json' }).run })).toThrow(/unparseable line/);
    expect(() => readStacks({ run: dockerMock({ ps: psLine('a', 'rf-1api'), inspect: '' }).run })).toThrow(/0 start times for 1 containers/);
    expect(() => readStacks({ run: dockerMock({ ps: psLine('a', 'rf-1api'), inspect: 'soon' }).run })).toThrow(/unparseable start time/);
    expect(() => readStacks({ run: dockerMock({ ps: '{"ID":"a"}' }).run })).toThrow(/without string/);
  });

  describe('mapping to tickets and lanes', () => {
    const tickets = new Map([['RF-1683', { id: 'RF-1683', project: 'robinflow', stage: 'building' }], ['OPS-5', { id: 'OPS-005', project: 'ops', stage: 'testing' }]]);
    const sessions = [
      { name: 'rf-1683 api lane', cwd: '/studio', state: 'working' },
      { name: 'other', cwd: '/studio/worktrees/RF-1745-api', state: 'blocked' },
      { name: 'RF-1799 old', cwd: '/studio', state: 'done' },
    ];
    const base = { containers: 3, newest_start: 'x', idle_ms: 0 };

    test('a project whose ticket is on a board maps; others are unmapped and carry no lane', () => {
      const out = mapStacks([
        { project: 'rf-1683api', ...base }, { project: 'rf-1745api', ...base }, { project: 'promote-api-mainapi', ...base },
      ], { tickets, sessions });
      expect(out[0]).toMatchObject({ ticket: 'RF-1683', unmapped: false, ticket_stage: 'building', lane: 'working' });
      expect(out[1]).toMatchObject({ ticket: null, unmapped: true, lane: null });
      expect(out[2]).toMatchObject({ ticket: null, unmapped: true, lane: null });
    });

    test('a zero-padded board ID meets the script-made project name', () => {
      const out = mapStacks([{ project: 'ops-005api', ...base }], { tickets, sessions });
      expect(out[0]).toMatchObject({ ticket: 'OPS-005', unmapped: false, ticket_stage: 'testing' });
    });

    test('lane state: working beats waiting beats done; ids match whole numbers only; none when no session names it', () => {
      expect(laneStateFor('RF-1745', sessions)).toBe('waiting_on_cc');
      expect(laneStateFor('RF-1799', sessions)).toBe('done');
      expect(laneStateFor('RF-168', sessions)).toBe('none'); // RF-1683 must not count for RF-168
      expect(laneStateFor('RF-1', sessions)).toBe('none');
    });
  });
});
