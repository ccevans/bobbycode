import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

export function handle(req, res) {
  const rel = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(root, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

export function createServer() {
  return http.createServer(handle);
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`serving ./public on http://localhost:${port}`));
}
