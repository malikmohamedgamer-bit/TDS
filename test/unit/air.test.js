// Air routes (map.airPaths): fliers take them, walkers keep the roads, children of a flier start at
// the same share of their own route, snapshots keep enemies on the right route, and maps without air
// routes behave exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { Rng } from '../../src/core/rng.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { airRoutesFor } from '../../src/core/mapGen.js';
import { Match } from '../../src/sim/match.js';
import { snapshotMatch } from '../../src/sim/snapshot.js';

const C = await content();
const airMaps = [...C.maps.values()].filter((m) => m.airPaths?.length);
const newMatch = (map, seed = 'air') => new Match({ content: C, mapWorld: buildMapWorld(map, C.props), seed, difficulty: 'normal' });
const flier = [...C.enemies.values()].find((e) => e.flying && !e.boss && !e.summonOnly && !e.split);
const walker = [...C.enemies.values()].find((e) => !e.flying && !e.boss && !e.summonOnly);

test('air maps: every air route runs from a portal to the keep', () => {
  assert.ok(airMaps.length >= 4, `air maps: ${airMaps.map((m) => m.id)}`);
  for (const m of airMaps) {
    const starts = new Set(m.paths.map((p) => `${p.points[0]}`));
    assert.equal(m.airPaths.length, starts.size, `${m.id}: one air route per portal`);
    for (const a of m.airPaths) {
      const end = a.points.at(-1);
      assert.ok(m.paths.some((p) => Math.hypot(p.points.at(-1)[0] - end[0], p.points.at(-1)[1] - end[1]) < 6), `${m.id} ${a.id} ends at the keep`);
    }
  }
});

test('air routes: fliers fly them, walkers walk the roads, and the shortcut is shorter', () => {
  const m = newMatch(airMaps[0]);
  const f = m.spawnEnemy(flier.id);
  const w = m.spawnEnemy(walker.id);
  assert.ok(m.airPaths.includes(f.path) && !m.paths.includes(f.path));
  assert.ok(m.paths.includes(w.path));
  assert.ok(f.path.length < w.path.length, `air ${f.path.length} < road ${w.path.length}`);
  for (let i = 0; i < 600; i++) m.step();
  assert.ok(!f.alive || f.d > w.d, 'the flier is further along (or already arrived)');
});

test('air routes: a walker spawned from a flier starts at the same share of a road', () => {
  const m = newMatch(airMaps[0]);
  const f = m.spawnEnemy(flier.id);
  f.d = f.path.length * 0.5;
  const child = m.spawnEnemy(walker.id, { ...m._childRoute(f), d: f.d });
  assert.ok(m.paths.includes(child.path));
  assert.ok(Math.abs(child.d / child.path.length - 0.5) < 1e-9, `share ${child.d / child.path.length}`);
  // same kind of route: the distance is kept as it was
  const f2 = m.spawnEnemy(flier.id, { ...m._childRoute(f), d: f.d });
  assert.equal(f2.path, f.path);
  assert.equal(f2.d, f.d);
});

test('air routes: snapshot and restore keep enemies on their route', () => {
  const m = newMatch(airMaps[0], 'air-snap');
  m.spawnEnemy(flier.id);
  m.spawnEnemy(walker.id);
  for (let i = 0; i < 200; i++) m.step();
  const snap = snapshotMatch(m);
  const r = Match.restore(snap, { content: C, mapWorld: buildMapWorld(airMaps[0], C.props) });
  assert.equal(r.hash(), m.hash());
  for (let i = 0; i < 300; i++) { m.step(); r.step(); }
  assert.equal(r.hash(), m.hash(), 'restored match stays identical');
  assert.ok(r.enemies.some((e) => r.airPaths.includes(e.path)) || !m.enemies.some((e) => m.airPaths.includes(e.path)));
});

test('air routes: generation is deterministic and stays inside the map', () => {
  const roads = [{ points: [[-57, -20], [0, 25], [45, 2]] }, { points: [[-57, -20], [10, -25], [45, 2]] }, { points: [[-57, 15], [45, 2]] }];
  const a = airRoutesFor(roads, new Rng('x'));
  assert.deepEqual(a, airRoutesFor(roads, new Rng('x')));
  assert.equal(a.length, 2, 'one per distinct start');
  for (const r of a) for (const [, z] of r.points) assert.ok(Math.abs(z) <= 30);
  // a map without air routes has none in the match
  assert.equal(newMatch(C.maps.get('riftline')).airPaths.length, 0);
});
