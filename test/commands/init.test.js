// test/commands/init.test.js
import { jest } from '@jest/globals';
import { scaffoldProject, registerInit, loadStack } from '../../commands/init.js';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

describe('bobby init (scaffolding)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-init-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('scaffoldProject creates all expected directories and files', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app',
      stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      areas: ['auth', 'dashboard'],
      commands: { dev: 'npm run dev', test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Single tickets directory (no stage sub-folders)
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', 'retrospectives'))).toBe(true);

    // Skills
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-build', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-test', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-plan', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-ship', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-ux', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-ux', 'references', 'brand_guidelines.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-pm', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'bobby-qe', 'SKILL.md'))).toBe(true);

    // Agents directory
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents'))).toBe(true);

    // Config and docs
    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', 'WORKFLOW.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets', 'README.md'))).toBe(true);
  });

  test('scaffoldProject preserves existing tickets on re-init', () => {
    // First init
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Create a ticket in the single tickets dir
    const ticketDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--test');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, 'ticket.md'), 'test');

    // Re-init
    scaffoldProject(tmpDir, {
      project: 'test-app-v2', stack: 'generic',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Ticket should survive
    expect(fs.existsSync(path.join(ticketDir, 'ticket.md'))).toBe(true);
    // Config should be updated
    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(config).toContain('test-app-v2');
  });

  test('scaffoldProject creates all 15 agent definition files', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      areas: ['auth'], commands: { dev: 'npm run dev', test: 'npm test' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const agents = [
      'bobby-plan', 'bobby-build', 'bobby-review', 'bobby-test', 'bobby-ship',
      'bobby-ux', 'bobby-pm', 'bobby-qe', 'bobby-vet', 'bobby-strategy',
      'bobby-security', 'bobby-debug', 'bobby-docs', 'bobby-performance', 'bobby-watchdog',
    ];
    for (const agent of agents) {
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents', `${agent}.md`))).toBe(true);
    }
  });

  test('scaffoldProject creates command files', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    expect(fs.existsSync(commandsDir)).toBe(true);
    const files = fs.readdirSync(commandsDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.endsWith('.md'))).toBe(true);
  });

  test('CLAUDE.md contains project name and pipeline instructions', () => {
    scaffoldProject(tmpDir, {
      project: 'my-project', stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      areas: ['auth', 'dashboard'],
      commands: { dev: 'npm run dev', test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('my-project');
    expect(claudeMd).toContain('bobby-plan');
    expect(claudeMd).toContain('bobby-build');
    expect(claudeMd).toContain('.claude/skills/');
  });

  test('scaffoldProject creates sessions directory', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT',
    });
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'sessions'))).toBe(true);
  });

  test('scaffoldProject defaults bobby_dir when not provided', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, ticket_prefix: 'TKT',
      // omit bobby_dir, tickets_dir, sessions_dir
    });
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'tickets'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.bobby', 'sessions'))).toBe(true);
  });

  test('scaffoldProject initializes git repo if not already one', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true);
  });

  test('scaffoldProject does not re-init existing git repo', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'hello');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_EMAIL: 'test@test.com' } });

    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    const log = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf8' });
    expect(log).toContain('init');
  });

  test('scaffoldProject does not overwrite existing counter', () => {
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Simulate counter advancement
    const counterFile = path.join(tmpDir, '.bobby', 'tickets', '.counter');
    fs.writeFileSync(counterFile, '5');

    // Re-init
    scaffoldProject(tmpDir, {
      project: 'test-app', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    // Counter should be preserved
    expect(fs.readFileSync(counterFile, 'utf8')).toBe('5');
  });
});

