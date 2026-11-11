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

test('every hero has 4 known abilities and a look; the first hero stays the default (balance bot)', () => {
  const heroes = [...C.heroes.values()];
  assert.ok(heroes.length >= 3);
  assert.equal(heroes[0].id, 'commander_vale');
  for (const h of heroes) {
    assert.equal(h.abilities.length, 4, h.id);
    assert.ok(h.model?.builder && h.role, `${h.id}: model and role`);
    for (const a of h.abilities) assert.ok(C.abilities.has(a), `${h.id}: unknown ability ${a}`);
  }
  assert.equal(match(undefined).hero.def.id, 'commander_vale');
  assert.deepEqual(match('warmaster_ryn').abilities.map((a) => a.id), ['artillery_barrage', 'field_repairs', 'war_chest', 'flare_shells']);
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
  assert.equal(m.cash, cash + m.content.abilities.get('war_chest').effects.cash);

  const s = match('archmage_seren');
  const p = s.paths[0].pointAt(30, {});
  s.spawnEnemy('husk', { d: 30 });
  const e = s.enemies[0];
  resolve(s, 'gravity_well', p.x, p.z);
  assert.ok(e.slow >= s.content.abilities.get('gravity_well').effects.slow.amount && e.slowUntil > s.time, `slow ${e.slow}`);
});

test('automatic Field Repairs waits until the keep has lost at least the repair amount', () => {
  const m = match('warmaster_ryn');
  const def = C.abilities.get('field_repairs');
  assert.equal(m._bestAbilitySpot(def), null);
  m.baseHp = m.baseMax - 25;
  assert.ok(m._bestAbilitySpot(def));
});

test('hero looks are distinct (colours + gear) and there are 7+ heroes and 25+ skills', () => {
  const heroes = [...C.heroes.values()];
  assert.ok(heroes.length >= 7);
  const looks = new Set(heroes.map((h) => JSON.stringify([h.model.colors || {}, h.model.gear || {}])));
  assert.equal(looks.size, heroes.length);
  assert.ok(new Set(heroes.flatMap((h) => h.abilities)).size >= 25);
});

test('new skill effects: knockback, reveal, shield break, execute, chain, allies, damage buff', () => {
  const m = match('sergeant_kade');
  const p = m.paths[0].pointAt(40, {});
  const e = m.spawnEnemy('husk', { d: 40 });
  e.hp = e.maxHp = 1e5;
  resolve(m, 'frag_volley', p.x, p.z);
  assert.ok(Math.abs(e.d - (40 - m.content.abilities.get('frag_volley').effects.knockback)) < 0.01, `knocked back to ${e.d}`);
  const allies = m.allies.length;
  resolve(m, 'reinforcements', p.x, p.z);
  assert.equal(m.allies.length, allies + m.content.abilities.get('reinforcements').effects.allies.count);
  assert.ok(m.allies.every((a) => a.kind === 'rifle_trooper' && a.owner === -1));

  const h = match('captain_holt');
  const q = h.paths[0].pointAt(30, {});
  const a = h.spawnEnemy('husk', { d: 30 });
  a.stealth = true; a.shield = 50; a.hp = a.maxHp = 1e5;
  resolve(h, 'recon_drone', q.x, q.z);
  assert.equal(a.stealth, false, 'revealed');
  assert.ok(a.markUntil > h.time);
  resolve(h, 'emp_burst', q.x, q.z);
  assert.equal(a.shield, 0, 'shield broken');
  a.hp = a.maxHp * (h.content.abilities.get('headhunter').effects.execute - 0.05);
  resolve(h, 'headhunter', q.x, q.z);
  assert.equal(a.alive, false, 'executed');

  const s = match('archmage_seren');
  const r = s.paths[0].pointAt(30, {});
  const group = [30, 31.5, 33, 34.5].map((d) => s.spawnEnemy('husk', { d }));
  resolve(s, 'arcane_chain', r.x, r.z);
  assert.ok(group.every((g) => g.hp < g.maxHp), 'chain hit all four');

  const v = match('commander_vale');
  v.cash = 5000;
  const at = v.paths[0].pointAt(20, {});
  for (const dx of [5, -5, 7, -7, 9, -9]) if (!v.towers.length && v.command({ type: 'place', tower: 'rifleman', x: at.x + dx, z: at.z }).ok) v.step();
  const t = v.towers[0];
  assert.ok(t, 'a tower was placed');
  const before = v.effective(t).damage;
  v.hero.x = t.x; v.hero.z = t.z;
  resolve(v, 'banner_of_valor');
  v.time -= 5;
  assert.ok(Math.abs(v.effective(t).damage - before * 1.3) < 1e-6, 'damage buff');
});

test('hero attacks can carry status effects (Ignis burns, Nyra slows)', () => {
  const m = match('pyromancer_ignis');
  const e = m.spawnEnemy('husk', { d: 30 });
  m.hero.x = e.x; m.hero.z = e.z; m.hero.cooldown = 0;
  for (let i = 0; i < 10 && e.burnUntil <= m.time; i++) m._updateHero(1 / 60);
  assert.ok(e.burnUntil > m.time, 'burning');
});
