// Serves dist/ the way GitHub Pages serves a project site: static files under
// /<repo>/, directory index.html, 301 from /<repo> to /<repo>/, 404 for
// anything else (no SPA fallback). Used by the Playwright suite.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const base = process.env.BASE_PATH ?? '/fight-timer/';
const root = process.env.DIST ?? 'dist';
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === base.slice(0, -1)) { res.writeHead(301, { Location: base }); return res.end(); }
  if (!url.pathname.startsWith(base)) { res.writeHead(404); return res.end('404'); }
  let rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404</h1>');
  }
}).listen(port, () => console.log(`pages-like server on http://localhost:${port}${base}`));
