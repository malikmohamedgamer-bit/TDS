// Map generator (src/core/mapGen.js) and the generated maps in data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { content } from '../helpers.js';
import { generateMap, generateRoads, validateRoads, FRAME, TEMPLATE_ROADS } from '../../src/core/mapGen.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { soakMap } from '../../src/core/soak.js';
import { Rng } from '../../src/core/rng.js';

const C = await content();
const themes = JSON.parse(readFileSync('tools/map-themes.json', 'utf8')).themes;
const theme = (id) => ({ id, ...themes[id] });

test('mapGen: same seed gives the same map and waves; another seed gives another map', () => {
  const opts = { id: 'x', name: 'X', seed: 'det-1', template: 'fork', theme: theme('frost'), unlockLevel: 5, baseWaves: C.waves.get('frostmere_campaign'), enemies: C.enemies };
  const a = generateMap(opts);
  const b = generateMap(opts);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(generateMap({ ...opts, seed: 'det-2' }).map.paths), JSON.stringify(a.map.paths));
});

test('mapGen: every template makes valid road networks over many seeds (frame, spacing, keep)', () => {
  for (const template of ['serpentine', 'fork', 'trident', 'diamond', 'crossover']) {
    let ok = 0;
    for (let s = 0; s < 40; s++) {
      const rng = new Rng(`roads-${template}-${s}`);
      const { paths, zKeep, crossings } = generateRoads(rng, template);
      assert.equal(paths.length, TEMPLATE_ROADS[template]);
      if (!validateRoads(paths, zKeep, { crossings: crossings || 0 }).length) ok++;
    }
    // the generator re-rolls invalid layouts; most first rolls must already be valid
    assert.ok(ok >= 20, `${template}: only ${ok}/40 first rolls valid`);
  }
});

test('validateRoads catches overlapping roads, diagonal segments and roads that miss the keep', () => {
  const good = [{ id: 'a', points: [[FRAME.xIn, 0], [FRAME.xEnd, 0]] }];
  assert.deepEqual(validateRoads(good, 0), []);
  const close = [...good, { id: 'b', points: [[FRAME.xIn, 6], [0, 6], [0, 20], [FRAME.xEnd, 20]] }];
  assert.ok(validateRoads(close, 0).some((p) => /apart/.test(p)));
  assert.ok(validateRoads([{ id: 'd', points: [[FRAME.xIn, 0], [0, 10], [FRAME.xEnd, 0]] }], 0).some((p) => /diagonal/.test(p)));
  assert.ok(validateRoads(good, 5).some((p) => /keep/.test(p)));
});

test('generated maps in data/: valid roads, music key, unlock level in range, waves on existing roads', () => {
  const gen = [...C.maps.values()].filter((m) => m.generated);
  assert.ok(gen.length >= 15, `only ${gen.length} generated maps`);
  const maxLevel = C.meta.player.maxLevel;
  const music = JSON.parse(readFileSync('data/music.json', 'utf8'));
  for (const m of gen) {
    assert.deepEqual(validateRoads(m.paths, m.base.z, { crossings: m.generated?.crossings || 0 }), [], m.id);
    assert.ok(m.unlockLevel >= 1 && m.unlockLevel <= maxLevel, `${m.id} unlock ${m.unlockLevel}`);
    assert.ok(music.keys[m.id], `${m.id}: no music key`);
    assert.equal(m.scatterGap, 1.3);
    const w = C.waves.get(m.waves);
    for (const wave of w.waves) for (const g of wave.groups) assert.ok(g.path >= 0 && g.path < m.paths.length, `${m.id}: group on road ${g.path}`);
  }
});

test('a generated map: the hero walks it for 2 simulated minutes without rescues or failures', () => {
  const m = C.maps.get('gen_starfall_1');
  const r = soakMap(buildMapWorld(m, C.props), { seconds: 120, seed: 'unit' });
  assert.equal(r.rescues, 0);
  assert.deepEqual(r.failures, []);
  assert.ok(r.distance > 100);
});

test('new templates: a diamond splits from one portal and rejoins; a crossover crosses itself exactly once', () => {
  const C2 = generateRoads(new Rng('cross-1'), 'crossover');
  assert.equal(C2.crossings, 1);
  assert.ok(validateRoads(C2.paths, C2.zKeep).some((p) => /apart/.test(p)), 'without the allowance the crossing is an error');
  const D = generateRoads(new Rng('dia-1'), 'diamond');
  assert.deepEqual(D.starts.length, 1, 'one portal');
  const [n, so] = D.paths.map((p) => p.points);
  assert.deepEqual(n[0], so[0], 'same start');
  assert.deepEqual(n.at(-1), so.at(-1), 'same end');
  assert.ok(n.some(([, z]) => z >= 13) && so.some(([, z]) => z <= -13), 'lanes go north and south');
  // a full map builds, has one portal per distinct start, and a hero soak finds no stuck spots
  for (const template of ['diamond', 'crossover']) {
    const m = generateMap({ id: `t_${template}`, name: 'T', seed: `${template}-full`, template, theme: theme('verdant'), unlockLevel: 1 });
    assert.equal(m.map.paths.length, TEMPLATE_ROADS[template]);
    assert.equal(m.map.props.filter((p) => p.kind === 'enemy_portal').length, 1);
    const r = soakMap(buildMapWorld(m.map, C.props), { seconds: 60, seed: template });
    assert.deepEqual([r.rescues, r.failures], [0, []], `${template}: soak`);
  }
});
