// Zero-dependency static dev server. `npm run dev` -> http://localhost:5173
// Options: --port 5173, --host 0.0.0.0 (to test on a phone on the same Wi-Fi), --root _site.
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
// --root _site serves the built static site (what GitHub Pages hosts)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', arg('root', '.'));
const port = Number(arg('port', process.env.PORT || 5173));
const host = arg('host', process.env.HOST || '127.0.0.1');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/hub-sdk.js') { // on GitHub Pages the Game Hub serves this at the site root
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end('// Local stand-in for the Game Hub SDK, which GitHub Pages serves at the site root (malikmohamedgamer-bit.github.io/hub-sdk.js).\n');
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${rel}`);
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

server.listen(port, host, () => {
  console.log(`TDS dev server: http://localhost:${port}/`);
  if (host === '0.0.0.0') {
    for (const list of Object.values(networkInterfaces())) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${port}/`);
      }
    }
  }
});
