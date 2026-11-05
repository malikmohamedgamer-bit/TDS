import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { content } from '../helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = await content();

function glbJson(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('utf8', 0, 4), 'glTF', `${file} is a GLB`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.toString('utf8', 20, 20 + len));
}

test('every model in data/models.json exists, parses, and has its mapped clips', () => {
  assert.ok(C.models.size >= 6);
  for (const [id, m] of C.models) {
    const file = join(root, m.url);
    assert.ok(existsSync(file), `${id}: ${m.url} missing`);
    const j = glbJson(file);
    const clips = new Set((j.animations || []).map((a) => a.name));
    for (const [state, clip] of Object.entries(m.clips || {})) assert.ok(clips.has(clip), `${id}: clip ${clip} for ${state} missing`);
    // no zero-scale nodes (regression: parts built while hidden in Blender)
    for (const n of j.nodes) if (n.scale) assert.ok(n.scale.every((s) => Math.abs(s) > 1e-4), `${id}: node ${n.name} has zero scale`);
    let tris = 0;
    for (const mesh of j.meshes || []) for (const p of mesh.primitives) tris += j.accessors[p.indices].count / 3;
    const budget = m.kind === 'tower' ? 3000 : m.kind === 'boss' ? 8000 : 1500;
    assert.ok(tris > 50 && tris <= budget, `${id}: ${tris} triangles outside the style-guide budget`);
  }
});

test('towers and enemies that reference a GLB point at a known model', () => {
  for (const x of [...C.towers.values(), ...C.enemies.values()]) {
    if (x.model?.glb) assert.ok(C.models.has(x.model.glb), `${x.id} -> ${x.model.glb}`);
  }
});
