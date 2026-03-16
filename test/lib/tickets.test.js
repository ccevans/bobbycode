// test/lib/tickets.test.js
import { findTicket, findIdea, createTicket, moveTicket, slugify } from '../../lib/tickets.js';
import { STAGES } from '../../lib/stages.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('tickets', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-tickets-'));
    // Create stage directories
    for (const stage of STAGES) {
      fs.mkdirSync(path.join(tmpDir, stage), { recursive: true });
    }
    // Create a minimal .counter
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
    fs.writeFileSync(path.join(tmpDir, '.idea-counter'), '0');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('slugify converts title to URL-safe slug', () => {
    expect(slugify('Fix Login Page')).toBe('fix-login-page');
    expect(slugify('Add  multiple--dashes')).toBe('add-multiple-dashes');
    expect(slugify('Special!@#chars')).toBe('special-chars');
  });

  test('createTicket creates folder in 1-backlog', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT',
      title: 'Fix login bug',
      type: 'bug',
      priority: 'high',
      author: 'QE',
      areas: ['auth', 'dashboard'],
    });
    expect(result.id).toBe('TKT-001');
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.existsSync(path.join(result.path, 'ticket.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.path, 'test-cases.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.path, 'screenshots'))).toBe(true);
  });

  test('findTicket locates ticket across stages', () => {
    const result = createTicket(tmpDir, {
      prefix: 'TKT', title: 'Test find', type: 'feature',
      priority: 'medium', author: 'dev', areas: [],
    });
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('1-backlog');
    expect(found.path).toBe(result.path);
  });

  test('findTicket returns null for missing ticket', () => {
    const found = findTicket(tmpDir, 'TKT-999');
    expect(found).toBeNull();
  });

  test('moveTicket moves folder between stages', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Move test', type: 'feature',
      priority: 'medium', author: 'dev', areas: [],
    });
    moveTicket(tmpDir, 'TKT-001', '4-in-progress', 'engineer', 'Started work');
    const found = findTicket(tmpDir, 'TKT-001');
    expect(found.stage).toBe('4-in-progress');
    // Verify history was appended to ticket.md
    const content = fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8');
    expect(content).toContain('4-in-progress');
    expect(content).toContain('Started work');
  });

  test('moveTicket throws for invalid stage', () => {
    createTicket(tmpDir, {
      prefix: 'TKT', title: 'Bad move', type: 'feature',
      priority: 'medium', author: 'dev', areas: [],
    });
    expect(() => moveTicket(tmpDir, 'TKT-001', 'fake-stage', 'dev')).toThrow('Invalid stage');
  });

  test('moveTicket throws for missing ticket', () => {
    expect(() => moveTicket(tmpDir, 'TKT-999', '4-in-progress', 'dev')).toThrow('not found');
  });
});
