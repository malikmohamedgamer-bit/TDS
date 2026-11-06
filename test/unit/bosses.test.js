// Boss phase mechanics (src/sim/match.js _bossAction / _bossTimers) and the generated mechanics_b1 batch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { BOSS_ACTIONS, validateContent } from '../../src/core/content.js';

const C = await content();
const world = (id) => buildMapWorld(C.maps.get(id), C.props);

/** A test boss with one phase at 90% health running the given actions. */
function bossWith(actions, { map = 'riftline', cash = 1000, extra = {} } = {}) {
  const def = { ...C.enemies.get('gravemaw'), id: 'test_boss', ...extra, phases: [{ at: 0.9, name: 'Test', actions }] };
  C.enemies.set('test_boss', def);
  const m = new Match({ content: C, mapWorld: world(map), seed: 'boss-test' });
  m.cash = cash;
  const b = m.spawnEnemy('test_boss', { d: 20 });
  b.baseSpeed = 0;
  m.drainEvents();
  const trigger = () => { m._damage(b, { amount: b.maxHp * 0.12, type: 'holy' }, null); return m.drainEvents(); };
  return { m, b, trigger };
}
const step = (m, s) => { for (let i = 0; i < s * 60; i++) m.step(); };

test('every boss action type in data is known, and content validation rejects unknown ones', () => {
  for (const e of C.enemies.values()) for (const ph of e.phases || []) for (const a of ph.actions) assert.ok(BOSS_ACTIONS.includes(a.type), `${e.id} ${a.type}`);
  C.enemies.set('bad_boss', { ...C.enemies.get('gravemaw'), id: 'bad_boss', phases: [{ at: 0.5, name: 'x', actions: [{ type: 'explode' }] }] });
  assert.ok(validateContent(C).some((x) => x.includes('unknown phase action "explode"')));
  C.enemies.delete('bad_boss');
});

test('teleport blinks the boss forward along its road', () => {
  const { b, trigger } = bossWith([{ type: 'teleport', distance: 14 }]);
  const d0 = b.d;
  const ev = trigger();
  assert.ok(Math.abs(b.d - (d0 + 14)) < 1e-6);
  assert.ok(ev.some((e) => e.type === 'bossBlink'));
});

test('regen heals over time, burning stops it', () => {
  const { m, b, trigger } = bossWith([{ type: 'regen', amount: 0.2, duration: 5 }]);
  trigger();
  const hp0 = b.hp;
  step(m, 2);
  assert.ok(b.hp > hp0 + b.maxHp * 0.05, 'regenerates');
  b.burnUntil = m.time + 10; b.burnDps = 0;
  const hp1 = b.hp;
  step(m, 1);
  assert.ok(b.hp <= hp1, 'no regen while burning');
});

test('cloak makes the boss stealthy for its duration, then it is visible again', () => {
  const { m, b, trigger } = bossWith([{ type: 'cloak', duration: 3 }]);
  assert.equal(b.stealth, false);
  trigger();
  assert.equal(b.stealth, true);
  step(m, 3.2);
  assert.equal(b.stealth, false);
});

test('immune blocks the listed damage types only, and only for its duration', () => {
  const { m, b, trigger } = bossWith([{ type: 'immune', types: ['physical'], duration: 4 }]);
  const ev = trigger();
  assert.ok(ev.some((e) => e.type === 'bossImmune'));
  const hp = b.hp;
  m._damage(b, { amount: 500, type: 'physical' }, null);
  assert.equal(b.hp, hp, 'physical ignored');
  assert.ok(m.drainEvents().some((e) => e.type === 'immune'));
  m._damage(b, { amount: 500, type: 'fire' }, null);
  assert.ok(b.hp < hp, 'fire still hurts');
  step(m, 4.1);
  const hp2 = b.hp;
  m._damage(b, { amount: 500, type: 'physical' }, null);
  assert.ok(b.hp < hp2, 'immunity ended');
});

test('armor and dash are temporary and restore the exact base values', () => {
  const { m, b, trigger } = bossWith([{ type: 'armor', add: 0.3, duration: 2 }, { type: 'dash', mul: 2, duration: 2 }]);
  const a0 = b.armor;
  const s0 = b.speedMul;
  trigger();
  assert.ok(Math.abs(b.armor - (a0 + 0.3)) < 1e-9);
  assert.ok(b.speedMul > s0 * 1.5);
  step(m, 2.2);
  assert.ok(Math.abs(b.armor - a0) < 1e-9);
  assert.ok(Math.abs(b.speedMul - s0) < 1e-9);
});

test('drainCash steals a share of cash, never with infinite cash', () => {
  const { m, trigger } = bossWith([{ type: 'drainCash', pct: 0.2 }], { cash: 1000 });
  const ev = trigger();
  assert.equal(m.cash, 800);
  assert.equal(ev.find((e) => e.type === 'cashDrain').amount, 200);
});

