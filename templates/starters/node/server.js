import http from 'http';

// Route table — key is "METHOD /path". Add new routes here as the app grows.
const routes = {
  'GET /': (req, res) => json(res, 200, { name: 'app', status: 'running' }),
  'GET /health': (req, res) => json(res, 200, { status: 'ok' }),
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function handle(req, res) {
  const route = routes[`${req.method} ${req.url}`];
  if (route) return route(req, res);
  json(res, 404, { error: 'not found' });
}

export function createServer() {
  return http.createServer(handle);
}

// Start only when run directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`listening on http://localhost:${port}`));
}
