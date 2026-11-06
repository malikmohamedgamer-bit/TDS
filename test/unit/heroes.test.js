// Heroes (data/heroes.json) and the hero skills added with them: slow, keep repairs, war chest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { Match } from '../../src/sim/match.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';

const C = await content();
const mw = buildMapWorld(C.maps.get('riftline'), C.props);
const match = (hero) => new Match({ content: C, mapWorld: mw, difficulty: 'normal', seed: 'hero-test', hero, options: { manualStart: true } });
const resolve = (m, id, x = 0, z = 0) => { m._castAbility(id, x, z); m.time += 5; m._updateAbilities(); };

test('every hero has 3 known abilities and a model; the first hero stays the default (balance bot)', () => {
  const heroes = [...C.heroes.values()];
  assert.ok(heroes.length >= 3);
  assert.equal(heroes[0].id, 'commander_vale');
  for (const h of heroes) {
    assert.equal(h.abilities.length, 3, h.id);
    for (const a of h.abilities) assert.ok(C.abilities.has(a), `${h.id}: unknown ability ${a}`);
  }
  assert.equal(match(undefined).hero.def.id, 'commander_vale');
  assert.deepEqual(match('warmaster_ryn').abilities.map((a) => a.id), ['artillery_barrage', 'field_repairs', 'war_chest']);
});

test('Field Repairs heals the keep (capped), War Chest adds cash, Gravity Well slows enemies in its area', () => {
  const m = match('warmaster_ryn');
  m.baseHp = m.baseMax - 30;
  resolve(m, 'field_repairs');
  assert.equal(m.baseHp, m.baseMax - 10);
  resolve(m, 'field_repairs');
  assert.equal(m.baseHp, m.baseMax, 'never above the maximum');
  const cash = m.cash;
  resolve(m, 'war_chest');
  assert.equal(m.cash, cash + 120);

  const s = match('archmage_seren');
  const p = s.paths[0].pointAt(30, {});
  s.spawnEnemy('husk', { d: 30 });
  const e = s.enemies[0];
  resolve(s, 'gravity_well', p.x, p.z);
  assert.ok(e.slow >= 0.5 && e.slowUntil > s.time, `slow ${e.slow}`);
});

test('automatic Field Repairs waits until the keep has lost at least the repair amount', () => {
  const m = match('warmaster_ryn');
  const def = C.abilities.get('field_repairs');
  assert.equal(m._bestAbilitySpot(def), null);
  m.baseHp = m.baseMax - 25;
  assert.ok(m._bestAbilitySpot(def));
});
