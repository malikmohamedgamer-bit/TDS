// Copies the pinned Three.js build plus the addon modules we use (and everything they import)
// from node_modules into vendor/three so the game never needs a CDN at runtime.
// Usage: node tools/vendor-three.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'three');
const out = join(root, 'vendor', 'three');

const ENTRY_ADDONS = [
  'loaders/GLTFLoader.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/ShaderPass.js',
  'utils/SkeletonUtils.js',
  'utils/BufferGeometryUtils.js',
];

if (!existsSync(src)) {
  console.error('node_modules/three missing: run npm install first');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });

const copied = new Set();
function copy(rel) {
  if (copied.has(rel)) return;
  copied.add(rel);
  const from = join(src, rel);
  const to = join(out, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  if (!rel.endsWith('.js')) return;
  const code = readFileSync(from, 'utf8');
  const re = /(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    const dep = relative(src, resolve(dirname(from), m[1])).split('\\').join('/');
    copy(dep);
  }
}

copy('build/three.module.js');
copy('LICENSE');
for (const a of ENTRY_ADDONS) copy(`examples/jsm/${a}`);

writeFileSync(join(out, 'VERSION.txt'), `three ${pkg.version}\nfiles: ${copied.size}\n`);
console.log(`Vendored three ${pkg.version}: ${copied.size} files -> vendor/three`);
