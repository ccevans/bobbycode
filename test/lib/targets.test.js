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

  test('does not support subagents', () => {
    expect(target.supportsSubagents()).toBe(false);
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

describe('cursor scaffold integration', () => {
  let tmpDir;

  const baseConfig = {
    project: 'test-app', stack: 'nextjs', target: 'cursor',
    health_checks: [], areas: [], commands: { test: 'npm test' },
    tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
  };

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cursor-sc-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('creates .cursor/ structure and AGENTS.md', () => {
    scaffoldProject(tmpDir, { ...baseConfig });

    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'agents', 'bobby-build.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'skills', 'bobby-build', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'commands'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursorindexingignore'))).toBe(true);

    // Claude Code and Cline artifacts should not appear
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.clinerules'))).toBe(false);
  });

  test('scaffolded commands carry no YAML frontmatter', () => {
    scaffoldProject(tmpDir, { ...baseConfig });
    const commandsDir = path.join(tmpDir, '.cursor', 'commands');
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = fs.readFileSync(path.join(commandsDir, f), 'utf8');
      expect(content.startsWith('---')).toBe(false);
    }
  });

  test('rules, agents, skills and commands all reference .cursor/ paths', () => {
    scaffoldProject(tmpDir, { ...baseConfig });
    const files = [
      path.join(tmpDir, 'AGENTS.md'),
      path.join(tmpDir, '.cursor', 'agents', 'bobby-build.md'),
      path.join(tmpDir, '.cursor', 'skills', 'bobby-build', 'SKILL.md'),
      path.join(tmpDir, '.cursor', 'commands', 'bobby-build.md'),
    ];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      expect(content).not.toContain('.claude/');
      expect(content).not.toContain('.clinerules/');
    }
    expect(fs.readFileSync(files[0], 'utf8')).toContain('.cursor/skills/');
  });

  test('does not scaffold Claude Code hooks or settings', () => {
    scaffoldProject(tmpDir, { ...baseConfig });
    expect(fs.existsSync(path.join(tmpDir, 'hooks'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });

  test('no scaffolded file points at CLAUDE.md, which cursor never writes', () => {
    scaffoldProject(tmpDir, { ...baseConfig });

    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.md')) continue;
        if (fs.readFileSync(p, 'utf8').includes('CLAUDE.md')) {
          offenders.push(path.relative(tmpDir, p));
        }
      }
    };
    walk(path.join(tmpDir, '.cursor'));
    if (fs.existsSync(path.join(tmpDir, 'AGENTS.md'))) walk(tmpDir);

    // bobby-build/bobby-ship tell the agent to follow "Safety Rules in <rules>";
    // pointing that at a file cursor never creates silently drops the contract.
    expect(offenders).toEqual([]);
  });

  test('agents reference the target rules file by name', () => {
    scaffoldProject(tmpDir, { ...baseConfig });
    for (const agent of ['bobby-build', 'bobby-ship']) {
      const content = fs.readFileSync(path.join(tmpDir, '.cursor', 'agents', `${agent}.md`), 'utf8');
      expect(content).toContain('Safety Rules in `AGENTS.md`');
    }
  });

  test('leaves exactly one blank line where the hooks section was omitted', () => {
    scaffoldProject(tmpDir, { ...baseConfig });
    const rules = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    // The omitted <% if %> block must not leave a doubled gap at its seam.
    expect(rules).toContain('when to advance\n\n## Architecture Wakeup');
  });

  test('AGENTS.md names Cursor and omits the Claude-Code-only hooks section', () => {
    scaffoldProject(tmpDir, { ...baseConfig });
    const rules = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(rules).toContain('tells Cursor how to work');
    // Hooks are only scaffolded for claude-code, so documenting them here
    // would point at files that don't exist.
    expect(rules).not.toContain('## Hooks');
    expect(rules).not.toContain('hooks/precompact.sh');
  });

  test('preserves a pre-existing AGENTS.md by backing it up and merging', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# My rules\n\nAlways use tabs.\n', 'utf8');
    scaffoldProject(tmpDir, { ...baseConfig });

    const backup = path.join(tmpDir, 'AGENTS.md.pre-bobby');
    expect(fs.existsSync(backup)).toBe(true);
    expect(fs.readFileSync(backup, 'utf8')).toContain('Always use tabs.');
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8')).toContain('Always use tabs.');
  });
});

