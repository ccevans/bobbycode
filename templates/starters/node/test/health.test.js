import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from '../server.js';

// Fire a request at an ephemeral-port server and resolve the response.
function request(method, path) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const { port } = server.address();
      http.request({ port, method, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, body }); });
      }).on('error', reject).end();
    });
  });
}

test('GET /health returns 200 and {"status":"ok"}', async () => {
  const { status, body } = await request('GET', '/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(body, '{"status":"ok"}');
});

test('GET / returns 200 and running status', async () => {
  const { status, body } = await request('GET', '/');
  assert.strictEqual(status, 200);
  assert.match(body, /running/);
});

test('unknown route returns 404', async () => {
  const { status } = await request('GET', '/nope');
  assert.strictEqual(status, 404);
});
