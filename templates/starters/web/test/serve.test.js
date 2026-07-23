import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from '../server.js';

function get(path) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const { port } = server.address();
      http.get({ port, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, body, type: res.headers['content-type'] }); });
      }).on('error', reject);
    });
  });
}

test('GET / serves the index page', async () => {
  const { status, body, type } = await get('/');
  assert.strictEqual(status, 200);
  assert.match(type, /text\/html/);
  assert.match(body, /<h1>/);
});

test('unknown asset returns 404', async () => {
  const { status } = await get('/does-not-exist.js');
  assert.strictEqual(status, 404);
});
