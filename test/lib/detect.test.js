import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectProjectContext } from '../../lib/detect.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-detect-'));
}

describe('detectProjectContext', () => {
  let dir;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  test('empty directory returns isEmpty true', () => {
    dir = tmpDir();
    const ctx = detectProjectContext(dir);
    expect(ctx.isEmpty).toBe(true);
    expect(ctx.stack).toBeNull();
    expect(ctx.commands).toEqual({});
  });

  test('detects nextjs stack from package.json', () => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'my-nextjs-app',
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
      scripts: { dev: 'next dev', test: 'jest', lint: 'next lint', build: 'next build' },
    }));
    const ctx = detectProjectContext(dir);
    expect(ctx.isEmpty).toBe(false);
    expect(ctx.name).toBe('my-nextjs-app');
    expect(ctx.stack).toBe('nextjs');
    expect(ctx.commands.dev).toBe('npm run dev');
    expect(ctx.commands.test).toBe('npm test');
    expect(ctx.commands.lint).toBe('npm run lint');
    expect(ctx.commands.build).toBe('npm run build');
  });

  test('detects python stack from requirements.txt', () => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==3.0.0\n');
    const ctx = detectProjectContext(dir);
    expect(ctx.stack).toBe('python-flask');
  });

  test('detects dev port from script', () => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'test',
      scripts: { dev: 'next dev -p 3001' },
    }));
    const ctx = detectProjectContext(dir);
    expect(ctx.devPort).toBe(3001);
  });

  test('detects existing CLAUDE.md', () => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# My rules');
    const ctx = detectProjectContext(dir);
    expect(ctx.hasExistingRules).toBe('CLAUDE.md');
  });

  test('uses npm start as dev command when no dev script', () => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'test',
      scripts: { start: 'node server.js', test: 'jest' },
    }));
    const ctx = detectProjectContext(dir);
    expect(ctx.commands.dev).toBe('npm start');
    expect(ctx.commands.test).toBe('npm test');
  });

  test('detects polyglot from multiple language subdirs', () => {
    dir = tmpDir();
    // Create a JS subdir and a Python subdir
    fs.mkdirSync(path.join(dir, 'frontend'));
    fs.writeFileSync(path.join(dir, 'frontend', 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'backend'));
    fs.writeFileSync(path.join(dir, 'backend', 'requirements.txt'), 'flask\n');
    const ctx = detectProjectContext(dir);
    expect(ctx.stack).toBe('polyglot');
  });
});
