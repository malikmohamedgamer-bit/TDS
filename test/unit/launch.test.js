// Launch checks: version string matches package.json, manifest and icons exist, the 404 page links home,
// the service worker keeps its build markers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VERSION } from '../../src/version.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('version, manifest, icons, 404 and service worker are ready to ship', () => {
  assert.equal(VERSION, JSON.parse(read('package.json')).version);
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.ok(m.name && m.short_name && m.start_url && m.icons.length >= 3);
  for (const i of m.icons) assert.ok(existsSync(new URL(`../../${i.src}`, import.meta.url)), i.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  const nf = read('404.html');
  assert.match(nf, /href="\.\/"/);
  const sw = read('sw.js');
  assert.ok(sw.includes("const BUILD = 'dev';") && sw.includes('const PRECACHE = [];'), 'markers for tools/build-site.mjs');
  const idx = read('index.html');
  for (const k of ['rel="manifest"', 'og:title', 'og:description', 'name="description"']) assert.ok(idx.includes(k), k);
});
