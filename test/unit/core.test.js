import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../src/core/rng.js';
import { FixedLoop } from '../../src/core/fixedLoop.js';
import { CollisionWorld } from '../../src/core/collision.js';
import { Character } from '../../src/core/character.js';
import { createTerrain } from '../../src/core/terrain.js';

const flatTerrain = { height: () => 0 };
const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

test('rng is deterministic and serialisable', () => {
  const a = new Rng('seed');
  const b = new Rng('seed');
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(seqA, seqB);
  const state = a.getState();
  const x = a.next();
  assert.equal(Rng.fromState(state).next(), x);
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => new Rng('other').next()));
  for (let i = 0; i < 1000; i++) {
    const v = a.int(2, 5);
    assert.ok(v >= 2 && v <= 5 && Number.isInteger(v));
  }
});

test('fixed loop runs whole steps and caps catch-up', () => {
  const loop = new FixedLoop({ step: 0.1, maxSteps: 3 });
  let n = 0;
  loop.advance(0.25, () => n++);
  assert.equal(n, 2);
  n = 0;
  loop.advance(10, () => n++); // clamped to 0.25s, then capped at 3 steps
  assert.equal(n, 3);
  loop.timeScale = 2;
  n = 0;
  loop.acc = 0;
  loop.advance(0.1, () => n++);
  assert.equal(n, 2);
});

test('rotated box collider pushes out along the correct axis', () => {
  const w = new CollisionWorld({ terrain: flatTerrain, bounds });
  // 4 m long (x) by 0.4 m thick (z) wall, rotated 90 degrees -> long along z
  w.add({ shape: 'box', x: 0, z: 0, hw: 2, hd: 0.2, rot: Math.PI / 2, h: 3, y0: -1, top: 3 });
  assert.ok(w.overlapsWall(0, 1.5, 0.3, 0)); // inside the rotated length
  assert.ok(!w.overlapsWall(1.0, 0, 0.3, 0)); // beside the thin side
  const r = w.resolve(0.1, 1.5, 0.3, 0);
  assert.ok(Math.abs(r.x) >= 0.5 - 1e-3, `pushed out in x, got ${r.x}`);
});

test('character cannot walk through a wall and stays in bounds', () => {
  const w = new CollisionWorld({ terrain: flatTerrain, bounds });
  w.add({ shape: 'box', x: 5, z: 0, hw: 0.5, hd: 10, h: 4, y0: -1, top: 4 });
  const c = new Character(w, { x: 0, z: 0 });
  for (let i = 0; i < 300; i++) c.step(1 / 60, { mx: 1, mz: 0, sprint: true });
  assert.ok(c.x < 5 - 0.5 - c.p.radius + 0.01, `blocked by wall, x=${c.x}`);
  for (let i = 0; i < 600; i++) c.step(1 / 60, { mx: 0, mz: -1, sprint: true });
  assert.ok(c.z >= bounds.minZ + c.p.radius - 1e-6, `inside bounds, z=${c.z}`);
});

test('character jumps, lands, and can step onto a low crate but not a tall wall', () => {
  const w = new CollisionWorld({ terrain: flatTerrain, bounds });
  w.add({ shape: 'box', x: 3, z: 0, hw: 0.6, hd: 0.6, y0: -1, top: 0.4 }); // low step
  const c = new Character(w, { x: 0, z: 0 });
  c.step(1 / 60, { jump: true });
  assert.ok(c.vy > 0);
  let maxY = 0;
  for (let i = 0; i < 120; i++) { c.step(1 / 60, {}); maxY = Math.max(maxY, c.y); }
  assert.ok(maxY > 1.2, `jump height ${maxY}`);
  assert.ok(c.grounded && Math.abs(c.y) < 1e-6);
  for (let i = 0; i < 40; i++) c.step(1 / 60, { mx: 1 });
  // walked over/onto the step
  assert.ok(c.x > 2.4, `stepped on crate, x=${c.x}`);
});

