// test/lib/local-discovery.test.js
import { parseComposeFile, findComposeFiles, detectUiProject, classifyServices, buildProfileFromDiscovery, discoverLocalSetup } from '../../lib/local-discovery.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('local-discovery', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-local-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('parseComposeFile', () => {
    test('parses services and port mappings', () => {
      const composePath = path.join(tmpDir, 'docker-compose.yml');
      fs.writeFileSync(composePath, `
name: my_project
services:
  web:
    build: .
    ports:
      - "3010:3000"
  db:
    image: postgres:14
    ports:
      - "5433:5432"
  redis:
    image: redis:7-alpine
`);
      const result = parseComposeFile(composePath);
      expect(result.composeProject).toBe('my_project');
      expect(result.services).toHaveLength(3);
      expect(result.services[0].name).toBe('web');
      expect(result.services[0].ports).toEqual([{ host: 3010, container: 3000 }]);
      expect(result.services[1].name).toBe('db');
      expect(result.services[1].ports).toEqual([{ host: 5433, container: 5432 }]);
      expect(result.services[2].name).toBe('redis');
      expect(result.services[2].ports).toEqual([]);
    });

    test('handles compose file without name field', () => {
      const composePath = path.join(tmpDir, 'docker-compose.yml');
      fs.writeFileSync(composePath, `
services:
  app:
    build: .
    ports:
      - "8080:3000"
`);
      const result = parseComposeFile(composePath);
      expect(result.composeProject).toBeNull();
      expect(result.services[0].ports).toEqual([{ host: 8080, container: 3000 }]);
    });

    test('handles bind address in port mapping', () => {
      const composePath = path.join(tmpDir, 'docker-compose.yml');
      fs.writeFileSync(composePath, `
services:
  web:
    ports:
      - "0.0.0.0:3010:3000"
`);
      const result = parseComposeFile(composePath);
      expect(result.services[0].ports).toEqual([{ host: 3010, container: 3000 }]);
    });

    test('returns null for file without services', () => {
      const composePath = path.join(tmpDir, 'docker-compose.yml');
      fs.writeFileSync(composePath, 'version: "3"\n');
      const result = parseComposeFile(composePath);
      expect(result).toBeNull();
    });
  });

  describe('findComposeFiles', () => {
    test('finds compose files in root', () => {
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services:\n  web:\n    build: .\n');
      const results = findComposeFiles(tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].relativeTo).toBe('.');
    });

    test('finds compose files in subdirectories', () => {
      const subDir = path.join(tmpDir, 'api');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'docker-compose.yml'), 'services:\n  web:\n    build: .\n');
      const results = findComposeFiles(tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].relativeTo).toBe('api');
    });

    test('finds compose.yml variant', () => {
      fs.writeFileSync(path.join(tmpDir, 'compose.yml'), 'services:\n  web:\n    build: .\n');
      const results = findComposeFiles(tmpDir);
      expect(results).toHaveLength(1);
    });

    test('returns empty array when no compose files', () => {
      const results = findComposeFiles(tmpDir);
      expect(results).toEqual([]);
    });
  });

  describe('detectUiProject', () => {
    test('detects Next.js project', () => {
      const uiDir = path.join(tmpDir, 'frontend');
      fs.mkdirSync(uiDir);
      fs.writeFileSync(path.join(uiDir, 'package.json'), JSON.stringify({
        scripts: { dev: 'next dev' },
        dependencies: { next: '14.0.0', react: '18.0.0' },
      }));
      const result = detectUiProject(tmpDir);
      expect(result).not.toBeNull();
      expect(result.framework).toBe('nextjs');
      expect(result.path).toBe('frontend');
      expect(result.devCommand).toBe('npm run dev');
    });

    test('detects Vite project', () => {
      const uiDir = path.join(tmpDir, 'ui');
      fs.mkdirSync(uiDir);
      fs.writeFileSync(path.join(uiDir, 'package.json'), JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { vite: '5.0.0', react: '18.0.0' },
      }));
      const result = detectUiProject(tmpDir);
      expect(result).not.toBeNull();
      expect(result.framework).toBe('vite');
    });

    test('checks repo paths first', () => {
      const repoDir = path.join(tmpDir, 'my-ui');
      fs.mkdirSync(repoDir);
      fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
        scripts: { dev: 'next dev' },
        dependencies: { next: '14.0.0', react: '18.0.0' },
      }));
      const result = detectUiProject(tmpDir, [{ name: 'ui', path: 'my-ui' }]);
      expect(result).not.toBeNull();
      expect(result.path).toBe('my-ui');
    });

    test('returns null when no UI project found', () => {
      const result = detectUiProject(tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('classifyServices', () => {
    test('classifies standard service roles', () => {
      const services = [
        { name: 'web', image: '', build: true, ports: [{ host: 3010, container: 3000 }] },
        { name: 'db', image: 'postgres:14', build: false, ports: [{ host: 5433, container: 5432 }] },
        { name: 'redis', image: 'redis:7-alpine', build: false, ports: [] },
        { name: 'worker', image: '', build: true, ports: [] },
      ];
      const result = classifyServices(services);
      expect(result.api.name).toBe('web');
      expect(result.db.name).toBe('db');
      expect(result.redis.name).toBe('redis');
      expect(result.workers).toHaveLength(1);
      expect(result.workers[0].name).toBe('worker');
    });

    test('detects postgres from image name', () => {
      const services = [
        { name: 'database', image: 'pgvector/pgvector:pg14', build: false, ports: [{ host: 5433, container: 5432 }] },
      ];
      const result = classifyServices(services);
      expect(result.db.name).toBe('database');
    });
  });

  describe('buildProfileFromDiscovery', () => {
    test('builds profile with correct ports', () => {
      const composeResult = { composeProject: 'myapp_dev', services: [] };
      const classified = {
        api: { name: 'web', ports: [{ host: 3010, container: 3000 }] },
        db: { name: 'db', ports: [{ host: 5433, container: 5432 }] },
        redis: { name: 'redis', ports: [] },
        workers: [],
      };
      const uiProject = { path: 'frontend', framework: 'nextjs', devCommand: 'npm run dev' };

      const profile = buildProfileFromDiscovery({
        composeResult,
        classified,
        uiProject,
        profileName: 'myapp',
      });

      expect(profile.compose_project).toBe('myapp_dev');
      expect(profile.ports.api).toBe(3010);
      expect(profile.ports.postgres).toBe(5433);
      expect(profile.ports.ui).toBe(3001);
      expect(profile.subdomain).toBe('myapp');
    });

    test('avoids port conflicts for UI', () => {
      const composeResult = { composeProject: null, services: [] };
      const classified = {
        api: { name: 'web', ports: [{ host: 3001, container: 3000 }] },
        db: null,
        redis: null,
        workers: [],
      };
      const uiProject = { path: 'ui', framework: 'nextjs', devCommand: 'npm run dev' };

      const profile = buildProfileFromDiscovery({
        composeResult,
        classified,
        uiProject,
        profileName: 'test',
      });

      // UI should avoid 3001 since API is using it
      expect(profile.ports.ui).not.toBe(3001);
    });
  });

  describe('discoverLocalSetup', () => {
    test('returns null when nothing is detected', () => {
      const result = discoverLocalSetup(tmpDir, {});
      expect(result).toBeNull();
    });

    test('discovers compose + UI project', () => {
      // Create compose file
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), `
services:
  web:
    build: .
    ports:
      - "3010:3000"
  db:
    image: postgres:14
    ports:
      - "5433:5432"
`);
      // Create UI project
      const uiDir = path.join(tmpDir, 'frontend');
      fs.mkdirSync(uiDir);
      fs.writeFileSync(path.join(uiDir, 'package.json'), JSON.stringify({
        scripts: { dev: 'next dev' },
        dependencies: { next: '14.0.0', react: '18.0.0' },
      }));

      const result = discoverLocalSetup(tmpDir, {});
      expect(result).not.toBeNull();
      expect(result.composeFiles).toHaveLength(1);
      expect(result.uiProject).not.toBeNull();
      expect(result.classified.api.name).toBe('web');
      expect(result.classified.db.name).toBe('db');
    });
  });
});
