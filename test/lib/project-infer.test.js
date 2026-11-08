// test/lib/project-infer.test.js — TKT-084: ticket IDs name their studio project.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Command } from 'commander';
import { initStudio, createProject } from '../../lib/studio.js';
import { ticketIdsFromCommand, inferProjectFromIds } from '../../lib/project-infer.js';

describe('inferProjectFromIds', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-infer-'));
    initStudio(root);
    createProject(root, 'robinflow', { prefix: 'RF' });
    createProject(root, 'bobby', { prefix: 'BOB' });
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('no IDs -> null', () => {
    expect(inferProjectFromIds(root, [])).toBeNull();
  });

  test('a matching prefix returns its project, case-insensitively', () => {
    expect(inferProjectFromIds(root, ['RF-1'])).toBe('robinflow');
    expect(inferProjectFromIds(root, ['bob-7'])).toBe('bobby');
    expect(inferProjectFromIds(root, ['RF-1', 'rf-2'])).toBe('robinflow');
  });

  // Unowned prefix (legacy TKT-): the exact ID is looked up on every project's board (TKT-084 decision).
  const putTicket = (project, id) => {
    const dir = path.join(root, '.bobby', project, 'tickets', `${id}--legacy-ticket`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ticket.md'), `---\nid: ${id}\ntitle: legacy ticket\nstage: backlog\n---\n`);
  };

  test('an unowned prefix found on exactly one board returns that project', () => {
    putTicket('robinflow', 'TKT-491');
    putTicket('bobby', 'TKT-7');
    expect(inferProjectFromIds(root, ['TKT-491'])).toBe('robinflow');
    expect(inferProjectFromIds(root, ['TKT-7'])).toBe('bobby');
  });

  test('an unowned prefix found on no board throws, naming the boards searched and --project', () => {
    putTicket('robinflow', 'TKT-1');
    expect(() => inferProjectFromIds(root, ['TKT-9']))
      .toThrow(/TKT-9: not found on any project board \(searched: (robinflow, bobby|bobby, robinflow)\).*--project/);
  });

  test('an unowned prefix found on several boards throws, naming them and --project', () => {
    putTicket('robinflow', 'TKT-5');
    putTicket('bobby', 'TKT-5');
    expect(() => inferProjectFromIds(root, ['TKT-5']))
      .toThrow(/TKT-5: found on more than one project board \((bobby, robinflow)\).*--project/);
  });

  test('an unowned prefix never falls through to the cwd or active project', () => {
    putTicket('robinflow', 'TKT-1');
    fs.writeFileSync(path.join(root, '.bobby', 'active-project'), 'robinflow\n');
    expect(() => inferProjectFromIds(root, ['TKT-2'])).toThrow(/not found on any project board/);
  });

  test('legacy IDs from different boards throw as mixed projects', () => {
    putTicket('robinflow', 'TKT-1');
    putTicket('bobby', 'TKT-2');
    expect(() => inferProjectFromIds(root, ['TKT-1', 'TKT-2'])).toThrow(/TKT-1 is robinflow.*TKT-2 is bobby.*--project/);
  });

  test('an owned prefix keeps today\'s behaviour and never reads the boards', () => {
    expect(inferProjectFromIds(root, ['RF-9999'])).toBe('robinflow');
  });

  test('a prefix two projects share throws', () => {
    createProject(root, 'rf2', { prefix: 'RF' });
    expect(() => inferProjectFromIds(root, ['RF-1']))
      .toThrow(/Prefix RF is used by more than one project \(rf2, robinflow\)|\(robinflow, rf2\)/);
  });

  test('IDs from different projects throw, naming both and --project', () => {
    expect(() => inferProjectFromIds(root, ['RF-1', 'BOB-1']))
      .toThrow(/RF-1 is robinflow.*BOB-1 is bobby.*--project/);
  });
});

describe('ticketIdsFromCommand', () => {
  // A tiny program shaped like the real one; the action stub records what the allowlist reads.
  const collect = (argv) => {
    let got;
    const program = new Command().exitOverride();
    const stub = (...a) => { got = ticketIdsFromCommand(a[a.length - 1]); };
    const ticket = program.command('ticket');
    ticket.command('view <id>').action(stub);
    ticket.command('create').option('--found-in <id>').option('--parent <id>').action(stub);
    ticket.command('list').action(stub);
    program.command('go [what...]').action(stub);
    program.command('run <agent> [ticketIds...]').action(stub);
    program.command('blueprint [epicId]').action(stub);
    program.command('retro [id] [pattern]').action(stub);
    const sprint = program.command('sprint');
    sprint.command('run <id>').action(stub);
    sprint.command('add <id> <ticketIds...>').action(stub);
    const pack = program.command('pack');
    pack.command('info <id>').action(stub);
    program.parse(argv, { from: 'user' });
    return got;
  };

  test('ticket view reads its id', () => { expect(collect(['ticket', 'view', 'RF-1'])).toEqual(['RF-1']); });
  test('go with one ticket-shaped word reads it', () => { expect(collect(['go', 'RF-1'])).toEqual(['RF-1']); });
  test('go with free text reads nothing', () => {
    expect(collect(['go', 'fix', 'utf-8', 'parsing'])).toEqual([]);
    expect(collect(['go', 'fix', 'utf-8'])).toEqual([]);
  });
  test('sprint and pack ids are never read', () => {
    expect(collect(['sprint', 'run', 'SPR-001'])).toEqual([]);
    expect(collect(['pack', 'info', 'react-18'])).toEqual([]);
  });
  test('sprint add reads the ticket IDs, not the sprint id', () => {
    expect(collect(['sprint', 'add', 'SPR-001', 'RF-1', 'RF-2'])).toEqual(['RF-1', 'RF-2']);
  });
  test('run reads ticketIds; blueprint reads epicId; retro reads id', () => {
    expect(collect(['run', 'build', 'RF-1', 'RF-2'])).toEqual(['RF-1', 'RF-2']);
    expect(collect(['blueprint', 'RF-9'])).toEqual(['RF-9']);
    expect(collect(['retro', 'RF-3', 'pattern'])).toEqual(['RF-3']);
  });
  test('ticket create reads --found-in and --parent', () => {
    expect(collect(['ticket', 'create', '--found-in', 'RF-1'])).toEqual(['RF-1']);
    expect(collect(['ticket', 'create', '--parent', 'BOB-4'])).toEqual(['BOB-4']);
    expect(collect(['ticket', 'list'])).toEqual([]);
  });
  test('missing commander internals -> [] and no throw', () => {
    expect(ticketIdsFromCommand({ name: () => 'x', opts: () => ({}) })).toEqual([]);
    expect(ticketIdsFromCommand(undefined)).toEqual([]);
  });
});