test('character on a crate higher than step height can be reached by jumping', () => {
  const w = new CollisionWorld({ terrain: flatTerrain, bounds });
  w.add({ shape: 'box', x: 2, z: 0, hw: 0.8, hd: 0.8, y0: -1, top: 1.2 });
  const c = new Character(w, { x: 0, z: 0 });
  for (let i = 0; i < 30; i++) c.step(1 / 60, { mx: 1 });
  assert.ok(c.x < 2 - 0.8, 'blocked without jumping');
  c.step(1 / 60, { mx: 1, jump: true });
  for (let i = 0; i < 60; i++) c.step(1 / 60, { mx: 1 });
  for (let i = 0; i < 4; i++) c.step(1 / 60, {});
  // either on top of the crate or past it, never inside
  assert.ok(!w.overlapsWall(c.x, c.z, c.p.radius * 0.9, c.y), 'not inside crate');
});

test('character pushed out when a collider appears on top of it', () => {
  const w = new CollisionWorld({ terrain: flatTerrain, bounds });
  const c = new Character(w, { x: 0, z: 0 });
  w.add({ shape: 'circle', x: 0.2, z: 0, r: 1.2, y0: -1, top: 3 });
  c.step(1 / 60, {});
  assert.ok(!w.overlapsWall(c.x, c.z, c.p.radius * 0.9, c.y), `free after rescue (${c.x},${c.z})`);
});

test('terrain flattens the path to its height and the rim rises at edges', () => {
  const t = createTerrain({
    size: { w: 60, d: 40 },
    terrain: { rim: { height: 5, width: 6 }, hills: [{ x: 0, z: 0, r: 6, h: 4 }] },
    paths: [{ id: 'p', width: 4, points: [[-30, 0], [30, 0]] }],
  });
  assert.ok(Math.abs(t.height(0, 0)) < 1e-9, 'path centre at path height');
  assert.ok(t.height(0, 6) > 1, 'hill off the path');
  assert.ok(t.height(0, 19.9) > 4, 'rim near edge');
  assert.ok(t.pathMask(0, 0) < 0.01 && t.pathMask(0, 10) > 0.99);
});

test('velocity drops to zero when pushing straight into a wall', () => {
  const w = new CollisionWorld({ terrain: flatTerrain, bounds });
  w.add({ shape: 'box', x: 2, z: 0, hw: 0.5, hd: 5, y0: -1, top: 4 });
  const c = new Character(w, { x: 0, z: 0 });
  for (let i = 0; i < 120; i++) c.step(1 / 60, { mx: 1, mz: 0 });
  assert.ok(Math.hypot(c.vx, c.vz) < 0.2, `speed ${Math.hypot(c.vx, c.vz)}`);
  // diagonal into the wall slides along it
  for (let i = 0; i < 60; i++) c.step(1 / 60, { mx: 0.7, mz: 0.7 });
  assert.ok(c.z > 1, `slid along wall, z=${c.z}`);
});

test('map props: every solid collider reaches below the terrain under its whole footprint', async () => {
  const { content } = await import('../helpers.js');
  const { buildMapWorld } = await import('../../src/core/mapLayout.js');
  const c = await content();
  for (const map of c.maps.values()) {
    const mw = buildMapWorld(map, c.props);
    for (const col of mw.world.colliders.values()) {
      const ext = col.shape === 'circle' ? col.r : Math.hypot(col.hw, col.hd);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const g = mw.terrain.height(col.x + Math.cos(a) * ext * 0.99, col.z + Math.sin(a) * ext * 0.99);
        assert.ok(col.y0 < g, `${map.id}: ${col.ref?.kind} at (${col.x.toFixed(1)},${col.z.toFixed(1)}) floats`);
      }
    }
  }
});

test('soak: 3 simulated minutes of random walking per map, no failures or rescues', async () => {
  const { content } = await import('../helpers.js');
  const { buildMapWorld } = await import('../../src/core/mapLayout.js');
  const { soakMap } = await import('../../src/core/soak.js');
  const c = await content();
  for (const map of c.maps.values()) {
    const r = soakMap(buildMapWorld(map, c.props), { seconds: 180, seed: 'unit' });
    assert.deepEqual(r.failures, [], `${map.id} failures`);
    assert.equal(r.rescues, 0, `${map.id} rescues ${JSON.stringify(r.rescueLog)}`);
    assert.ok(r.distance > 500, `${map.id} walked ${r.distance} m`);
  }
});
