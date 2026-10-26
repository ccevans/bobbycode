// test/lib/scope-rule-templates.test.js
// The "Stay in the ticket" rule is shipped prose; these tests pin that it reaches
// every rendered file that needs it.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scaffoldProject } from '../../commands/init.js';

describe('Stay in the ticket — rendered templates', () => {
  let tmpDir;
  const read = (...p) => fs.readFileSync(path.join(tmpDir, ...p), 'utf8');

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-scope-rule-'));
    scaffoldProject(tmpDir, {
      project: 'p', stack: 'nextjs', health_checks: [], areas: [],
      commands: { dev: 'npm run dev', test: 'npm test', lint: 'npm run lint' },
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });
  });
  afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('a fresh CLAUDE.md carries the rule above bobby:end', () => {
    const md = read('CLAUDE.md');
    const rule = md.indexOf('## Stay in the ticket');
    expect(rule).toBeGreaterThan(-1);
    expect(rule).toBeLessThan(md.indexOf('<!-- bobby:end -->'));
    const section = md.slice(rule, md.indexOf('\n## ', rule + 5));
    for (const needle of ['bobby ticket create', '--found-in', 'Filed:', '-p critical', 'Decision needed', 'block', 'git diff --stat']) {
      expect(section).toContain(needle);
    }
    expect(md).toContain('bobby ticket triage');
  });

  test('shipped bobby-shared carries the same rule', () => {
    const shared = read('.claude', 'skills', 'bobby-shared', 'learnings.md');
    const at = shared.indexOf('### stay-in-the-ticket');
    expect(at).toBeGreaterThan(-1);
    const entry = shared.slice(at, shared.indexOf('\n## ', at));
    for (const needle of ['bobby ticket create', '--found-in', 'Filed:', 'Decision needed']) {
      expect(entry).toContain(needle);
    }
  });

  const stageFiles = [
    ['bobby-build', ['.claude', 'skills', 'bobby-build', 'SKILL.md']],
    ['bobby-debug', ['.claude', 'skills', 'bobby-debug', 'SKILL.md']],
    ['bobby-test', ['.claude', 'skills', 'bobby-test', 'SKILL.md']],
    ['bobby-ship', ['.claude', 'skills', 'bobby-ship', 'SKILL.md']],
    ['bobby-review', ['.claude', 'skills', 'bobby-review', 'SKILL.md']],
    ['bobby-freewill', ['.claude', 'skills', 'bobby-freewill', 'SKILL.md']],
    ['bobby-plan', ['.claude', 'skills', 'bobby-plan', 'SKILL.md']],
    ['bobby-design-build', ['.claude', 'agents', 'bobby-design-build.md']],
    ['bobby-design-check', ['.claude', 'agents', 'bobby-design-check.md']],
  ];

  test.each(stageFiles)('%s has its own scope step', (agent, file) => {
    const text = read(...file);
    expect(text).toContain('bobby ticket create');
    expect(text).toContain('--found-in {ID}');
    expect(text).toContain(`-a ${agent}`);
    expect(text).toContain('Filed:');
  });

  test('bobby-review rejects out-of-plan changes and reads the scope-check comment', () => {
    const text = read('.claude', 'skills', 'bobby-review', 'SKILL.md');
    expect(text).toContain('rejection reason');
    expect(text).toContain('revert it');
    expect(text).toContain('Scope check:');
  });

  test('bobby-freewill keeps its file contract: the rule is a paragraph, not a new section', () => {
    const text = read('.claude', 'skills', 'bobby-freewill', 'SKILL.md');
    expect(text.match(/^## /gm)).toHaveLength(7);
  });
});
