// Minimal static file server for dist/, used only for local Tampermonkey
// @require dev-loading. Binds to localhost only — not exposed to the
// network. Run with: npm run serve

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 8787;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/build-id') {
    try {
      const buildId = await readFile(path.join(DIST_DIR, 'build-id.txt'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(buildId.trim());
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('no build yet');
    }
    return;
  }

  // Everything else serves the one bundle file we care about, regardless
  // of path, to keep this trivially safe as a localhost-only dev tool.
  const filePath = path.join(DIST_DIR, 'pvzhtbot-mod.user.js');
  try {
    const body = await readFile(filePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not built yet — run npm run build first.\n${err.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dev server serving dist/pvzhtbot-mod.user.js at http://127.0.0.1:${PORT}/pvzhtbot-mod.user.js`);
  console.log('Ctrl+C to stop.');
});
