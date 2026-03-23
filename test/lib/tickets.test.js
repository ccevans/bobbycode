// test/lib/tickets.test.js
import {
  findTicket, createTicket, moveTicket, slugify,
  readTicket, writeTicket, addComment, listTickets,
  getFeatureTickets, listEpics,
} from '../../lib/tickets.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

describe('tickets', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-tickets-'));
    // Single tickets directory (no stage folders)
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('slugify converts title to URL-safe slug', () => {
    expect(slugify('Fix Login Page')).toBe('fix-login-page');
    expect(slugify('Add  multiple--dashes')).toBe('add-multiple-dashes');
    expect(slugify('Special!@#chars')).toBe('special-chars');
  });

  test('createTicket creates folder in tickets directory with frontmatter', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Fix login bug',
      type: 'bug',
      priority: 'high',
      author: 'QE',
      area: 'auth',
    });
    expect(result.id).toBe('TKT-001');
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.existsSync(path.join(result.path, 'ticket.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.path, 'test-cases.md'))).toBe(true);

    // Verify frontmatter
    const ticket = readTicket(result.path);
    expect(ticket.data.id).toBe('TKT-001');
    expect(ticket.data.title).toBe('Fix login bug');
    expect(ticket.data.stage).toBe('backlog');
    expect(ticket.data.type).toBe('bug');
    expect(ticket.data.priority).toBe('high');
    expect(ticket.data.author).toBe('QE');
    expect(ticket.data.area).toBe('auth');
    expect(ticket.data.blocked).toBe(false);
  });

  test('createTicket supports parent option', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Sub-task',
      type: 'feature',
      priority: 'medium',
      author: 'dev',
      area: '',
      parent: 'TKT-001',
    });
    const ticket = readTicket(result.path);
    expect(ticket.data.parent).toBe('TKT-001');
  });

  test('createTicket defaults type to feature and priority to medium', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Default opts',
      author: 'dev',
      area: '',
    });
    const ticket = readTicket(result.path);
    expect(ticket.data.type).toBe('feature');
    expect(ticket.data.priority).toBe('medium');
  });

  test('readTicket and writeTicket round-trip frontmatter', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Round trip',
      author: 'dev',
      area: '',
    });
    const ticket = readTicket(result.path);
    expect(ticket.data.title).toBe('Round trip');

    // Modify and write back
    ticket.data.stage = 'building';
    writeTicket(result.path, ticket.data, ticket.content);

    const reread = readTicket(result.path);
    expect(reread.data.stage).toBe('building');
    expect(reread.data.title).toBe('Round trip');
  });

  test('findTicket locates ticket in single directory', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT', title: 'Test find', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('backlog');
    expect(found.path).toBe(result.path);
    expect(found.data.title).toBe('Test find');
  });

  test('findTicket returns null for missing ticket', () => {
    const found = findTicket(tmpDir, 'TKT-999');
    expect(found).toBeNull();
  });

  test('listTickets returns all tickets', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
    createTicket(tmpDir, { prefix: 'TKT', title: 'B', author: 'dev', area: '' });
    const all = listTickets(tmpDir);
    expect(all).toHaveLength(2);
  });

  test('listTickets filters by stage', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
    createTicket(tmpDir, { prefix: 'TKT', title: 'B', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');

    const backlog = listTickets(tmpDir, { stage: 'backlog' });
    expect(backlog).toHaveLength(1);
    expect(backlog[0].id).toBe('TKT-002');

    const building = listTickets(tmpDir, { stage: 'building' });
    expect(building).toHaveLength(1);
    expect(building[0].id).toBe('TKT-001');
  });

  test('listTickets returns empty array for nonexistent dir', () => {
    const result = listTickets(path.join(tmpDir, 'nope'));
    expect(result).toEqual([]);
  });

  test('moveTicket updates frontmatter stage', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Move test', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    moveTicket(tmpDir, 'TKT-001', 'building', 'engineer', 'Started work');
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('building');

    // Verify frontmatter was updated
    const ticket = readTicket(found.path);
    expect(ticket.data.stage).toBe('building');

    // Verify comment was appended
    const raw = fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8');
    expect(raw).toContain('Started work');
  });

  test('moveTicket to blocked sets blocked fields', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Block test', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev', 'Waiting on API');

    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('blocked');
    expect(found.data.blocked).toBe(true);
    expect(found.data.blocked_reason).toBe('Waiting on API');
    expect(found.data.previous_stage).toBe('building');
  });

  test('moveTicket from blocked clears blocked fields', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Unblock test', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev', 'Waiting');
    moveTicket(tmpDir, 'TKT-001', 'backlog', 'dev', 'Unblocked');

    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.data.blocked).toBe(false);
    expect(found.data.blocked_reason).toBeNull();
    expect(found.data.previous_stage).toBeNull();
  });

  test('moveTicket is a no-op if already in target stage', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Noop', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    const result = moveTicket(tmpDir, 'TKT-001', 'backlog', 'dev');
    expect(result.stage).toBe('backlog');
  });

  test('moveTicket throws for invalid stage', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Bad move', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    expect(() => moveTicket(tmpDir, 'TKT-001', 'fake-stage', 'dev')).toThrow('Invalid stage');
  });

  test('moveTicket throws for missing ticket', () => {
    expect(() => moveTicket(tmpDir, 'TKT-999', 'building', 'dev')).toThrow('not found');
  });

  test('addComment appends to ticket without changing stage', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Comment test', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    addComment(tmpDir, 'TKT-001', 'engineer', 'This is a note');

    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('backlog');
    const raw = fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8');
    expect(raw).toContain('This is a note');
    expect(raw).toContain('engineer');
  });

  test('addComment throws for missing ticket', () => {
    expect(() => addComment(tmpDir, 'TKT-999', 'dev', 'nope')).toThrow('not found');
  });

  test('moveTicket clears assigned field', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Assign clear', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    // Simulate agent assignment
    const found = findTicket(tmpDir, 'TKT-001');
    writeTicket(found.path, { ...found.data, assigned: 'bobby-plan' }, found.content);

    // Verify assigned
    const before = findTicket(tmpDir, 'TKT-001');
    expect(before.data.assigned).toBe('bobby-plan');

    // Move should clear assignment
    moveTicket(tmpDir, 'TKT-001', 'planning', 'dev');
    const after = findTicket(tmpDir, 'TKT-001');
    expect(after.data.assigned).toBeNull();
  });

  test('listTickets returns assigned field for filtering', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
    createTicket(tmpDir, { prefix: 'TKT', title: 'B', author: 'dev', area: '' });

    // Assign one ticket
    const found = findTicket(tmpDir, 'TKT-001');
    writeTicket(found.path, { ...found.data, assigned: 'bobby-build' }, found.content);

    const all = listTickets(tmpDir);
    const assigned = all.filter(t => t.assigned);
    const unassigned = all.filter(t => !t.assigned);
    expect(assigned).toHaveLength(1);
    expect(assigned[0].id).toBe('TKT-001');
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].id).toBe('TKT-002');
  });

  describe('getFeatureTickets', () => {
    test('returns sorted children for an epic', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Low task', priority: 'low', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'High task', priority: 'high', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Critical task', priority: 'critical', author: 'dev', area: '', parent: 'TKT-001' });

      const { epic, children } = getFeatureTickets(tmpDir, 'TKT-001');
      expect(epic.data.type).toBe('epic');
      expect(children).toHaveLength(3);
      // All in backlog, so sorted by priority: critical, high, low
      expect(children[0].id).toBe('TKT-004');
      expect(children[1].id).toBe('TKT-003');
      expect(children[2].id).toBe('TKT-002');
    });

    test('in-progress tickets sort before backlog tickets', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Backlog task', priority: 'high', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Building task', priority: 'low', author: 'dev', area: '', parent: 'TKT-001' });
      moveTicket(tmpDir, 'TKT-003', 'building', 'dev');

      const { children } = getFeatureTickets(tmpDir, 'TKT-001');
      // Building (stage 4) sorts before backlog (stage 6), regardless of priority
      expect(children[0].id).toBe('TKT-003');
      expect(children[1].id).toBe('TKT-002');
    });

    test('uses ID as tiebreaker when stage and priority match', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Task A', priority: 'medium', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Task B', priority: 'medium', author: 'dev', area: '', parent: 'TKT-001' });

      const { children } = getFeatureTickets(tmpDir, 'TKT-001');
      expect(children[0].id).toBe('TKT-002');
      expect(children[1].id).toBe('TKT-003');
    });

    test('throws if ticket is not an epic', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Not epic', type: 'feature', author: 'dev', area: '' });
      expect(() => getFeatureTickets(tmpDir, 'TKT-001')).toThrow('not an epic');
    });

    test('throws if ticket not found', () => {
      expect(() => getFeatureTickets(tmpDir, 'TKT-999')).toThrow('not found');
    });

    test('returns empty children for epic with no children', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Lonely epic', type: 'epic', author: 'dev', area: '' });
      const { children } = getFeatureTickets(tmpDir, 'TKT-001');
      expect(children).toHaveLength(0);
    });
  });

  describe('listEpics', () => {
    test('returns epics with child count and stage summary', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'My Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child A', parent: 'TKT-001', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child B', parent: 'TKT-001', author: 'dev', area: '' });
      moveTicket(tmpDir, 'TKT-003', 'building', 'dev');

      const epics = listEpics(tmpDir);
      expect(epics).toHaveLength(1);
      expect(epics[0].id).toBe('TKT-001');
      expect(epics[0].childCount).toBe(2);
      expect(epics[0].stageSummary).toContain('backlog');
      expect(epics[0].stageSummary).toContain('building');
    });

    test('returns empty array when no epics exist', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Not epic', author: 'dev', area: '' });
      const epics = listEpics(tmpDir);
      expect(epics).toHaveLength(0);
    });

    test('shows "no children" for epic without children', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Empty epic', type: 'epic', author: 'dev', area: '' });
      const epics = listEpics(tmpDir);
      expect(epics[0].stageSummary).toBe('no children');
      expect(epics[0].childCount).toBe(0);
    });
  });
});