test('portal summons minions at the start of the other roads (own road on one-road maps)', () => {
  const two = bossWith([{ type: 'portal', into: 'mite', count: 3 }], { map: 'frostmere' });
  two.trigger();
  const minions = two.m.enemies.filter((e) => e.defId === 'mite');
  assert.equal(minions.length, 3);
  assert.ok(minions.every((e) => e.path !== two.b.path && e.d < 3));
  const one = bossWith([{ type: 'portal', into: 'mite', count: 2 }]);
  one.trigger();
  assert.equal(one.m.enemies.filter((e) => e.defId === 'mite' && e.path === one.b.path).length, 2);
});

test('healPulse heals nearby Blight, not the boss itself', () => {
  const { m, b, trigger } = bossWith([{ type: 'healPulse', radius: 9, amount: 0.5 }]);
  const near = m.spawnEnemy('husk', { d: 21 });
  near.hp = near.maxHp * 0.2;
  near.baseSpeed = 0;
  trigger();
  assert.ok(near.hp > near.maxHp * 0.6);
  assert.ok(b.hp < b.maxHp);
});

test('snipe telegraphs a strike on the tower that dealt the most damage and stuns it', () => {
  const { m, trigger } = bossWith([{ type: 'snipe', radius: 3, duration: 4, delay: 1 }]);
  m.options.infiniteCash = true;
  const spots = [];
  for (let x = -30; x <= 30 && spots.length < 2; x += 2) for (let z = -20; z <= 20 && spots.length < 2; z += 2) if (m.canPlace('rifleman', x, z).ok && !spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 12)) { m.command({ type: 'place', tower: 'rifleman', x, z }); spots.push([x, z]); }
  m.step(); // commands apply on the next tick
  m.drainEvents();
  assert.equal(m.towers.length, 2);
  m.towers[1].damage = 5000;
  const ev = trigger();
  const tg = ev.find((e) => e.type === 'telegraph' && e.snipe);
  assert.ok(tg && tg.x === m.towers[1].x && tg.z === m.towers[1].z, 'aims at the top damage dealer');
  step(m, 1.1);
  assert.ok(m.towers[1].stunUntil > m.time && !(m.towers[0].stunUntil > m.time));
});

test('undying revives the boss once at a share of its health; splitOnDeath spawns minions on the final death', () => {
  const { m, b, trigger } = bossWith([{ type: 'undying', hp: 0.3 }, { type: 'splitOnDeath', into: 'husk', count: 4 }]);
  trigger();
  m._damage(b, { amount: b.maxHp * 2, type: 'holy' }, null);
  assert.ok(b.alive && Math.abs(b.hp - b.maxHp * 0.3) < 1e-6, 'revived');
  assert.ok(m.drainEvents().some((e) => e.type === 'bossRevive'));
  m._damage(b, { amount: b.maxHp * 2, type: 'holy' }, null);
  assert.ok(!b.alive, 'second death is final');
  assert.equal(m.enemies.filter((e) => e.alive && e.defId === 'husk').length, 4);
});

test('mechanics_b1: 40 bosses with 40 different mechanic sets, at least 2 new mechanics each, every new mechanic used', () => {
  const batch = [...C.enemies.values()].filter((e) => e.generated?.batch === 'mechanics_b1');
  assert.equal(batch.length, 40);
  const sig = (e) => [...new Set(e.phases.flatMap((p) => p.actions.map((a) => a.type)))].sort().join('+');
  assert.equal(new Set(batch.map(sig)).size, 40);
  const NEW = BOSS_ACTIONS.slice(4);
  for (const e of batch) assert.ok(sig(e).split('+').filter((t) => NEW.includes(t)).length >= 2, e.id);
  for (const t of NEW) assert.ok(batch.some((e) => sig(e).includes(t)), t);
  for (const e of batch) assert.deepEqual(e.phases.map((p) => p.at), [0.75, 0.5, 0.25]);
});

test('every generated boss can be beaten in a full simulation: phases fire, nothing throws, it dies', () => {
  for (const e of [...C.enemies.values()].filter((x) => x.generated?.batch === 'mechanics_b1')) {
    const m = new Match({ content: C, mapWorld: world('frostmere'), seed: e.id, options: { infiniteCash: true } });
    m.cash = 5000;
    const b = m.spawnEnemy(e.id, { d: 10 });
    let phases = 0;
    for (let i = 0; i < 400 && b.alive; i++) {
      const type = ['holy', 'fire', 'physical'].find((t) => !(b.immune && b.immune.until > m.time && b.immune.types.includes(t)));
      m._damage(b, { amount: b.maxHp * 0.03, type }, null);
      if (b.stealth) b.stealth = false; // a detection tower would see it
      m.step();
      phases += m.drainEvents().filter((x) => x.type === 'bossPhase').length;
    }
    assert.equal(phases, 3, `${e.id} phases`);
    assert.ok(!b.alive, `${e.id} dies`);
  }
});
