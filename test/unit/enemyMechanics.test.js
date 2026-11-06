// Enemy mechanics blink and burst, and the generated mechanics_b1 enemy batch (tools/gen-enemies.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { validateContent } from '../../src/core/content.js';
import { checkKit } from './helpers/kit.js';

const C = await content();
const world = buildMapWorld(C.maps.get('riftline'), C.props);
const batch = [...C.enemies.values()].filter((e) => e.generated?.batch === 'mechanics_e1');

function run(def, seconds) {
  C.enemies.set('t_enemy', { ...C.enemies.get('husk'), id: 't_enemy', ...def });
  const m = new Match({ content: C, mapWorld: world, seed: 'em' });
  const e = m.spawnEnemy('t_enemy', { d: 2 });
  const ds = [];
  for (let i = 0; i < seconds * 60; i++) { m.step(); ds.push(e.d); }
  C.enemies.delete('t_enemy');
  return { e, ds, m };
}

test('blink: the enemy jumps forward along the road on its timer', () => {
  const still = run({}, 7).e.d;
  const { e } = run({ blink: { every: 3, distance: 9 } }, 7);
  assert.ok(e.d - still > 15, `blinked ${e.d - still}`);
});

test('burst: speed surges for its duration, so the enemy ends up further than a steady one', () => {
  const steady = run({}, 10).e.d;
  const { e, ds } = run({ burst: { every: 3, mul: 3, duration: 1 } }, 10);
  assert.ok(e.d > steady + 5);
  const step = ds.map((d, i) => (i ? d - ds[i - 1] : 0));
  assert.ok(Math.max(...step) > Math.min(...step.filter((x) => x > 0)) * 2.5, 'visible surge');
});

test('mechanics_b1 enemies: 158, all trait sets different, all models different, every trait used, content validates', () => {
  assert.equal(batch.length, 158);
  assert.equal(new Set(batch.map((e) => e.generated.traits.join('+'))).size, 158);
  assert.equal(new Set(batch.map((e) => `${e.model.kit.body}|${[...e.model.kit.parts].sort()}`)).size, 158);
  const used = new Set(batch.flatMap((e) => e.generated.traits));
  for (const t of ['heal', 'shield', 'stealth', 'split', 'summon', 'armor', 'regen', 'flying', 'blink', 'burst', 'stun', 'immune']) assert.ok(used.has(t), t);
  for (const e of batch) { assert.ok(e.hp >= 8 && e.speed > 0, e.id); checkKit(e.model.kit); }
  assert.deepEqual(validateContent(C), []);
});
