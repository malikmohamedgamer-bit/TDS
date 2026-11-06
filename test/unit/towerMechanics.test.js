// New tower mechanics (ROADMAP Chunk 2): execute, shred, pushback, crit, ramp, multishot, bounty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { resolveDamage } from '../../src/sim/combat.js';

const C = await content();
const world = buildMapWorld(C.maps.get('riftline'), C.props);

function arena(stats) {
  const m = new Match({ content: C, mapWorld: world, seed: 'tm' });
  m.cash = 99999;
  let t = null;
  for (let x = -30; x <= 30 && !t; x += 2) for (let z = -20; z <= 20 && !t; z += 2) if (m.command({ type: 'place', tower: 'rifleman', x, z }).ok) { m.step(); t = m.towers[0]; }
  t.base = { ...t.base, ...stats };
  t.stunUntil = 0;
  return { m, t };
}
const enemyNear = (m, t, hp = 100000) => {
  const e = m.spawnEnemy('husk', { d: 5 });
  e.x = t.x + 2; e.z = t.z; e.hp = e.maxHp = hp; e.baseSpeed = 0; e.armor = 0;
  return e;
};

test('execute: wounded enemies take bonus damage, bosses do not', () => {
  const e = { def: { resist: {} }, hp: 20, maxHp: 100, armor: 0, shield: 0, boss: false };
  const dt = C.damageTypes;
  const base = resolveDamage(e, { amount: 10, type: 'physical' }, dt).toHp;
  const ex = resolveDamage(e, { amount: 10, type: 'physical', execute: { below: 0.3, mul: 3 } }, dt).toHp;
  assert.equal(ex, base * 3);
  e.hp = 90;
  assert.equal(resolveDamage(e, { amount: 10, type: 'physical', execute: { below: 0.3, mul: 3 } }, dt).toHp, base);
  e.hp = 20; e.boss = true;
  assert.equal(resolveDamage(e, { amount: 10, type: 'physical', execute: { below: 0.3, mul: 3 } }, dt).toHp, base);
});

test('shred strips armour for its duration only', () => {
  const dt = C.damageTypes;
  const e = { def: { resist: {} }, hp: 100, maxHp: 100, armor: 0.5, shield: 0, shred: 0.6, shredUntil: 5 };
  const armored = resolveDamage({ ...e, shredUntil: 0 }, { amount: 100, type: 'physical' }, dt, 1).toHp;
  const shredded = resolveDamage(e, { amount: 100, type: 'physical' }, dt, 1).toHp;
  assert.ok(shredded > armored);
  assert.equal(resolveDamage(e, { amount: 100, type: 'physical' }, dt, 6).toHp, armored, 'expired');
});

test('pushback moves a normal enemy back along the road, a boss a quarter as far', () => {
  const { m } = arena({});
  const e = m.spawnEnemy('husk', { d: 20 });
  const b = m.spawnEnemy('gravemaw', { d: 20 });
  m._damage(e, { amount: 1, type: 'holy', pushback: 4 }, null);
  m._damage(b, { amount: 1, type: 'holy', pushback: 4 }, null);
  assert.ok(Math.abs(e.d - 16) < 1e-9);
  assert.ok(Math.abs(b.d - 19) < 1e-9);
  m._damage(e, { amount: 1, type: 'holy', pushback: 400 }, null);
  assert.equal(e.d, 0, 'never before the portal');
});

test('crit: every Nth shot multiplies damage; ramp builds on one target and resets on a new one', () => {
  const { m, t } = arena({ damage: 10, rate: 10, range: 40, crit: { every: 3, mul: 4 } });
  const e = enemyNear(m, t);
  const taken = [];
  let last = e.hp;
  for (let i = 0; i < 600 && taken.length < 6; i++) { m.step(); if (e.hp < last) { taken.push(last - e.hp); last = e.hp; } }
  assert.ok(taken.length >= 6);
  const crits = taken.filter((d) => d > 20).length;
  assert.ok(crits >= 1 && crits <= 3, `crits ${crits} of ${taken.length}`);

  const r = arena({ damage: 10, rate: 10, range: 40, ramp: { perHit: 0.5, max: 2 } });
  const e2 = enemyNear(r.m, r.t);
  const hits = [];
  let l2 = e2.hp;
  for (let i = 0; i < 600 && hits.length < 6; i++) { r.m.step(); if (e2.hp < l2) { hits.push(l2 - e2.hp); l2 = e2.hp; } }
  assert.ok(hits[3] >= hits[0] * 2.4 && hits[5] <= hits[0] * 3.01, `ramp ${hits.map((h) => h.toFixed(0))}`);
});

test('multishot hits the nearest other enemies too; bounty pays extra cash on kills', () => {
  const { m, t } = arena({ damage: 10, rate: 10, range: 40, multishot: { count: 2, falloff: 0.5 } });
  const a = enemyNear(m, t); const b = enemyNear(m, t); const c = enemyNear(m, t); const d = enemyNear(m, t);
  b.z += 1; c.z += 2; d.z += 9;
  for (let i = 0; i < 70; i++) m.step();
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp && c.hp < c.maxHp, 'main + 2 extra');
  assert.equal(d.hp, d.maxHp, 'the far one is spared');

  const x = arena({ damage: 1000, rate: 5, range: 40, bounty: 1 });
  const y = arena({ damage: 1000, rate: 5, range: 40 });
  for (const q of [x, y]) { const e = enemyNear(q.m, q.t, 10); q.cash0 = q.m.cash; for (let i = 0; i < 90; i++) q.m.step(); assert.ok(!e.alive); }
  const gx = x.m.cash - x.cash0; const gy = y.m.cash - y.cash0;
  assert.ok(gx > gy * 1.5, `bounty ${gx} vs ${gy}`);
});
