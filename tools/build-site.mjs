// node tools/build-site.mjs [outDir=_site]: copies only the files the game needs for static
// hosting (GitHub Pages). No bundling: the game runs as plain ES modules with relative paths.
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || '_site');
const ENTRIES = ['index.html', '404.html', 'viewer.html', 'manifest.webmanifest', 'sw.js', 'src', 'styles', 'data', 'vendor', 'assets/models', 'assets/icons'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const e of ENTRIES) {
  const from = join(root, e);
  if (!existsSync(from)) throw new Error(`missing ${e}`);
  cpSync(from, join(out, e), { recursive: true });
}
writeFileSync(join(out, '.nojekyll'), '');

// every data file in one request (src/core/content.js browserReadJson reads it first)
const dataDir = join(out, 'data');
const bundle = {};
for (const d of readdirSync(dataDir, { recursive: true, withFileTypes: true })) {
  if (!d.isFile() || !d.name.endsWith('.json')) continue;
  const rel = join(d.parentPath, d.name).slice(dataDir.length + 1).replaceAll('\\', '/');
  bundle[rel] = JSON.parse(readFileSync(join(dataDir, rel), 'utf8'));
}
writeFileSync(join(dataDir, 'bundle.json'), JSON.stringify(bundle));
// mark the page so the loader asks for the bundle (the dev server has none: no 404 there)
const indexHtml = readFileSync(join(out, 'index.html'), 'utf8');
if (!indexHtml.includes('</head>')) throw new Error('index.html: no </head>');
writeFileSync(join(out, 'index.html'), indexHtml.replace('</head>', '  <meta name="tds-data-bundle" content="1">\n</head>'));
console.log(`data bundle: ${Object.keys(bundle).length} files`);

// Service worker: list every file (offline play) and stamp a build id made from their contents,
// so a deploy with any changed file gets a fresh cache and an unchanged one keeps the old.
const files = readdirSync(out, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => join(d.parentPath, d.name).slice(out.length + 1).replaceAll('\\', '/'))
  .filter((f) => f !== 'sw.js' && f !== '.nojekyll' && f !== 'viewer.html' && f !== '404.html')
  .sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
const build = hash.digest('hex').slice(0, 12);
const sw = readFileSync(join(out, 'sw.js'), 'utf8');
if (!sw.includes("const BUILD = 'dev';") || !sw.includes('const PRECACHE = [];')) throw new Error('sw.js: BUILD / PRECACHE markers missing');
// pack models (most of the download) are cached when a match first loads them, not up front
const pre = files.filter((f) => !/^assets\/models\/(kenney|quaternius)\//.test(f));
writeFileSync(join(out, 'sw.js'), sw.replace("const BUILD = 'dev';", `const BUILD = '${build}';`).replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(['./', ...pre])};`));
console.log(`service worker: build ${build}, ${pre.length} of ${files.length} files precached`);
console.log(`site built in ${out}: ${ENTRIES.join(', ')}`);
