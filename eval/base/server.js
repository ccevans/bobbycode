import http from 'http';
import * as store from './store.js';

// Tiny router. Routes are matched by method + a path pattern that may contain
// one ':param'. Add new routes to the `routes` array. Handlers receive
// (req, res, params, query).
const routes = [
  { method: 'GET', pattern: '/notes', handler: listNotes },
  { method: 'POST', pattern: '/notes', handler: createNote },
  { method: 'GET', pattern: '/notes/:id', handler: getNote },
];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function listNotes(req, res) {
  json(res, 200, store.all());
}

function getNote(req, res, params) {
  const note = store.get(Number(params.id));
  if (!note) return json(res, 404, { error: 'not found' });
  json(res, 200, note);
}

async function createNote(req, res) {
  const body = await readJson(req);
  const note = store.create({ title: body.title || '', body: body.body || '' });
  json(res, 201, note);
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

// Match a request path against a route pattern, extracting :params.
function match(pattern, path) {
  const pParts = pattern.split('/');
  const uParts = path.split('/');
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = uParts[i];
    else if (pParts[i] !== uParts[i]) return null;
  }
  return params;
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = match(route.pattern, url.pathname);
    if (params) return route.handler(req, res, params, query);
  }
  json(res, 404, { error: 'not found' });
}

export function createServer() {
  return http.createServer((req, res) => { handle(req, res); });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`notes-api on http://localhost:${port}`));
}
