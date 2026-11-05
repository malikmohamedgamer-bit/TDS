// node tools/build-site.mjs [outDir=_site]: copies only the files the game needs for static
// hosting (GitHub Pages). No bundling: the game runs as plain ES modules with relative paths.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.argv[2] || '_site');
const ENTRIES = ['index.html', 'viewer.html', 'src', 'styles', 'data', 'vendor', 'assets/models'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const e of ENTRIES) {
  const from = join(root, e);
  if (!existsSync(from)) throw new Error(`missing ${e}`);
  cpSync(from, join(out, e), { recursive: true });
}
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site built in ${out}: ${ENTRIES.join(', ')}`);
