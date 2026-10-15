// Minimal dependency-free dev server for the MedPass demo UI.
//   npm run web   →  http://localhost:12000
// Serves web/ as static files and /api/demo as fresh JSON from the real
// compiled circuits (recomputed per request; the demo is deterministic).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { runDemo } from './demo-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..', 'web');
const port = Number(process.env.PORT ?? 12000);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/api/demo') {
      const state = runDemo();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }

    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const path = join(webRoot, normalize(rel));
    if (!path.startsWith(webRoot)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const body = await readFile(path);
    const ext = path.slice(path.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
    res.writeHead(code, { 'content-type': 'text/plain' });
    res.end(code === 404 ? 'not found' : String(e));
  }
});

server.listen(port, () => {
  console.log(`MedPass demo → http://localhost:${port}`);
});
