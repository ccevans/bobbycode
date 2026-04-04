// test/lib/targets.test.js
import { getTarget, TARGETS } from '../../lib/targets/index.js';
import { scaffoldProject } from '../../commands/init.js';
import { buildSingleAgentPrompt, buildBatchStagePrompt, buildOrchestrationPrompt, DEFAULT_PIPELINE } from '../../lib/pipeline.js';
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

    test('TARGETS lists available targets', () => {
      expect(TARGETS).toContain('claude-code');
      expect(TARGETS).toContain('cline');
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
      'TKT-001', DEFAULT_PIPELINE, 3, '.bobby/tickets', 20, clineAgentsPath
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
