// test/lib/services.test.js
import {
  detectServices, resolveServices, aggregateHealthChecks, aggregateAreas,
} from '../../lib/services.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('services', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-services-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('detectServices', () => {
    test('detects dotnet project by .csproj file', () => {
      const svcDir = path.join(tmpDir, 'auth-api');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'AuthApi.csproj'), '<Project/>');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].name).toBe('auth-api');
      expect(detected[0].language).toBe('dotnet');
      expect(detected[0].commands.test).toBe('dotnet test');
    });

    test('detects ruby project by Gemfile', () => {
      const svcDir = path.join(tmpDir, 'notifications');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'Gemfile'), 'source "https://rubygems.org"');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('ruby');
      expect(detected[0].commands.test).toBe('bundle exec rspec');
    });

    test('detects python project by requirements.txt', () => {
      const svcDir = path.join(tmpDir, 'ml-pipeline');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'requirements.txt'), 'flask==2.0');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('python');
      expect(detected[0].commands.test).toBe('pytest');
    });

    test('detects python project by pyproject.toml', () => {
      const svcDir = path.join(tmpDir, 'ml-service');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'pyproject.toml'), '[project]');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('python');
    });

    test('detects javascript project by package.json', () => {
      const svcDir = path.join(tmpDir, 'web-ui');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'package.json'), '{}');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('javascript');
      expect(detected[0].commands.test).toBe('npm test');
    });

    test('detects go project by go.mod', () => {
      const svcDir = path.join(tmpDir, 'gateway');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'go.mod'), 'module gateway');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('go');
      expect(detected[0].commands.test).toBe('go test ./...');
    });

    test('detects rust project by Cargo.toml', () => {
      const svcDir = path.join(tmpDir, 'engine');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'Cargo.toml'), '[package]');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('rust');
    });

    test('detects java project by pom.xml', () => {
      const svcDir = path.join(tmpDir, 'billing');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'pom.xml'), '<project/>');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].language).toBe('java');
    });

    test('detects multiple services', () => {
      fs.mkdirSync(path.join(tmpDir, 'api'));
      fs.writeFileSync(path.join(tmpDir, 'api', 'AuthApi.csproj'), '');
      fs.mkdirSync(path.join(tmpDir, 'ui'));
      fs.writeFileSync(path.join(tmpDir, 'ui', 'package.json'), '{}');
      fs.mkdirSync(path.join(tmpDir, 'worker'));
      fs.writeFileSync(path.join(tmpDir, 'worker', 'Gemfile'), '');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(3);
      const languages = detected.map(d => d.language).sort();
      expect(languages).toEqual(['dotnet', 'javascript', 'ruby']);
    });

    test('detects nested services (2 levels deep)', () => {
      const servicesDir = path.join(tmpDir, 'services');
      fs.mkdirSync(servicesDir);
      const nestedDir = path.join(servicesDir, 'auth-api');
      fs.mkdirSync(nestedDir);
      fs.writeFileSync(path.join(nestedDir, 'AuthApi.csproj'), '');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(1);
      expect(detected[0].name).toBe('auth-api');
      expect(detected[0].path).toBe(path.join('services', 'auth-api'));
    });

    test('skips node_modules and hidden directories', () => {
      fs.mkdirSync(path.join(tmpDir, 'node_modules'));
      fs.writeFileSync(path.join(tmpDir, 'node_modules', 'package.json'), '{}');
      fs.mkdirSync(path.join(tmpDir, '.git'));
      fs.writeFileSync(path.join(tmpDir, '.git', 'package.json'), '{}');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(0);
    });

    test('returns empty array for directory with no services', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs'));
      fs.writeFileSync(path.join(tmpDir, 'docs', 'README.md'), '# Docs');

      const detected = detectServices(tmpDir);
      expect(detected).toHaveLength(0);
    });

    test('returns correct relative paths', () => {
      const svcDir = path.join(tmpDir, 'my-api');
      fs.mkdirSync(svcDir);
      fs.writeFileSync(path.join(svcDir, 'requirements.txt'), '');

      const detected = detectServices(tmpDir);
      expect(detected[0].path).toBe('my-api');
    });
  });

  describe('resolveServices', () => {
    const config = {
      services: {
        'auth-api': { path: 'services/auth-api', language: 'dotnet', areas: ['auth', 'identity'], commands: { test: 'dotnet test' } },
        'web-ui': { path: 'web-ui', language: 'javascript', areas: ['dashboard', 'admin'], commands: { test: 'npm test' } },
        'ml-pipeline': { path: 'services/ml', language: 'python', areas: ['ml'], commands: { test: 'pytest' } },
      },
    };

    test('returns explicit services from ticket data', () => {
      const result = resolveServices(config, { services: ['auth-api', 'web-ui'] });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('auth-api');
      expect(result[1].name).toBe('web-ui');
    });

    test('filters out unknown service names', () => {
      const result = resolveServices(config, { services: ['auth-api', 'nonexistent'] });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('auth-api');
    });

    test('resolves services from area', () => {
      const result = resolveServices(config, { area: 'auth' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('auth-api');
    });

    test('resolves services from area with multiple matches', () => {
      const multiConfig = {
        services: {
          'api': { areas: ['shared'], commands: {} },
          'ui': { areas: ['shared'], commands: {} },
        },
      };
      const result = resolveServices(multiConfig, { area: 'shared' });
      expect(result).toHaveLength(2);
    });

    test('returns all services when no resolution possible', () => {
      const result = resolveServices(config, {});
      expect(result).toHaveLength(3);
    });

    test('returns all services when area has no matches', () => {
      const result = resolveServices(config, { area: 'nonexistent-area' });
      expect(result).toHaveLength(3);
    });

    test('returns empty array when no services configured', () => {
      expect(resolveServices({}, { services: ['api'] })).toEqual([]);
      expect(resolveServices({ services: {} }, { services: ['api'] })).toEqual([]);
    });

    test('explicit services take precedence over area', () => {
      const result = resolveServices(config, { services: ['web-ui'], area: 'auth' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('web-ui');
    });
  });

  describe('aggregateHealthChecks', () => {
    test('returns top-level checks when no services', () => {
      const config = { health_checks: [{ name: 'app', url: 'http://localhost:3000' }] };
      expect(aggregateHealthChecks(config)).toEqual([{ name: 'app', url: 'http://localhost:3000' }]);
    });

    test('merges service health checks with top-level', () => {
      const config = {
        health_checks: [{ name: 'app', url: 'http://localhost:3000' }],
        services: {
          'api': { health_checks: [{ name: 'api', url: 'http://localhost:5000' }] },
          'ui': { health_checks: [{ name: 'ui', url: 'http://localhost:3001' }] },
        },
      };
      const result = aggregateHealthChecks(config);
      expect(result).toHaveLength(3);
    });

    test('handles services with no health checks', () => {
      const config = {
        health_checks: [],
        services: {
          'worker': { commands: {} },
          'api': { health_checks: [{ name: 'api', url: 'http://localhost:5000' }] },
        },
      };
      const result = aggregateHealthChecks(config);
      expect(result).toHaveLength(1);
    });
  });

  describe('aggregateAreas', () => {
    test('returns top-level areas when no services', () => {
      const config = { areas: ['auth', 'dashboard'] };
      expect(aggregateAreas(config)).toEqual(['auth', 'dashboard']);
    });

    test('merges service areas with top-level and deduplicates', () => {
      const config = {
        areas: ['auth', 'infra'],
        services: {
          'api': { areas: ['auth', 'billing'] },
          'ui': { areas: ['dashboard'] },
        },
      };
      const result = aggregateAreas(config);
      expect(result).toContain('auth');
      expect(result).toContain('infra');
      expect(result).toContain('billing');
      expect(result).toContain('dashboard');
      // auth should appear only once
      expect(result.filter(a => a === 'auth')).toHaveLength(1);
    });

    test('handles services with no areas', () => {
      const config = {
        areas: ['core'],
        services: {
          'worker': { commands: {} },
        },
      };
      const result = aggregateAreas(config);
      expect(result).toEqual(['core']);
    });
  });
});