describe('registerInit (interactive flow)', () => {
  let tmpDir;
  let origCwd;
  let logSpy;
  let errorSpy;
  let exitSpy;
  let promptSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-init-cli-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    if (promptSpy) promptSpy.mockRestore();
  });

  function mockProgram() {
    let actionFn;
    const cmd = {
      description: () => cmd,
      action: (fn) => { actionFn = fn; return cmd; },
    };
    const program = {
      command: () => cmd,
      getAction: () => actionFn,
    };
    return program;
  }

  test('fresh init with nextjs stack scaffolds project', async () => {
    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test-proj', stack: 'nextjs' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:3000' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills'))).toBe(true);
  });

  test('re-init with cancel exits', async () => {
    scaffoldProject(tmpDir, {
      project: 'existing', stack: 'nextjs',
      health_checks: [], areas: [],
      commands: {}, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      return { reinitMode: 'cancel' };
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(logSpy).toHaveBeenCalledWith('Cancelled.');
  });

  test('re-init with rescaffold regenerates without prompts', async () => {
    scaffoldProject(tmpDir, {
      project: 'existing', stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      areas: ['auth'], commands: { test: 'npm test' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      return { reinitMode: 'rescaffold' };
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    // Only 1 prompt (the reinitMode choice)
    expect(promptCall).toBe(1);
    // Files should still exist
    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents'))).toBe(true);
  });

  test('re-init with reconfigure proceeds to full wizard', async () => {
    scaffoldProject(tmpDir, {
      project: 'existing', stack: 'nextjs',
      health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
      areas: [], commands: {},
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });

    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { reinitMode: 'reconfigure' };
      if (promptCall === 2) return { setupMode: 'full' };
      if (promptCall === 3) return { project: 'updated-proj', stack: 'nextjs' };
      if (promptCall === 4) return { targetName: 'claude-code' };
      if (promptCall === 5) return { devUrl: 'http://localhost:4000' };
      if (promptCall === 6) return { bobbyDir: '.bobby' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(config).toContain('updated-proj');
  });

  test('init with generic stack when stack not found', async () => {
    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test', stack: 'nonexistent-stack' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:3000' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
  });

  test('init detects project skills and prompts for selection', async () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'api-patterns');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# API Patterns');

    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test', stack: 'nextjs' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:3000' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      if (promptCall === 6) return { selectedSkills: ['api-patterns'] };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(config).toContain('api-patterns');
  });

  test('init with rails-react detects multi-repo', async () => {
    fs.mkdirSync(path.join(tmpDir, 'listrobin_api', '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'listrobin-ui', '.git'), { recursive: true });

    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test', stack: 'rails-react' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:3000' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      if (promptCall === 6) return { useDetected: true };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
  });

  test('init with rails-react declines detected repos', async () => {
    fs.mkdirSync(path.join(tmpDir, 'listrobin_api', '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'listrobin-ui', '.git'), { recursive: true });

    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test', stack: 'rails-react' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:3000' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      if (promptCall === 6) return { useDetected: false };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    // repos should only appear as a comment, not as active config
    expect(config).not.toMatch(/^repos:/m);
  });

  test('init with stack that has no health checks', async () => {
    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test', stack: 'generic' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:8080' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
  });

  test('init project skill detection skips bobby- prefixed skills', async () => {
    const bobbySkill = path.join(tmpDir, '.claude', 'skills', 'bobby-build');
    const customSkill = path.join(tmpDir, '.claude', 'skills', 'my-patterns');
    fs.mkdirSync(bobbySkill, { recursive: true });
    fs.mkdirSync(customSkill, { recursive: true });
    fs.writeFileSync(path.join(bobbySkill, 'SKILL.md'), '# Build');
    fs.writeFileSync(path.join(customSkill, 'SKILL.md'), '# My Patterns');

    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'full' };
      if (promptCall === 2) return { project: 'test', stack: 'nextjs' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      if (promptCall === 4) return { devUrl: 'http://localhost:3000' };
      if (promptCall === 5) return { bobbyDir: '.bobby' };
      if (promptCall === 6) return { selectedSkills: [] };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    // build_skills should only appear as a comment, not as active config
    expect(config).not.toMatch(/^build_skills:/m);
  });

  test('init in quick mode skips advanced prompts', async () => {
    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'quick' };
      if (promptCall === 2) return { project: 'quick-proj', stack: 'nextjs' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(fs.existsSync(path.join(tmpDir, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    // Only 3 prompt calls needed (setupMode, project+stack, target)
    expect(promptCall).toBe(3);
  });

  test('init in quick mode uses stack defaults', async () => {
    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'quick' };
      if (promptCall === 2) return { project: 'quick-test', stack: 'nextjs' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    // Stack defaults should be present
    expect(config).toContain('localhost:3000');
    expect(config).toContain('quick-test');
  });

  test('init generates commented config', async () => {
    let promptCall = 0;
    promptSpy = jest.spyOn(inquirer, 'prompt').mockImplementation(async () => {
      promptCall++;
      if (promptCall === 1) return { setupMode: 'quick' };
      if (promptCall === 2) return { project: 'commented-test', stack: 'nextjs' };
      if (promptCall === 3) return { targetName: 'claude-code' };
      return {};
    });

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    const config = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(config).toContain('# Bobby Configuration');
    expect(config).toContain('# Project name');
    expect(config).toContain('# Optional configuration');
  });

  test('init handles error gracefully', async () => {
    promptSpy = jest.spyOn(inquirer, 'prompt').mockRejectedValue(new Error('prompt failed'));

    const program = mockProgram();
    registerInit(program);
    await program.getAction()();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('loadStack (custom stacks)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-stack-'));
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('loadStack finds local stack in .bobby/stacks/', () => {
    const stacksDir = path.join(tmpDir, '.bobby', 'stacks');
    fs.mkdirSync(stacksDir, { recursive: true });
    fs.writeFileSync(path.join(stacksDir, 'django.json'), JSON.stringify({
      name: 'django', display: 'Django',
      health_checks: [{ name: 'app', url: 'http://localhost:8000' }],
      areas: ['api'], commands: { test: 'pytest' },
    }));

    const stack = loadStack('django', tmpDir);
    expect(stack).not.toBeNull();
    expect(stack.name).toBe('django');
    expect(stack.commands.test).toBe('pytest');
  });

  test('loadStack falls back to bundled stack when no local stack exists', () => {
    const stack = loadStack('nextjs', tmpDir);
    expect(stack).not.toBeNull();
    expect(stack.name).toBe('nextjs');
  });

  test('loadStack prefers local stack over bundled stack', () => {
    const stacksDir = path.join(tmpDir, '.bobby', 'stacks');
    fs.mkdirSync(stacksDir, { recursive: true });
    fs.writeFileSync(path.join(stacksDir, 'nextjs.json'), JSON.stringify({
      name: 'nextjs', display: 'Custom Next.js',
      health_checks: [{ name: 'app', url: 'http://localhost:4000' }],
      areas: ['custom'], commands: { test: 'custom-test' },
    }));

    const stack = loadStack('nextjs', tmpDir);
    expect(stack.commands.test).toBe('custom-test');
    expect(stack.areas).toEqual(['custom']);
  });

  test('loadStack returns null for unknown stack without local override', () => {
    const stack = loadStack('nonexistent', tmpDir);
    expect(stack).toBeNull();
  });

  test('loadStack works without projectRoot (backward compat)', () => {
    const stack = loadStack('nextjs');
    expect(stack).not.toBeNull();
    expect(stack.name).toBe('nextjs');
  });
});
