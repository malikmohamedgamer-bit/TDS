// Tower kit (src/engine/towerKit.js) and the generated mechanics_b1 tower batch (tools/gen-towers.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { checkTowerKit, KIT_BASES, KIT_HEADS, KIT_ADDONS } from '../../src/engine/towerKit.js';
import { buildTowers } from '../../tools/gen-towers.mjs';

const C = await content();
const batch = [...C.towers.values()].filter((t) => t.generated?.batch === 'mechanics_b1');

test('mechanics_b1: 63 towers, all kits valid and different, every new mechanic used, mechanics sets match the stats', () => {
  assert.equal(batch.length, 63);
  const kits = new Set();
  for (const t of batch) {
    assert.ok(checkTowerKit(t.model.kit), t.id);
    kits.add(JSON.stringify(t.model.kit));
    for (const m of t.generated.mechanics) assert.ok(t.stats[m] !== undefined, `${t.id} has ${m}`);
  }
  assert.equal(kits.size, 63);
  const used = new Set(batch.flatMap((t) => t.generated.mechanics));
  for (const m of ['execute', 'crit', 'ramp', 'shred', 'pushback', 'bounty', 'multishot']) assert.ok(used.has(m), m);
});

test('kit validation rejects unknown pieces', () => {
  assert.throws(() => checkTowerKit({ base: 'nope', head: 'single' }), /base/);
  assert.throws(() => checkTowerKit({ base: 'bunker', head: 'nope' }), /head/);
  assert.throws(() => checkTowerKit({ base: 'bunker', head: 'single', addon: 'nope' }), /add-on/);
  assert.ok(Object.keys(KIT_BASES).length >= 6 && Object.keys(KIT_HEADS).length >= 12 && Object.keys(KIT_ADDONS).length >= 8);
});

test('the generator output matches the data files (regenerate with node tools/gen-towers.mjs)', () => {
  const fresh = buildTowers();
  assert.deepEqual(fresh.map((t) => t.id), batch.map((t) => t.id));
  assert.deepEqual(fresh.map((t) => t.cost), batch.map((t) => t.cost));
});
