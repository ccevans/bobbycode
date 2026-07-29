// server.js — preview the built site locally. Static files out of ./public,
// no dependencies. Run `npm run dev` to build and serve in one step.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

export function handle(req, res) {
  const url = (req.url || '/').split('?')[0];
  const rel = url === '/' ? '/index.html' : url;
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

if (process.argv[1] && path.basename(process.argv[1]) === 'server.js') {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`blog preview → http://localhost:${port}`));
}
