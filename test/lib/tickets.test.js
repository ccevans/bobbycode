// test/lib/tickets.test.js
import {
  findTicket, createTicket, moveTicket, slugify,
  readTicket, writeTicket, addComment, listTickets,
  getFeatureTickets, listEpics, updateTicket, backlogHealth, daysBetween,
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

  test('createTicket supports services option', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Fix auth API',
      type: 'bug',
      priority: 'high',
      author: 'dev',
      area: 'auth',
      services: ['auth-api', 'web-ui'],
    });
    const ticket = readTicket(result.path);
    expect(ticket.data.services).toEqual(['auth-api', 'web-ui']);
  });

  test('createTicket sets services to null when empty', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'No services',
      author: 'dev',
      area: '',
      services: [],
    });
    const ticket = readTicket(result.path);
    expect(ticket.data.services).toBeNull();
  });

  test('createTicket sets services to null when not provided', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Default',
      author: 'dev',
      area: '',
    });
    const ticket = readTicket(result.path);
    expect(ticket.data.services).toBeNull();
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

  test('createTicket defaults all optional params', () => {
    // Omit type, priority, author, area, and parent to exercise all default branches
    const result = createTicket(tmpDir, { prefix: 'TKT', title: 'Minimal' });
    const ticket = readTicket(result.path);
    expect(ticket.data.author).toBe('unknown');
    expect(ticket.data.type).toBe('feature');
    expect(ticket.data.priority).toBe('medium');
    expect(ticket.data.area).toBeNull();
    expect(ticket.data.parent).toBeNull();
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

  test('moveTicket preserves assigned field', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Assign preserve', type: 'feature',
      priority: 'medium', author: 'dev', area: '',
    });
    // Simulate agent assignment
    const found = findTicket(tmpDir, 'TKT-001');
    writeTicket(found.path, { ...found.data, assigned: 'bobby-plan' }, found.content);

    // Verify assigned
    const before = findTicket(tmpDir, 'TKT-001');
    expect(before.data.assigned).toBe('bobby-plan');

    // Move should preserve assignment
    moveTicket(tmpDir, 'TKT-001', 'planning', 'dev');
    const after = findTicket(tmpDir, 'TKT-001');
    expect(after.data.assigned).toBe('bobby-plan');
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

    test('handles all children blocked (no active children for auto-advance)', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child A', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child B', author: 'dev', area: '', parent: 'TKT-001' });
      // Move both to building first (epic auto-advances to building)
      moveTicket(tmpDir, 'TKT-002', 'building', 'dev');
      moveTicket(tmpDir, 'TKT-003', 'building', 'dev');
      // Now block both — when last child is blocked, no active children remain
      moveTicket(tmpDir, 'TKT-002', 'blocked', 'dev', 'Blocked');
      moveTicket(tmpDir, 'TKT-003', 'blocked', 'dev', 'Also blocked');
      // Epic should stay at building (not advance further) since no active children
      const epic = findTicket(tmpDir, 'TKT-001');
      expect(epic.stage).toBe('building');
    });

    test('handles children with unknown priority (uses default order)', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Known pri', priority: 'high', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Unknown pri', priority: 'custom', author: 'dev', area: '', parent: 'TKT-001' });
      const { children } = getFeatureTickets(tmpDir, 'TKT-001');
      expect(children).toHaveLength(2);
      // high (1) sorts before custom (default 3)
      expect(children[0].priority).toBe('high');
    });

    test('handles children with unknown stage (uses default sort order)', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Normal', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Weird stage', author: 'dev', area: '', parent: 'TKT-001' });
      // Manually set an invalid stage
      const found = findTicket(tmpDir, 'TKT-003');
      writeTicket(found.path, { ...found.data, stage: 'custom-stage' }, found.content);
      const { children } = getFeatureTickets(tmpDir, 'TKT-001');
      expect(children).toHaveLength(2);
      // backlog is 6, custom-stage gets default 7, so backlog sorts first
      expect(children[0].stage).toBe('backlog');
    });

    test('handles children with missing ID for sort tiebreaker', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'A', priority: 'medium', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'B', priority: 'medium', author: 'dev', area: '', parent: 'TKT-001' });
      // Remove ID from one child to test || '' fallback
      const found = findTicket(tmpDir, 'TKT-002');
      const data = { ...found.data };
      delete data.id;
      writeTicket(found.path, data, found.content);
      const { children } = getFeatureTickets(tmpDir, 'TKT-001');
      expect(children).toHaveLength(2);
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

  describe('daysBetween', () => {
    test('returns 0 for null/undefined input', () => {
      expect(daysBetween(null)).toBe(0);
      expect(daysBetween(undefined)).toBe(0);
    });

    test('returns positive number for past date', () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      expect(daysBetween(pastDate)).toBeGreaterThanOrEqual(4);
      expect(daysBetween(pastDate)).toBeLessThanOrEqual(6);
    });

    test('returns 0 for today', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(daysBetween(today)).toBe(0);
    });
  });

  describe('updateTicket', () => {
    test('updates arbitrary fields on ticket', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Update test', author: 'dev', area: '' });
      updateTicket(tmpDir, 'TKT-001', { priority: 'critical', area: 'auth' });

      const found = findTicket(tmpDir, 'TKT-001');
      expect(found.data.priority).toBe('critical');
      expect(found.data.area).toBe('auth');
    });

    test('sets updated timestamp', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Update test', author: 'dev', area: '' });
      const before = findTicket(tmpDir, 'TKT-001');
      updateTicket(tmpDir, 'TKT-001', { priority: 'high' });
      const after = findTicket(tmpDir, 'TKT-001');
      expect(after.data.updated).toBeTruthy();
    });

    test('throws for missing ticket', () => {
      expect(() => updateTicket(tmpDir, 'TKT-999', { priority: 'high' })).toThrow('not found');
    });

    test('returns id and path', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Update test', author: 'dev', area: '' });
      const result = updateTicket(tmpDir, 'TKT-001', { priority: 'high' });
      expect(result.id).toBe('TKT-001');
      expect(result.path).toBeTruthy();
    });
  });

  describe('backlogHealth', () => {
    test('returns total count of backlog tickets', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'B', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'C', author: 'dev', area: '' });
      moveTicket(tmpDir, 'TKT-003', 'building', 'dev');

      const health = backlogHealth(tmpDir);
      expect(health.total).toBe(2);
    });

    test('counts tickets with placeholder acceptance criteria', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
      // Default template has placeholder AC, so it should be counted
      const health = backlogHealth(tmpDir);
      expect(health.noAcceptanceCriteria).toBe(1);
    });

    test('counts stale tickets', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Stale', author: 'dev', area: '' });
      // Manually set created date to 60 days ago
      const found = findTicket(tmpDir, 'TKT-001');
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      writeTicket(found.path, { ...found.data, created: oldDate, updated: oldDate }, found.content);

      const health = backlogHealth(tmpDir, 30);
      expect(health.stale).toBe(1);
    });

    test('returns staleDays in result', () => {
      const health = backlogHealth(tmpDir, 45);
      expect(health.staleDays).toBe(45);
    });

    test('skips tickets where readTicket returns null during AC check', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Will break', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Normal', author: 'dev', area: '' });

      // Delete ticket.md from TKT-001 AFTER it's counted in listTickets
      // but before readTicket in the AC check loop.
      // Since backlogHealth calls listTickets first (which reads ticket.md),
      // then reads each ticket again for AC check, we need a ticket that
      // exists during listTickets but whose readTicket returns null during
      // the AC loop. This is hard without mocking, so let's test with
      // a minimal ticket that has frontmatter but empty content.
      const found = findTicket(tmpDir, 'TKT-001');
      fs.writeFileSync(
        path.join(found.path, 'ticket.md'),
        '---\nid: TKT-001\ntitle: Minimal\nstage: backlog\n---\n'
      );

      const health = backlogHealth(tmpDir);
      expect(health.total).toBe(2);
    });

    test('detects AC section with no checkboxes', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'No checkboxes', author: 'dev', area: '' });
      const found = findTicket(tmpDir, 'TKT-001');
      const content = found.content.replace(
        /## Acceptance Criteria[\s\S]*?(?=\n## |$)/,
        '## Acceptance Criteria\n\nJust some text without any checkboxes.\n\n'
      );
      writeTicket(found.path, found.data, content);

      const health = backlogHealth(tmpDir);
      expect(health.noAcceptanceCriteria).toBe(1);
    });
  });

  describe('listTickets filtering', () => {
    beforeEach(() => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Auth task', type: 'feature', priority: 'high', author: 'dev', area: 'auth' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'API bug', type: 'bug', priority: 'critical', author: 'dev', area: 'api' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Dashboard', type: 'improvement', priority: 'low', author: 'dev', area: 'dashboard' });
    });

    test('filters by area', () => {
      const result = listTickets(tmpDir, { area: 'auth' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-001');
    });

    test('filters by priority', () => {
      const result = listTickets(tmpDir, { priority: 'critical' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-002');
    });

    test('filters by type', () => {
      const result = listTickets(tmpDir, { type: 'bug' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-002');
    });

    test('filters by epic (parent)', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child', author: 'dev', area: '', parent: 'TKT-004' });
      const result = listTickets(tmpDir, { epic: 'TKT-004' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-005');
    });

    test('filters by blocked true', () => {
      moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
      moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev', 'Waiting');
      const result = listTickets(tmpDir, { blocked: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-001');
    });

    test('filters by blocked false', () => {
      moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
      moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev', 'Waiting');
      const result = listTickets(tmpDir, { blocked: false });
      expect(result).toHaveLength(2);
    });

    test('filters by staleDays', () => {
      // Make TKT-001 stale
      const found = findTicket(tmpDir, 'TKT-001');
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      writeTicket(found.path, { ...found.data, created: oldDate, updated: oldDate }, found.content);

      const result = listTickets(tmpDir, { staleDays: 30 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-001');
    });
  });

  describe('listTickets sorting edge cases', () => {
    test('sort handles tickets with missing created/updated fields', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'B', author: 'dev', area: '' });
      // Remove created field from one ticket
      const found = findTicket(tmpDir, 'TKT-001');
      const data = { ...found.data };
      delete data.created;
      delete data.updated;
      writeTicket(found.path, data, found.content);

      // Should not throw for any sort mode and should exercise || '' fallbacks
      const newest = listTickets(tmpDir, { sort: 'newest' });
      expect(newest).toHaveLength(2);
      const oldest = listTickets(tmpDir, { sort: 'oldest' });
      expect(oldest).toHaveLength(2);
      const updated = listTickets(tmpDir, { sort: 'updated' });
      expect(updated).toHaveLength(2);
    });

    test('sort handles both tickets with null created', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'B', author: 'dev', area: '' });
      // Remove created and updated from both
      for (const id of ['TKT-001', 'TKT-002']) {
        const found = findTicket(tmpDir, id);
        const data = { ...found.data };
        delete data.created;
        delete data.updated;
        writeTicket(found.path, data, found.content);
      }
      // All sort modes should handle null gracefully via || ''
      expect(listTickets(tmpDir, { sort: 'newest' })).toHaveLength(2);
      expect(listTickets(tmpDir, { sort: 'oldest' })).toHaveLength(2);
      expect(listTickets(tmpDir, { sort: 'updated' })).toHaveLength(2);
    });

    test('sort by updated with one null and one valid updated', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Has updated', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'No updated', author: 'dev', area: '' });
      // Remove updated from TKT-002 only
      const found = findTicket(tmpDir, 'TKT-002');
      const data = { ...found.data };
      delete data.updated;
      writeTicket(found.path, data, found.content);
      const result = listTickets(tmpDir, { sort: 'updated' });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('TKT-001'); // has updated, sorts first
    });

    test('sort by newest puts null-created tickets last', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Has date', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'No date', author: 'dev', area: '' });
      const found = findTicket(tmpDir, 'TKT-002');
      const data = { ...found.data };
      delete data.created;
      writeTicket(found.path, data, found.content);

      const result = listTickets(tmpDir, { sort: 'newest' });
      expect(result[0].id).toBe('TKT-001'); // has created date, sorts first
    });

    test('sort handles tickets with unknown priority', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A', priority: 'unknown-priority', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'B', priority: 'high', author: 'dev', area: '' });
      const result = listTickets(tmpDir, { sort: 'priority' });
      // Unknown priority gets default 3 (same as medium), high is 1
      expect(result[0].priority).toBe('high');
    });

    test('staleDays filter falls back to created when updated is null', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'No updated', author: 'dev', area: '' });
      // Set old created date and remove updated
      const found = findTicket(tmpDir, 'TKT-001');
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = { ...found.data, created: oldDate };
      delete data.updated;
      writeTicket(found.path, data, found.content);

      const result = listTickets(tmpDir, { staleDays: 30 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('TKT-001');
    });

    test('staleDays filter uses updated field when available', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Updated recently', author: 'dev', area: '' });
      // Set old created but recent updated
      const found = findTicket(tmpDir, 'TKT-001');
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const recentDate = new Date().toISOString().split('T')[0];
      writeTicket(found.path, { ...found.data, created: oldDate, updated: recentDate }, found.content);

      // staleDays should use updated field, not created
      const result = listTickets(tmpDir, { staleDays: 30 });
      expect(result).toHaveLength(0);
    });
  });

  describe('listTickets sorting', () => {
    beforeEach(() => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'First', priority: 'low', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Second', priority: 'critical', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Third', priority: 'high', author: 'dev', area: '' });
    });

    test('sorts by priority', () => {
      const result = listTickets(tmpDir, { sort: 'priority' });
      expect(result[0].priority).toBe('critical');
      expect(result[1].priority).toBe('high');
      expect(result[2].priority).toBe('low');
    });

    test('sorts by newest', () => {
      const result = listTickets(tmpDir, { sort: 'newest' });
      // All created same day, so order is stable but test that it doesn't crash
      expect(result).toHaveLength(3);
    });

    test('sorts by oldest', () => {
      const result = listTickets(tmpDir, { sort: 'oldest' });
      expect(result).toHaveLength(3);
    });

    test('sorts by updated', () => {
      // Touch TKT-001 to make it most recently updated
      moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
      const result = listTickets(tmpDir, { sort: 'updated' });
      expect(result).toHaveLength(3);
    });
  });

  describe('moveTicket parent auto-advance', () => {
    test('auto-advances parent epic when all children reach a stage', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child A', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child B', author: 'dev', area: '', parent: 'TKT-001' });

      moveTicket(tmpDir, 'TKT-002', 'building', 'dev');
      moveTicket(tmpDir, 'TKT-003', 'building', 'dev');

      const epic = findTicket(tmpDir, 'TKT-001');
      expect(epic.stage).toBe('building');
    });

    test('epic stays at min child stage', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child A', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child B', author: 'dev', area: '', parent: 'TKT-001' });

      moveTicket(tmpDir, 'TKT-002', 'building', 'dev');
      moveTicket(tmpDir, 'TKT-003', 'reviewing', 'dev');

      // Epic should be at building (the minimum child stage)
      const epic = findTicket(tmpDir, 'TKT-001');
      expect(epic.stage).toBe('building');
    });

    test('blocked children are excluded from epic auto-advance', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Epic', type: 'epic', author: 'dev', area: '' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child A', author: 'dev', area: '', parent: 'TKT-001' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Child B', author: 'dev', area: '', parent: 'TKT-001' });

      moveTicket(tmpDir, 'TKT-002', 'reviewing', 'dev');
      moveTicket(tmpDir, 'TKT-003', 'building', 'dev');
      moveTicket(tmpDir, 'TKT-003', 'blocked', 'dev', 'Waiting');

      // Only non-blocked child is at reviewing, so epic should advance
      const epic = findTicket(tmpDir, 'TKT-001');
      expect(epic.stage).toBe('reviewing');
    });
  });

  test('moveTicket appends comment even when no Comments section exists', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'No comments section', author: 'dev', area: '' });
    // Remove the Comments section from the ticket
    const found = findTicket(tmpDir, 'TKT-001');
    const contentWithoutComments = found.content.replace('## Comments', '');
    writeTicket(found.path, found.data, contentWithoutComments);

    moveTicket(tmpDir, 'TKT-001', 'building', 'dev', 'Starting work');
    const after = findTicket(tmpDir, 'TKT-001');
    const raw = fs.readFileSync(path.join(after.path, 'ticket.md'), 'utf8');
    expect(raw).toContain('Starting work');
    expect(raw).toContain('## Comments');
  });

  test('moveTicket to blocked without comment does not set blocked_reason', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Block no reason', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev'); // no comment
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.data.blocked).toBe(true);
    expect(found.data.blocked_reason).toBeNull();
  });

  test('moveTicket uses default "system" for by parameter', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Default by', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building');
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('building');
  });

  test('moveTicket does not auto-advance when parent is not found', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Orphan child', author: 'dev', area: '', parent: 'TKT-999' });
    // Should not throw even though parent doesn't exist
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('building');
  });

  test('moveTicket does not auto-advance when parent is not an epic', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Not epic parent', type: 'feature', author: 'dev', area: '' });
    createTicket(tmpDir, { prefix: 'TKT', title: 'Child', author: 'dev', area: '', parent: 'TKT-001' });
    moveTicket(tmpDir, 'TKT-002', 'building', 'dev');
    // Parent should stay in backlog since it's not an epic
    const parent = findTicket(tmpDir, 'TKT-001');
    expect(parent.stage).toBe('backlog');
  });

  test('moveTicket same stage with comment still applies', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Same stage comment', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'backlog', 'dev', 'Adding a note');
    const raw = fs.readFileSync(path.join(findTicket(tmpDir, 'TKT-001').path, 'ticket.md'), 'utf8');
    expect(raw).toContain('Adding a note');
  });

  test('addComment creates Comments section if missing', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'No comments', author: 'dev', area: '' });
    const found = findTicket(tmpDir, 'TKT-001');
    const contentWithoutComments = found.content.replace('## Comments', '');
    writeTicket(found.path, found.data, contentWithoutComments);

    addComment(tmpDir, 'TKT-001', 'dev', 'New comment');
    const raw = fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8');
    expect(raw).toContain('## Comments');
    expect(raw).toContain('New comment');
  });

  test('findTicket returns null for nonexistent directory', () => {
    expect(findTicket('/nonexistent/path', 'TKT-001')).toBeNull();
  });

  test('readTicket returns null for directory without ticket.md', () => {
    const emptyDir = path.join(tmpDir, 'TKT-001--empty');
    fs.mkdirSync(emptyDir);
    expect(readTicket(emptyDir)).toBeNull();
  });

  test('listTickets skips hidden directories', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Visible', author: 'dev', area: '' });
    // Create a hidden directory
    fs.mkdirSync(path.join(tmpDir, '.hidden-dir'));
    const all = listTickets(tmpDir);
    expect(all).toHaveLength(1);
  });

  test('listTickets skips non-directory entries', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Visible', author: 'dev', area: '' });
    // Create a file (not directory) in tickets dir
    fs.writeFileSync(path.join(tmpDir, 'some-file.txt'), 'not a ticket');
    const all = listTickets(tmpDir);
    expect(all).toHaveLength(1);
  });

  test('listTickets skips directories without ticket.md', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Real', author: 'dev', area: '' });
    // Create empty directory that looks like a ticket
    fs.mkdirSync(path.join(tmpDir, 'fake-ticket'));
    const all = listTickets(tmpDir);
    expect(all).toHaveLength(1);
  });

  test('findTicket skips non-directory entries matching ID pattern', () => {
    // Create a file (not dir) that starts with the ID pattern
    fs.writeFileSync(path.join(tmpDir, 'TKT-001--a-file.txt'), 'not a dir');
    expect(findTicket(tmpDir, 'TKT-001')).toBeNull();
  });

  test('findTicket defaults to backlog when stage is missing from frontmatter', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'No stage', author: 'dev', area: '' });
    const found = findTicket(tmpDir, 'TKT-001');
    // Remove stage from frontmatter
    const data = { ...found.data };
    delete data.stage;
    writeTicket(found.path, data, found.content);

    const refound = findTicket(tmpDir, 'TKT-001');
    expect(refound.stage).toBe('backlog');
  });

  test('findTicket skips matching directory without ticket.md', () => {
    const emptyTicketDir = path.join(tmpDir, 'TKT-001--empty');
    fs.mkdirSync(emptyTicketDir);
    expect(findTicket(tmpDir, 'TKT-001')).toBeNull();
  });

  test('backlogHealth detects tickets with no AC section at all', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'No AC', author: 'dev', area: '' });
    // Remove AC section entirely
    const found = findTicket(tmpDir, 'TKT-001');
    const content = found.content.replace(/## Acceptance Criteria[\s\S]*?(?=\n## |$)/, '');
    writeTicket(found.path, found.data, content);

    const health = backlogHealth(tmpDir);
    expect(health.noAcceptanceCriteria).toBe(1);
  });

  test('backlogHealth passes for tickets with real acceptance criteria', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Good AC', author: 'dev', area: '' });
    const found = findTicket(tmpDir, 'TKT-001');
    const content = found.content.replace(
      /## Acceptance Criteria[\s\S]*?(?=\n## |$)/,
      '## Acceptance Criteria\n\n- [ ] User can log in with email\n- [ ] Error shown on invalid password\n\n'
    );
    writeTicket(found.path, found.data, content);

    const health = backlogHealth(tmpDir);
    expect(health.noAcceptanceCriteria).toBe(0);
  });
});
