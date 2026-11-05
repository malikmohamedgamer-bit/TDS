// Skinned pack models (Quaternius) are drawn instanced as rigid per-bone parts: the split must
// reproduce the skinned positions for whole-bone vertices, merge tiny bones and keep flat colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rigidifySkinned } from '../../src/engine/instancedRig.js';

const SHARED = {
  grain: new THREE.Texture(),
  body: new THREE.MeshStandardMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

/** Two-bone arm: triangles 0-9 on the root bone, 10-19 on the forearm, 20 (one) on a tiny finger bone. */
function arm() {
  const tris = 21;
  const pos = [];
  const idx = [];
  const w = [];
  for (let t = 0; t < tris; t++) {
    const bone = t < 10 ? 0 : t < 20 ? 1 : 2;
    const x = bone === 0 ? 0.2 : bone === 1 ? 1.2 : 1.9;
    pos.push(x, 0, t * 0.01, x + 0.1, 0, t * 0.01, x, 0.1, t * 0.01);
    for (let k = 0; k < 3; k++) { idx.push(bone, 0, 0, 0); w.push(1, 0, 0, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  g.addGroup(0, 60, 0); // triangles 0-19 matte
  g.addGroup(60, 3, 1); // triangle 20 (finger) glows
  const root = new THREE.Bone();
  const fore = new THREE.Bone();
  fore.position.x = 1;
  const finger = new THREE.Bone();
  finger.position.x = 0.8;
  root.add(fore);
  fore.add(finger);
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x336699 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff0000, emissiveIntensity: 1.3 }),
  ];
  const mesh = new THREE.SkinnedMesh(g, mats);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([root, fore, finger]));
  return { mesh, root, fore };
}

test('rigidifySkinned: one part per bone, tiny bones merged into their parent, glow kept apart', () => {
  const { mesh } = arm();
  const parts = rigidifySkinned(mesh, { shared: SHARED, minShare: 0.1 });
  // root (flat), forearm (flat), forearm (glow: the finger triangle merged up, its material glows)
  assert.equal(parts.length, 3);
  const count = (p) => p.geometry.attributes.position.count / 3;
  assert.deepEqual(parts.map(count).sort((a, b) => a - b), [1, 10, 10]);
  assert.equal(parts.filter((p) => p.material === SHARED.glow).length, 1);
  assert.equal(parts.filter((p) => p.material === SHARED.body).length, 2);
  // flat colour baked into vertex colours (linear)
  const c = new THREE.Color(0x336699);
  const col = parts.find((p) => p.material === SHARED.body).geometry.attributes.color;
  assert.ok(Math.abs(col.getX(0) - c.r) < 1e-6 && Math.abs(col.getZ(0) - c.b) < 1e-6);
});

test('rigidifySkinned: parts follow their bone exactly like skinning does', () => {
  const { mesh, fore } = arm();
  const parts = rigidifySkinned(mesh, { shared: SHARED, minShare: 0 });
  fore.rotation.z = Math.PI / 2;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const forePart = parts[1]; // parts follow triangle order: root, forearm, finger
  const v = new THREE.Vector3();
  const skinned = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    v.fromBufferAttribute(forePart.geometry.attributes.position, i).applyMatrix4(forePart.matrix());
    // reference: three's own CPU skinning of the source vertex (triangle 10 = forearm)
    mesh.getVertexPosition(30 + i, skinned).applyMatrix4(mesh.matrixWorld);
    assert.ok(v.distanceTo(skinned) < 1e-5, `vertex ${i}: ${v.toArray()} vs ${skinned.toArray()}`);
  }
});