describe('pipeline prompts with cursor target', () => {
  const cursorAgentsPath = '.cursor/agents';

  test('buildSingleAgentPrompt uses cursor paths', () => {
    const prompt = buildSingleAgentPrompt('bobby-plan', 'TKT-001', '.bobby/tickets', cursorAgentsPath);
    expect(prompt).toContain('.cursor/agents/bobby-plan.md');
    expect(prompt).not.toContain('.claude/agents/');
  });

  test('buildOrchestrationPrompt uses cursor paths', () => {
    const prompt = buildOrchestrationPrompt(
      'TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, cursorAgentsPath
    );
    expect(prompt).toContain('.cursor/agents/');
    expect(prompt).not.toContain('.claude/agents/');
  });

  test('buildBatchStagePrompt uses cursor paths', () => {
    const prompt = buildBatchStagePrompt(
      'bobby-plan', ['TKT-001', 'TKT-002'], '.bobby/tickets', 'none', cursorAgentsPath
    );
    expect(prompt).toContain('.cursor/agents/bobby-plan.md');
    expect(prompt).not.toContain('.claude/agents/');
  });
});

describe('cline scaffold integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cline-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('scaffoldProject with target=cline creates .clinerules/ structure', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs', target: 'cline',
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      areas: ['auth'], commands: { dev: 'npm run dev', test: 'npm test' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    // Cline-specific files
    expect(fs.existsSync(path.join(tmpDir, '.clinerules', 'rules.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.clinerules', 'agents', 'bobby-build.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.clinerules', 'skills', 'bobby-build', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.clinerules', 'workflows'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.clineignore'))).toBe(true);

    // Claude Code files should NOT exist
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(false);
  });

  test('cline rules.md contains .clinerules/ paths, not .claude/', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs', target: 'cline',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const rules = fs.readFileSync(path.join(tmpDir, '.clinerules', 'rules.md'), 'utf8');
    expect(rules).toContain('.clinerules/skills/');
    expect(rules).not.toContain('.claude/');
  });

  test('cline agent files reference .clinerules/ paths', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs', target: 'cline',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const agent = fs.readFileSync(path.join(tmpDir, '.clinerules', 'agents', 'bobby-build.md'), 'utf8');
    expect(agent).toContain('.clinerules/skills/');
    expect(agent).not.toContain('.claude/');
  });

  test('cline skill files reference .clinerules/ paths', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs', target: 'cline',
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      areas: [], commands: { test: 'npm test' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const skill = fs.readFileSync(path.join(tmpDir, '.clinerules', 'skills', 'bobby-build', 'SKILL.md'), 'utf8');
    expect(skill).toContain('.clinerules/skills/');
    expect(skill).not.toContain('.claude/');
  });

  test('cline rules.md names Cline and omits the hooks section', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs', target: 'cline',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const rules = fs.readFileSync(path.join(tmpDir, '.clinerules', 'rules.md'), 'utf8');
    expect(rules).toContain('tells Cline how to work');
    expect(rules).not.toContain('## Hooks');
  });

  test('default target (no target specified) produces Claude Code output', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    // Claude Code files should exist
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills'))).toBe(true);

    // Cline files should NOT exist
    expect(fs.existsSync(path.join(tmpDir, '.clinerules'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.clineignore'))).toBe(false);
  });
});

describe('pipeline prompts with cline target', () => {
  const clineAgentsPath = '.clinerules/agents';

  test('buildSingleAgentPrompt uses cline paths', () => {
    const prompt = buildSingleAgentPrompt('bobby-plan', 'TKT-001', '.bobby/tickets', clineAgentsPath);
    expect(prompt).toContain('.clinerules/agents/bobby-plan.md');
    expect(prompt).not.toContain('.claude/agents/');
  });

  test('buildOrchestrationPrompt uses cline paths', () => {
    const prompt = buildOrchestrationPrompt(
      'TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, clineAgentsPath
    );
    expect(prompt).toContain('.clinerules/agents/');
    expect(prompt).not.toContain('.claude/agents/');
  });

  test('buildBatchStagePrompt uses cline paths', () => {
    const prompt = buildBatchStagePrompt(
      'bobby-plan', ['TKT-001', 'TKT-002'], '.bobby/tickets', 'none', clineAgentsPath
    );
    expect(prompt).toContain('.clinerules/agents/bobby-plan.md');
    expect(prompt).not.toContain('.claude/agents/');
  });
});
