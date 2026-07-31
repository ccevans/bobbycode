// test/lib/targets.test.js
import { getTarget, TARGETS } from '../../lib/targets/index.js';
import { scaffoldProject } from '../../commands/init.js';
import { buildSingleAgentPrompt, buildBatchStagePrompt, buildOrchestrationPrompt, DEFAULT_WORKFLOW } from '../../lib/workflow.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('targets', () => {
  describe('getTarget', () => {
    test('returns claude-code target by default', () => {
      const target = getTarget();
      expect(target.name).toBe('claude-code');
    });

    test('returns claude-code target explicitly', () => {
      const target = getTarget('claude-code');
      expect(target.name).toBe('claude-code');
    });

    test('returns cline target', () => {
      const target = getTarget('cline');
      expect(target.name).toBe('cline');
    });

    test('throws for unknown target', () => {
      expect(() => getTarget('unknown')).toThrow('Unknown target');
    });

    test('returns cursor target', () => {
      const target = getTarget('cursor');
      expect(target.name).toBe('cursor');
    });

    test('TARGETS lists available targets', () => {
      expect(TARGETS).toContain('claude-code');
      expect(TARGETS).toContain('cline');
      expect(TARGETS).toContain('cursor');
    });
  });

  describe('claude-code adapter', () => {
    const target = getTarget('claude-code');

    test('paths return .claude/ structure', () => {
      const p = target.paths();
      expect(p.agents).toBe('.claude/agents');
      expect(p.skills).toBe('.claude/skills');
      expect(p.commands).toBe('.claude/commands');
      expect(p.rules).toBe('CLAUDE.md');
    });

    test('supports subagents', () => {
      expect(target.supportsSubagents()).toBe(true);
    });

    test('prompt hint mentions Claude Code', () => {
      expect(target.promptHint()).toContain('Claude Code');
    });

    test('display name is Claude Code', () => {
      expect(target.displayName()).toBe('Claude Code');
    });

    test('still documents hooks in CLAUDE.md', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cc-'));
      scaffoldProject(tmpDir, {
        project: 'test-app', stack: 'nextjs',
        health_checks: [], areas: [],
        commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
      });
      const rules = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
      expect(rules).toContain('tells Claude Code how to work');
      expect(rules).toContain('## Hooks');
      fs.rmSync(tmpDir, { recursive: true });
    });

    test('scaffoldExtras is a no-op', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-target-'));
      target.scaffoldExtras(tmpDir);
      // No .clineignore should be created
      expect(fs.existsSync(path.join(tmpDir, '.clineignore'))).toBe(false);
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('cline adapter', () => {
    const target = getTarget('cline');

    test('paths return .clinerules/ structure', () => {
      const p = target.paths();
      expect(p.agents).toBe('.clinerules/agents');
      expect(p.skills).toBe('.clinerules/skills');
      expect(p.commands).toBe('.clinerules/workflows');
      expect(p.rules).toBe('.clinerules/rules.md');
    });

    test('does not support subagents', () => {
      expect(target.supportsSubagents()).toBe(false);
    });

    test('prompt hint mentions Cline', () => {
      expect(target.promptHint()).toContain('Cline');
    });

    test('scaffoldExtras creates .clineignore', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-target-'));
      target.scaffoldExtras(tmpDir);
      expect(fs.existsSync(path.join(tmpDir, '.clineignore'))).toBe(true);
      const content = fs.readFileSync(path.join(tmpDir, '.clineignore'), 'utf8');
      expect(content).toContain('.bobby/');
      expect(content).toContain('.bobbyrc.yml');
      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});

describe('cursor adapter', () => {
  const target = getTarget('cursor');

  test('paths map onto Cursor-native locations', () => {
    const p = target.paths();
    expect(p.agents).toBe('.cursor/agents');
    expect(p.skills).toBe('.cursor/skills');
    expect(p.commands).toBe('.cursor/commands');
    expect(p.rules).toBe('AGENTS.md');
  });

  test('supports subagents', () => {
    // Cursor 3.13+ watches .cursor/agents as workspace-scoped subagent
    // definitions, keyed on the `name` frontmatter field Bobby already writes.
    expect(target.supportsSubagents()).toBe(true);
  });

  test('prompt hint mentions Cursor', () => {
    expect(target.promptHint()).toContain('Cursor');
  });

  describe('transformCommand', () => {
    test('replaces frontmatter with the description as a lead line', () => {
      const out = target.transformCommand(
        '---\ndescription: "Build a ticket using TDD"\nargument-hint: "<ticket ID>"\n---\n\nLoad the skill.\n'
      );
      expect(out).toBe('_Build a ticket using TDD_\n\nLoad the skill.\n');
      expect(out).not.toContain('argument-hint');
      expect(out).not.toMatch(/^---/);
    });

    test('drops frontmatter entirely when there is no description', () => {
      const out = target.transformCommand('---\nargument-hint: "<id>"\n---\n\nBody.\n');
      expect(out).toBe('Body.\n');
    });

    test('leaves content without frontmatter untouched', () => {
      expect(target.transformCommand('Just a body.\n')).toBe('Just a body.\n');
    });

    test('strips CRLF frontmatter', () => {
      const out = target.transformCommand('---\r\ndescription: "D"\r\n---\r\n\r\nBody\r\n');
      expect(out).not.toContain('---');
      expect(out).toContain('_D_');
    });

    test('emits no empty italic marker when the description is blank', () => {
      expect(target.transformCommand('---\ndescription:\n---\n\nBody\n')).toBe('Body\n');
      expect(target.transformCommand('---\ndescription: "  "\n---\n\nBody\n')).toBe('Body\n');
    });

    test('unfolds block-scalar descriptions instead of emitting the indicator', () => {
      const folded = target.transformCommand(
        '---\ndescription: >\n  line one\n  line two\nargument-hint: x\n---\n\nBody\n'
      );
      expect(folded).toBe('_line one line two_\n\nBody\n');
      expect(target.transformCommand('---\ndescription: |-\n  only line\n---\n\nBody\n'))
        .toBe('_only line_\n\nBody\n');
    });

    test('does not treat a horizontal rule in the body as a delimiter', () => {
      const out = target.transformCommand('---\ndescription: "D"\n---\n\nIntro\n\n---\n\nMore\n');
      expect(out).toBe('_D_\n\nIntro\n\n---\n\nMore\n');
    });

    test('leaves an unterminated frontmatter block alone rather than mangling it', () => {
      const input = '---\ndescription: x\n\nBody';
      expect(target.transformCommand(input)).toBe(input);
    });

    test('tolerates trailing whitespace on the closing delimiter', () => {
      expect(target.transformCommand('---\ndescription: D\n---  \n\nBody\n'))
        .toBe('_D_\n\nBody\n');
    });

    test('strips single-quoted descriptions', () => {
      expect(target.transformCommand("---\ndescription: 'Quoted D'\n---\n\nBody\n"))
        .toBe('_Quoted D_\n\nBody\n');
    });
  });

  describe('scaffoldExtras', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cursor-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

    test('writes .cursorindexingignore, not .cursorignore', () => {
      target.scaffoldExtras(tmpDir);
      const p = path.join(tmpDir, '.cursorindexingignore');
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p, 'utf8')).toContain('.bobby/sessions/');
      // .cursorignore would block the agent from reading tickets at all.
      expect(fs.existsSync(path.join(tmpDir, '.cursorignore'))).toBe(false);
    });

    test('does not index-ignore .bobby/ wholesale — agents must read tickets', () => {
      target.scaffoldExtras(tmpDir);
      const lines = fs.readFileSync(path.join(tmpDir, '.cursorindexingignore'), 'utf8')
        .split('\n').map(l => l.trim()).filter(Boolean);
      expect(lines).not.toContain('.bobby/');
      expect(lines).not.toContain('.bobby');
    });

    test('preserves user entries and does not duplicate on re-run', () => {
      const p = path.join(tmpDir, '.cursorindexingignore');
      fs.writeFileSync(p, 'dist/\n', 'utf8');
      target.scaffoldExtras(tmpDir);
      target.scaffoldExtras(tmpDir);
      const content = fs.readFileSync(p, 'utf8');
      expect(content).toContain('dist/');
      expect(content.match(/\.bobby\/sessions\//g)).toHaveLength(1);
    });

    test('appends correctly when the existing file lacks a trailing newline', () => {
      const p = path.join(tmpDir, '.cursorindexingignore');
      fs.writeFileSync(p, 'dist/', 'utf8');
      target.scaffoldExtras(tmpDir);
      const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
      expect(lines).toEqual(['dist/', '.bobby/sessions/']);
    });
  });
});




