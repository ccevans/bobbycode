// test/lib/template.test.js
import { renderTemplate, renderSkillTemplates, copyStaticTemplate } from '../../lib/template.js';
import fs from 'fs';
import { Command } from 'commander';
import { registerCreate } from '../../commands/create.js';
import { registerMove } from '../../commands/move.js';
import { registerComment } from '../../commands/comment.js';
import path from 'path';
import os from 'os';

const DEFAULT_PATHS = { agents: '.claude/agents', skills: '.claude/skills', commands: '.claude/commands', rules: 'CLAUDE.md' };

describe('template', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-tpl-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('renderTemplate renders EJS with config data', () => {
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth', 'billing'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      commands: { test: 'npm test', lint: 'npm run lint', dev: 'npm run dev', build: 'npm run build' },
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      paths: DEFAULT_PATHS,
    };
    const result = renderTemplate('CLAUDE.md.ejs', config);
    expect(result).toContain('test-app');
    expect(result).toContain('auth');
    expect(result).toContain('http://localhost:3000');
  });

  test('studio CLAUDE.md teaches ticket-ID inference, not `project use` (TKT-084)', () => {
    const base = {
      project: 'test-app', stack: 'nextjs', areas: [], health_checks: [], commands: {},
      tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions', paths: DEFAULT_PATHS,
    };
    const studio = renderTemplate('CLAUDE.md.ejs', { ...base, studio: 'S' });
    expect(studio).toContain('picks its project from the ticket ID');
    expect(studio).not.toContain('bobby project use');
    expect(renderTemplate('CLAUDE.md.ejs', base)).not.toContain('picks its project from the ticket ID');
  });

  describe('ticket command flags cheat sheet', () => {
    const config = {
      project: 'test-app', stack: 'nextjs', areas: [], health_checks: [],
      commands: {}, tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions', paths: DEFAULT_PATHS,
    };
    const section = (out) => out.split('## Ticket command flags')[1].split('\n## ')[0];

    test('CLAUDE.md lists the ticket create flags and move aliases between Stay in the ticket and Workflows', () => {
      const out = renderTemplate('CLAUDE.md.ejs', config);
      const s = section(out);
      for (const f of ['--parent', '--epic', '--repos', '-a <your agent name>', '--size xs|s|m|l|xl', '--workflow', '--found-in', 'reject', 'unblock']) {
        expect(s).toContain(f);
      }
      expect(out.indexOf('## Stay in the ticket')).toBeLessThan(out.indexOf('## Ticket command flags'));
      expect(out.indexOf('## Ticket command flags')).toBeLessThan(out.indexOf('## Workflows'));
    });

    // Flags a cheat-sheet bullet names that its command does not have.
    // --project is the global flag spliced out in bin/bobby.js, not a command option.
    const buildTicketCommands = () => {
      const ticket = new Command().command('ticket');
      registerCreate(ticket);
      registerMove(ticket);
      registerComment(ticket);
      return ticket;
    };
    const unknownFlags = (ticket, line) => {
      const cmd = line.match(/^- `bobby ticket (\w+)/)[1];
      const real = ticket.commands.find(c => c.name() === cmd).options.flatMap(o => [o.long, o.short]).filter(Boolean);
      const named = [...line.matchAll(/(?:^|[\s`,(])(--?[a-z][a-z-]*)/g)].map(m => m[1]);
      return named.filter(t => t !== '--project' && !real.includes(t));
    };

    test('every flag the cheat sheet names exists on its command (drift guard)', () => {
      const ticket = buildTicketCommands();
      const lines = section(renderTemplate('CLAUDE.md.ejs', { ...config, studio: 'S' })).split('\n').filter(l => l.startsWith('- `bobby ticket '));
      expect(lines).toHaveLength(3);
      for (const line of lines) expect(unknownFlags(ticket, line)).toEqual([]);
    });

    test('the drift guard flags a flag that does not exist', () => {
      const ticket = buildTicketCommands();
      expect(unknownFlags(ticket, '- `bobby ticket move <ID> <alias>`: `--by <who>`, `--bogus`')).toEqual(['--bogus']);
      expect(unknownFlags(ticket, '- `bobby ticket move <ID> <alias>`: `--by <who>`')).toEqual([]);
    });

    test('--project appears only in a studio render', () => {
      expect(section(renderTemplate('CLAUDE.md.ejs', { ...config, studio: 'S' }))).toContain('--project <name>');
      expect(renderTemplate('CLAUDE.md.ejs', config)).not.toContain('--project');
    });
  });

  test('renderSkillTemplates creates skill files', () => {
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      commands: { test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      paths: DEFAULT_PATHS,
    };
    renderSkillTemplates(tmpDir, config);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-plan', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-build', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-test', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ship', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-pm', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-qe', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-workflow', 'SKILL.md'))).toBe(true);
  });

  test('copyStaticTemplate copies file to destination', () => {
    const destPath = path.join(tmpDir, 'copied-workflow.md');
    copyStaticTemplate('WORKFLOW.md.ejs', destPath);
    expect(fs.existsSync(destPath)).toBe(true);
    const content = fs.readFileSync(destPath, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('renderSkillTemplates handles subdirectories (references)', () => {
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      commands: { test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      paths: DEFAULT_PATHS,
    };
    renderSkillTemplates(tmpDir, config);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-ux', 'references', 'brand_guidelines.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'bobby-design', 'references', 'craft_principles.md'))).toBe(true);
  });
});
