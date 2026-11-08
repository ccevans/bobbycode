// test/lib/owner.test.js
import os from 'os';
import matter from 'gray-matter';
import {
  machineName, HANDOFF_SECTIONS, parseHandoff, unfilledSections, renderHandoffTemplate,
} from '../../lib/owner.js';
import { groupInFlightByOwner } from '../../lib/brief.js';

const names = HANDOFF_SECTIONS.map(([n]) => n);
const filled = (skip = []) => names
  .map(n => `## ${n}\n\n${skip.includes(n) ? 'TODO(handoff): hint' : 'done'}\n`).join('\n');

describe('machineName', () => {
  test('darwin reads scutil ComputerName and trims', () => {
    let called;
    const run = (cmd, args) => { called = [cmd, args]; return 'Studio M4\n'; };
    expect(machineName({ platform: 'darwin', run })).toBe('Studio M4');
    expect(called).toEqual(['scutil', ['--get', 'ComputerName']]);
  });
  test('darwin failure is an explicit error', () => {
    expect(() => machineName({ platform: 'darwin', run: () => { throw new Error('nope'); } }))
      .toThrow(/scutil --get ComputerName.*nope/);
  });
  test('darwin empty result is an error', () => {
    expect(() => machineName({ platform: 'darwin', run: () => '' })).toThrow(/scutil --get ComputerName/);
  });
  test('other platforms use the hostname', () => {
    expect(machineName({ platform: 'linux' })).toBe(os.hostname().trim());
  });
});

describe('handoff sections', () => {
  test('six sections, in order', () => {
    expect(names).toEqual(['Where it stopped', 'Branch and commit', 'Unpushed patches',
      'Resources held', 'Open decisions for the human', 'Next step']);
  });

  test('parseHandoff reads section bodies and ignores other headings', () => {
    const parsed = parseHandoff(`# T\n\n## Where it stopped\n\nstep 3\n\n## Earlier notes\n\nx\n`);
    expect([...parsed.keys()]).toEqual(['Where it stopped']);
    expect(parsed.get('Where it stopped')).toBe('step 3');
  });

  test('unfilledSections reports missing, empty and placeholder sections', () => {
    expect(unfilledSections(filled())).toEqual([]);
    expect(unfilledSections(filled(['Next step']))).toEqual(['Next step']);
    expect(unfilledSections('')).toEqual(names);
    expect(unfilledSections(filled().replace(/## Next step\n\ndone\n/, '## Next step\n\n'))).toEqual(['Next step']);
  });

  test('"none" counts as filled', () => {
    expect(unfilledSections(filled().replace('done', 'none'))).toEqual([]);
  });

  test('template has all six placeholders in order', () => {
    const t = renderHandoffTemplate('TKT-001', '');
    const idx = names.map(n => t.indexOf(`## ${n}`));
    expect(idx.every(i => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(unfilledSections(t)).toEqual(names);
    expect(t).toContain('TODO(handoff):');
    expect(t).not.toContain('Earlier notes');
  });

  test('template keeps existing free-form text under Earlier notes', () => {
    const t = renderHandoffTemplate('TKT-001', 'checkpoint: halfway through step 3');
    expect(t).toContain('## Earlier notes\n\ncheckpoint: halfway through step 3');
    expect(unfilledSections(t)).toEqual(names);
  });

  test('template appends only the missing sections', () => {
    const existing = '## Where it stopped\n\nreal text\n';
    const t = renderHandoffTemplate('TKT-001', existing);
    expect(t.match(/## Where it stopped/g)).toHaveLength(1);
    expect(unfilledSections(t)).toEqual(names.slice(1));
  });
});

describe('owner frontmatter round-trip', () => {
  test('since stays an ISO string through gray-matter', () => {
    const since = new Date().toISOString();
    const out = matter.stringify('body', { id: 'TKT-1', owner: { session: 's', machine: null, since } });
    const back = matter(out).data.owner;
    expect(back.since).toBe(since);
    expect(typeof back.since).toBe('string');
    expect(back.machine).toBeNull();
  });
});

describe('groupInFlightByOwner', () => {
  const t = (id, owner) => ({ id, owner });
  test('null when nothing is owned', () => {
    expect(groupInFlightByOwner([t('A'), t('B', { session: null })])).toBeNull();
  });
  test('groups by machine then session, null machine last, unowned apart', () => {
    const g = groupInFlightByOwner([
      t('1', { session: 'studio-27', machine: 'M4' }),
      t('2', { session: 'intel-2', machine: 'Intel MBP' }),
      t('3', { session: 'studio-28', machine: 'M4' }),
      t('4'),
      t('5', { session: 'x', machine: null }),
      t('6', { session: 'studio-27', machine: 'M4' }),
    ]);
    expect(g.machines.map(m => m.machine)).toEqual(['Intel MBP', 'M4', null]);
    const m4 = g.machines[1];
    expect(m4.sessions.map(s => s.session)).toEqual(['studio-27', 'studio-28']);
    expect(m4.sessions[0].tickets.map(x => x.id)).toEqual(['1', '6']);
    expect(g.unowned.map(x => x.id)).toEqual(['4']);
  });
});
