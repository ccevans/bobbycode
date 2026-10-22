// test/lib/sizing.test.js — ticket size picks the pipeline; freewill refuses what it shouldn't run.
import { TICKET_SIZES, assertSize, workflowNameForTicket, freewillRefusal, resolveWorkflow } from '../../lib/workflow.js';

describe('ticket size', () => {
  test('known sizes pass, anything else is an error naming the valid ones', () => {
    for (const s of TICKET_SIZES) expect(assertSize(s)).toBe(s);
    expect(() => assertSize('huge')).toThrow(/xs, s, m, l, xl/);
  });

  test('xs runs quick by default; other sizes keep the run default', () => {
    expect(workflowNameForTicket({}, { size: 'xs' })).toBe('quick');
    for (const s of ['s', 'm', 'l', 'xl']) expect(workflowNameForTicket({}, { size: s })).toBeNull();
    expect(resolveWorkflow({}, 'default', workflowNameForTicket({}, { size: 'xs' })).map(x => x.agent))
      .toEqual(['bobby-plan', 'bobby-build', 'bobby-test']);
  });

  test("a ticket's own workflow always beats its size", () => {
    expect(workflowNameForTicket({}, { size: 'xs', workflow: 'secure' })).toBe('secure');
  });

  test('projects can remap sizes', () => {
    expect(workflowNameForTicket({ sizing: { s: 'quick', xs: 'default' } }, { size: 's' })).toBe('quick');
    expect(workflowNameForTicket({ sizing: { xs: 'default' } }, { size: 'xs' })).toBe('default');
  });

  test('no size, no workflow: nothing to say', () => {
    expect(workflowNameForTicket({}, {})).toBeNull();
  });
});

describe('freewill refuses the tickets that need the full pipeline', () => {
  test.each([
    [{ type: 'epic' }, /epic/],
    [{ workflow: 'secure' }, /secure/],
    [{ area: 'security' }, /security/],
    [{ size: 'l' }, /size l/],
    [{ size: 'xl' }, /size xl/],
  ])('%j', (data, why) => {
    expect(freewillRefusal(data)).toMatch(why);
  });

  test('a clear, small ticket may run on freewill', () => {
    expect(freewillRefusal({ size: 's', type: 'feature' })).toBeNull();
    expect(freewillRefusal({})).toBeNull();
  });
});
