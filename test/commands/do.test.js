// test/commands/do.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('bobby do', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) =>
    execSync(`node ${bobby} ${args}`, {
      cwd: tmpDir, encoding: 'utf8',
      env: { ...process.env, HOME: path.join(tmpDir, '.home') },
    });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-do-'));
    fs.mkdirSync(path.join(tmpDir, '.home'), { recursive: true });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('emits a dispatch prompt embedding the request and the capability catalog', () => {
    const out = run('do "add a health check endpoint"');
    expect(out).toContain('add a health check endpoint');
    // The catalog and routing rules are present
    expect(out).toContain('What Bobby can do');
    expect(out).toContain('bobby go');
    expect(out).toContain('bobby vet');
    expect(out).toContain('How to route');
  });

  test('works with unquoted multi-word requests', () => {
    const out = run('do make sure we are not leaking secrets');
    expect(out).toContain('make sure we are not leaking secrets');
    expect(out).toContain('security'); // the security capability is in the catalog
  });

  test('the routing guidance covers resolving an id / falling back to go', () => {
    const out = run('do "the login button does nothing"');
    expect(out).toContain('the login button does nothing');
    // Fresh-symptom guidance: default to bobby go when there is no ticket
    expect(out).toMatch(/no ticket/i);
    expect(out).toContain('bobby ticket list');
  });

  test('requires a request', () => {
    expect(() => run('do')).toThrow(); // commander: missing required arg
  });
});
