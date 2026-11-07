// test/lib/ticket-logs.test.js — TKT-086
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  STUDIO_TICKET_LOG_PATTERN, ticketLogPattern, ensureGitignoreLines,
  summarizeLog, extractResult, extractFailures, stripAnsi,
} from '../../lib/ticket-logs.js';

const RSPEC = [
  ...Array.from({ length: 300 }, (_, i) => `line ${i}`),
  'Failed examples:',
  '',
  'rspec ./spec/models/user_spec.rb:12 # User is valid',
  'rspec ./spec/models/user_spec.rb:20 # User has a name',
  'Finished in 4.2 seconds (files took 1.1 seconds to load)',
  '120 examples, 2 failures',
  'EXITCODE=1',
].join('\n');

describe('summarizeLog', () => {
  test('rspec: result lines, failures and exactly the last 100 lines', () => {
    const md = summarizeLog(RSPEC, { name: 'rspec.log', source: '/tmp/rspec.log', command: 'bundle exec rspec' });
    expect(md).toContain('- Command: bundle exec rspec');
    expect(md).toContain('Finished in 4.2 seconds');
    expect(md).toContain('120 examples, 2 failures');
    expect(md).toContain('EXITCODE=1');
    const failures = md.split('## Failures')[1].split('## Last 100 lines')[0];
    expect(failures).toContain('rspec ./spec/models/user_spec.rb:12 # User is valid');
    expect(failures).toContain('rspec ./spec/models/user_spec.rb:20 # User has a name');
    const tail = md.split('~~~~text\n')[1].split('\n~~~~')[0].split('\n');
    expect(tail).toEqual(RSPEC.split('\n').slice(-100));
  });

  test('jest: Tests/Test Suites lines and FAIL/● failures, ANSI stripped', () => {
    const jest = [
      '\x1b[31mFAIL\x1b[0m test/a.test.js',
      '  \x1b[1m● suite › does x\x1b[0m',
      'Test Suites: 1 failed, 3 passed, 4 total',
      'Tests:       1 failed, 40 passed, 41 total',
    ].join('\n');
    const md = summarizeLog(jest, { name: 'jest.log', source: '/tmp/jest.log' });
    expect(md).toContain('Test Suites: 1 failed, 3 passed, 4 total');
    expect(md).toContain('Tests:       1 failed, 40 passed, 41 total');
    expect(md).not.toContain('\x1b');
    const failures = md.split('## Failures')[1].split('## Last 100 lines')[0];
    expect(failures).toContain('FAIL test/a.test.js');
    expect(failures).toContain('● suite › does x');
  });

  test('says so when nothing is recognised, instead of guessing', () => {
    const md = summarizeLog('hello\nworld', { name: 'x.log', source: '/tmp/x' });
    expect(md).toContain('Result: no rspec or jest summary line found');
    expect(md).toContain('Command: not recorded (pass --cmd)');
    expect(md).toContain('## Failures\nNone found.');
  });

  test('a log containing ``` fences cannot break out of the summary fence', () => {
    const md = summarizeLog('before\n```\ncode\n```\nafter', { name: 'x.log', source: '/tmp/x' });
    expect(md).toContain('~~~~text\nbefore\n```\ncode\n```\nafter\n~~~~');
  });
});

describe('extractors', () => {
  test('failures are capped at 50 with an "… and N more" line', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `rspec ./spec/a_spec.rb:${i} # x`);
    const out = extractFailures(lines);
    expect(out).toHaveLength(51);
    expect(out[50]).toBe('… and 10 more');
  });

  test('extractResult trims and keeps order', () => {
    expect(extractResult(['  Finished in 1s', 'noise', '3 examples, 0 failures'])).toEqual(['Finished in 1s', '3 examples, 0 failures']);
  });

  test('stripAnsi removes colour codes', () => {
    expect(stripAnsi('\x1b[32mok\x1b[0m')).toBe('ok');
  });
});

describe('ticketLogPattern / ensureGitignoreLines', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-tlog-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('pattern follows tickets_dir, studio uses the all-projects pattern', () => {
    expect(ticketLogPattern({ tickets_dir: '.bobby/tickets' })).toBe('.bobby/tickets/*/**/*.log');
    expect(ticketLogPattern({ studio: true, tickets_dir: 'x' })).toBe(STUDIO_TICKET_LOG_PATTERN);
  });

  test('creates a missing file, never joins onto an unterminated last line, and is idempotent', () => {
    const gi = path.join(tmp, '.gitignore');
    expect(ensureGitignoreLines(tmp, ['a/'])).toEqual(['a/']);
    fs.writeFileSync(gi, 'node_modules/');
    expect(ensureGitignoreLines(tmp, ['b/'])).toEqual(['b/']);
    expect(fs.readFileSync(gi, 'utf8')).toBe('node_modules/\nb/\n');
    expect(ensureGitignoreLines(tmp, ['b/', 'node_modules/'])).toEqual([]);
    expect(fs.readFileSync(gi, 'utf8')).toBe('node_modules/\nb/\n');
  });
});

describe('shipped templates reference --log', () => {
  const read = (p) => fs.readFileSync(path.resolve('templates', p), 'utf8');

  test('bobby-test and bobby-ship skill text, WORKFLOW.md and gitignore', () => {
    expect(read('skills/bobby-test/SKILL.md.ejs')).toMatch(/bobby ticket attach \{ID\} <file> --log/);
    const ship = read('skills/bobby-ship/SKILL.md.ejs');
    expect(ship).toMatch(/bobby ticket attach \{ID\} <log> --log/);
    expect(ship).toContain('.log.md');
    expect(read('WORKFLOW.md.ejs')).toContain('bobby ticket attach TKT-001 out.log --log');
    expect(read('gitignore.ejs')).toContain('.bobby/tickets/*/**/*.log');
  });
});
