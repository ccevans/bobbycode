import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from '../server.js';
import * as store from '../store.js';

beforeEach(() => store.reset());

// Helper: start server on ephemeral port, send a request, resolve the response.
function req(method, path, body) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const { port } = server.address();
      const r = http.request({ port, method, path, headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); });
      });
      r.on('error', reject);
      if (body !== undefined) r.write(JSON.stringify(body));
      r.end();
    });
  });
}
export { req };

test('GET /notes returns an empty array initially', async () => {
  const { status, body } = await req('GET', '/notes');
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, []);
});

test('POST /notes creates a note and GET returns it', async () => {
  const created = await req('POST', '/notes', { title: 'First', body: 'hi' });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.title, 'First');
  const list = await req('GET', '/notes');
  assert.strictEqual(list.body.length, 1);
});

test('GET /notes/:id returns the note, 404 when missing', async () => {
  await req('POST', '/notes', { title: 'A' });
  const ok = await req('GET', '/notes/1');
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.title, 'A');
  const missing = await req('GET', '/notes/999');
  assert.strictEqual(missing.status, 404);
});
