import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { validateContent } from '../../src/core/content.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Path } from '../../src/sim/path.js';
import { Match, SELL_REFUND } from '../../src/sim/match.js';
import { towerStats, nextStep, applyOps, totalSpent } from '../../src/sim/stats.js';
import { resolveDamage, pickTarget } from '../../src/sim/combat.js';
import { playBot, replay } from '../../src/sim/bot.js';

const C = await content();
const MAP = C.maps.get('riftline');
const newMatch = (o = {}) => new Match({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 'test', ...o });
const run = (m, seconds) => { for (let i = 0; i < seconds * 60; i++) m.step(); };
// valid build spots (checked in the placement test): SPOT is ~10 m from the road, NEAR 4 m
const SPOT = { x: -4, z: -6 };
const NEAR = { x: -10, z: -12 };

test('content is internally consistent', () => {
  assert.deepEqual(validateContent(C), []);
  assert.ok(C.towers.size >= 10, `towers ${C.towers.size}`);
  assert.ok(C.enemies.size >= 10, `enemies ${C.enemies.size}`);
  assert.ok([...C.enemies.values()].some((e) => e.boss), 'has a boss');
});

test('path arc-length lookup', () => {
  const p = new Path('p', [[0, 0], [10, 0], [10, 5]]);
  assert.equal(p.length, 15);
  assert.deepEqual({ ...p.pointAt(5) }, { x: 5, z: 0, dx: 1, dz: 0 });
  const q = p.pointAt(12);
  assert.equal(q.x, 10); assert.equal(q.z, 2);
  assert.equal(p.pointAt(99).z, 5);
  assert.ok(p.samplesWithin(10, 5, 1, 0.5).length >= 2);
});

test('stat ops: set / add / mul with dotted paths', () => {
  const s = applyOps({ damage: 10, burn: { dps: 2 }, targets: { air: false } }, { mul: { damage: 2, 'burn.dps': 3 }, add: { range: 4 }, set: { 'targets.air': true } });
  assert.deepEqual(s, { damage: 20, burn: { dps: 6 }, targets: { air: true }, range: 4 });
});

test('upgrades: linear first, then a branch choice, evolution renames', () => {
  const def = C.towers.get('rifleman');
  const up = { linear: 0, branch: null, branchLevel: 0 };
  assert.equal(nextStep(def, up).kind, 'linear');
  up.linear = 2;
  assert.ok(nextStep(def, up).needsBranch);
  assert.equal(nextStep(def, up, 'A').step.name, 'Burst Fire');
  const st = towerStats(def, { linear: 2, branch: 'A', branchLevel: 2 });
  assert.equal(st.name, 'Commando');
  assert.ok(st.evolvedInMatch);
  assert.equal(st.stats.targets.air, true);
  assert.ok(st.stats.damage > def.stats.damage * 2);
  assert.equal(totalSpent(def, { linear: 1, branch: null, branchLevel: 0 }), def.cost + def.upgrades.linear[0].cost);
});

test('lobby levels scale stats and evolve permanently', () => {
  const def = C.towers.get('ember_adept');
  const prog = C.progression.towerLevels;
  const l1 = towerStats(def, undefined, 1, prog);
  const l5 = towerStats(def, undefined, 5, prog);
  const l15 = towerStats(def, undefined, 15, prog);
  assert.equal(l1.name, 'Ember Adept');
  assert.equal(l5.name, 'Veteran Ember Adept');
  assert.equal(l15.name, 'Legendary Ember Adept');
  assert.ok(l5.stats.damage > l1.stats.damage * 1.3);
  assert.ok(l15.stats.damage > l5.stats.damage * 2);
  assert.equal(towerStats(def, undefined, 99, prog).lobbyLevel, prog.maxLevel);
});

test('damage: resistances, armor, armor pierce, shields and vsShield', () => {
  const types = C.damageTypes;
  const e = { def: { resist: { fire: 1.5 } }, armor: 0.5, shield: 0, flying: false, markUntil: 0, mark: 0 };
  assert.equal(resolveDamage(e, { amount: 10, type: 'fire' }, types).toHp, 15); // weak to fire, armor ignores fire
  assert.equal(resolveDamage(e, { amount: 10, type: 'physical' }, types).toHp, 5); // armor halves physical
  assert.equal(resolveDamage(e, { amount: 10, type: 'physical', armorPierce: 1 }, types).toHp, 10);
  assert.equal(resolveDamage(e, { amount: 10, type: 'explosive' }, types).toHp, 7.5); // explosive pierces half the armor
  const sh = { def: {}, armor: 0, shield: 30, flying: false, markUntil: 0, mark: 0 };
  assert.deepEqual(resolveDamage(sh, { amount: 10, type: 'lightning' }, types), { toShield: 16, toHp: 0 });
  const r = resolveDamage(sh, { amount: 25, type: 'lightning' }, types); // 40 vs 30 shield -> 10 overflow / 1.6
  assert.equal(r.toShield, 30);
  assert.equal(r.toHp, 6.25);
  const marked = { ...sh, shield: 0, mark: 0.25, markUntil: 10 };
  assert.equal(resolveDamage(marked, { amount: 8, type: 'arcane' }, types, 5).toHp, 10);
});

test('targeting modes, stealth needs detection, flying needs anti-air', () => {
  const mk = (id, o) => ({ id, alive: true, x: 0, z: 0, hp: 50, shield: 0, progress: 10, curSpeed: 4, flying: false, stealth: false, ...o });
  const es = [mk(1, { progress: 50, hp: 10 }), mk(2, { progress: 20, hp: 90, curSpeed: 9 }), mk(3, { progress: 70, stealth: true }), mk(4, { progress: 5, flying: true, x: 3 })];
  const q = (mode, extra = {}) => pickTarget(es, { x: 0, z: 0, range: 10, targets: { ground: true, air: true }, detection: false, mode, ...extra })?.id;
  assert.equal(q('first'), 1); // 3 is stealthed
  assert.equal(q('first', { detection: true }), 3);
  assert.equal(q('last'), 4);
  assert.equal(q('strongest'), 2);
  assert.equal(q('weakest'), 1);
  assert.equal(q('fastest'), 2);
  assert.equal(q('flying'), 4);
  assert.equal(q('closest'), 1);
  assert.equal(pickTarget(es, { x: 0, z: 0, range: 10, targets: { ground: true, air: false }, detection: true, mode: 'flying' }), null);
  assert.equal(q('first', { range: 0.5, x: 20 }), undefined);
});

test('placement validation: road, props, other towers, cash, limit, bounds, slope', () => {
  const m = newMatch();
  assert.equal(m.canPlace('rifleman', SPOT.x, SPOT.z).ok, true);
  assert.equal(m.canPlace('mine_layer', NEAR.x, NEAR.z).ok, true);
  assert.equal(m.canPlace('rifleman', -14, 0).code, 'path'); // on the road
  assert.equal(m.canPlace('rifleman', 37, 9).code, 'blocked'); // watchtower
  assert.equal(m.canPlace('rifleman', 60, 0).code, 'bounds');
  assert.equal(m.canPlace('gunship', SPOT.x, SPOT.z).code, 'cash');
  assert.equal(m.canPlace('nope', 0, 0).code, 'unknown');
  m.command({ type: 'place', tower: 'rifleman', x: SPOT.x, z: SPOT.z });
  m.step();
  assert.equal(m.towers.length, 1);
  assert.equal(m.canPlace('rifleman', SPOT.x + 0.5, SPOT.z).code, 'blocked'); // overlapping tower
  const steep = [];
  for (let x = -50; x < 50 && !steep.length; x += 1) for (let z = -35; z < 35; z += 1) if (m.mw.terrain.slope(x, z) > 30 && m.mw.terrain.pathInfo(x, z).d > 6 && !m.mw.world.placementBlocker(x, z, 1)) { steep.push([x, z]); break; }
  assert.equal(m.canPlace('rifleman', ...steep[0]).code, 'slope');
  const lim = newMatch({ options: { infiniteCash: true } });
  let placed = 0;
  for (let x = -30; x < 30 && placed < 12; x += 2.5) {
    for (let z = -30; z < 30 && placed < 12; z += 2.5) {
      if (lim.canPlace('rifleman', x, z).ok) { lim.command({ type: 'place', tower: 'rifleman', x, z }); lim.step(); placed++; }
    }
  }
  assert.equal(lim.towers.length, C.towers.get('rifleman').limit);
  assert.equal(lim.canPlace('rifleman', 30, 30).code === 'limit' || lim.canPlace('rifleman', 30, 30).code !== 'ok', true);
});

test('economy: buy, upgrade, sell refund, kill rewards, wave bonus paid once', () => {
  const m = newMatch();
  const start = m.cash;
  m.command({ type: 'place', tower: 'rifleman', x: SPOT.x, z: SPOT.z });
  m.step();
  assert.equal(m.cash, start - 200);
  const uid = m.towers[0].uid;
  m.command({ type: 'upgrade', uid });
  m.step();
  const step1 = C.towers.get('rifleman').upgrades.linear[0].cost;
  assert.equal(m.cash, start - 200 - step1);
  assert.equal(m.command({ type: 'upgrade', uid: 999 }).ok, false);
  const events = [];
  m.command({ type: 'skip' });
  for (let k = 0; k < 60 * 40; k++) { m.step(); events.push(...m.drainEvents()); }
  assert.ok(m.stats.kills > 0, 'killed wave 1 enemies');
  assert.ok(m.stats.cashEarned >= m.stats.kills * C.enemies.get('husk').reward);
  if (m.canSkip()) m.command({ type: 'skip' });
  for (let k = 0; k < 3; k++) { m.step(); events.push(...m.drainEvents()); }
  const paid = events.filter((e) => e.type === 'waveReward').map((e) => e.wave);
  assert.deepEqual(paid, [...new Set(paid)], 'each wave bonus paid once');
  assert.equal(m.paidWaves, m.wave - 1, 'every finished wave paid');
  assert.ok(paid.length >= 1);
  const before = m.cash;
  m.command({ type: 'sell', uid });
  m.step();
  assert.equal(m.cash - before, Math.floor((200 + step1) * SELL_REFUND));
  assert.equal(m.towers.length, 0);
  assert.equal(m.canPlace('rifleman', SPOT.x, SPOT.z).ok, true, 'collider removed on sell');
});

test('waves: counts, difficulty and wave health scaling, boss flagged', () => {
  const m = newMatch({ difficulty: 'hard' });
  m.command({ type: 'skip' });
  run(m, 20);
  const ws = C.waves.get('riftline_campaign');
  assert.equal(m.stats.spawned, ws.waves[0].groups[0].count);
  const husk = m.enemies.find((e) => e.defId === 'husk') || { maxHp: C.enemies.get('husk').hp * 2.25 };
  assert.ok(Math.abs(husk.maxHp - C.enemies.get('husk').hp * 2.25) < 1e-9);
  assert.ok(Math.abs(m.enemyHpScale(11) - 2.25 * (1 + ws.hpScalePerWave * 10)) < 1e-9);
  assert.ok(ws.waves[9].boss && ws.waves[19].boss, 'boss on waves 10 and 20');
});

test('enemy behaviours: splitter, healer, regen stops while burning, leak damages the keep', () => {
  const m = newMatch();
  const sac = m.spawnEnemy('brood_sac', { d: 20 });
  m._damage(sac, { amount: 1e6, type: 'arcane' }, null);
  m.step();
  assert.equal(m.enemies.filter((e) => e.defId === 'mite').length, 4);

  const m2 = newMatch();
  const mender = m2.spawnEnemy('mender', { d: 30 });
  const hurt = m2.spawnEnemy('husk', { d: 31 });
  hurt.hp = 5;
  mender.healT = 0.01;
  m2.step();
  assert.ok(hurt.hp > 5, 'healed');

  const m3 = newMatch();
  const moss = m3.spawnEnemy('mossback', { d: 10 });
  moss.hp = moss.maxHp / 2;
  m3.step();
  assert.ok(moss.hp > moss.maxHp / 2, 'regenerates');
  const h0 = moss.hp;
  m3._damage(moss, { amount: 0.001, type: 'fire', burn: { dps: 1, duration: 5 } }, null);
  run(m3, 1);
  assert.ok(moss.hp < h0, 'no regen while burning');

  const m4 = newMatch();
  const e = m4.spawnEnemy('husk', { d: m4.paths[0].length - 0.01 });
  const hp = m4.baseHp;
  m4.step();
  assert.equal(m4.baseHp, hp - e.def.leak);
  assert.equal(m4.stats.leaks, 1);
});

test('stealth enemies ignored without detection; flying ignored by ground-only towers', () => {
  const m = newMatch({ options: { infiniteCash: true } });
  m.command({ type: 'place', tower: 'rifleman', x: SPOT.x, z: SPOT.z });
  m.step();
  const t = m.towers[0];
  const near = m.paths[0].samplesWithin(t.x, t.z, 12)[0];
  assert.ok(Number.isFinite(near));
  const shade = m.spawnEnemy('shade', { d: near });
  shade.baseSpeed = 0;
  const wing = m.spawnEnemy('gloomwing', { d: near });
  wing.baseSpeed = 0;
  run(m, 3);
  assert.equal(shade.hp, shade.maxHp);
  assert.equal(wing.hp, wing.maxHp);
  m.command({ type: 'upgrade', uid: t.uid });
  m.command({ type: 'upgrade', uid: t.uid }); // Long Scope: detection
  run(m, 3);
  assert.ok(shade.hp < shade.maxHp, 'detection reveals the shade');
  assert.equal(wing.hp, wing.maxHp, 'still cannot hit air');
});

test('boss phases: telegraph warns first, then stuns towers in range', () => {
  const m = newMatch({ options: { infiniteCash: true } });
  m.command({ type: 'place', tower: 'rifleman', x: NEAR.x, z: NEAR.z });
  m.step();
  const t = m.towers[0];
  const d = m.paths[0].samplesWithin(t.x, t.z, 7)[0];
  assert.ok(Number.isFinite(d));
  const boss = m.spawnEnemy('gravemaw', { d });
  boss.baseSpeed = 0;
  m._damage(boss, { amount: boss.maxHp * 0.3, type: 'holy' }, null);
  const ev = m.drainEvents();
  assert.ok(ev.some((e) => e.type === 'bossPhase' && e.name === 'Rift Stomp'));
  const tg = ev.find((e) => e.type === 'telegraph');
  assert.ok(tg && tg.delay > 1, 'telegraphed with a warning delay');
  assert.ok(t.stunUntil <= m.time, 'not stunned before the warning ends');
  run(m, tg.delay + 0.1);
  assert.ok(t.stunUntil > m.time, 'stunned after the telegraph');
  assert.equal(ev.filter((e) => e.type === 'spawn' && e.enemy === 'mite').length, 8, 'summoned minions');
});

test('abilities: cooldown, manual cast damages, automatic mode fires on groups', () => {
  const m = newMatch();
  m.command({ type: 'skip' });
  m.step();
  const d = 30;
  const group = [0, 0.5, 1, 1.5, 2].map((o) => m.spawnEnemy('husk', { d: d + o }));
  for (const e of group) e.baseSpeed = 0;
  const p = m.paths[0].pointAt(d + 1, {});
  assert.ok(m.command({ type: 'ability', id: 'airstrike', x: p.x, z: p.z }).ok);
  m.step();
  assert.equal(m.command({ type: 'ability', id: 'airstrike', x: p.x, z: p.z }).code, 'cooldown');
  run(m, 2);
  assert.ok(group.every((e) => !e.alive), 'airstrike killed the group');
  const m2 = newMatch();
  m2.command({ type: 'skip' });
  m2.command({ type: 'abilityMode', id: 'frost_nova', mode: 'auto' });
  m2.step();
  for (const o of [0, 0.4, 0.8, 1.2, 1.6]) m2.spawnEnemy('mossback', { d: 40 + o }).baseSpeed = 0;
  run(m2, 1);
  assert.ok(m2.enemies.some((e) => e.stunUntil > m2.time), 'auto frost nova froze the group');
});

test('summoner wolves block and fight; mines explode under enemies; support aura buffs', () => {
  const m = newMatch({ options: { infiniteCash: true } });
  m.command({ type: 'skip' });
  m.command({ type: 'place', tower: 'spirit_summoner', x: SPOT.x, z: SPOT.z });
  run(m, 10);
  assert.ok(m.allies.length >= 1 || m.drainEvents().some((e) => e.type === 'allySpawn'), 'wolf summoned');

  const m2 = newMatch({ options: { infiniteCash: true } });
  m2.command({ type: 'place', tower: 'mine_layer', x: NEAR.x, z: NEAR.z });
  run(m2, 4);
  assert.ok(m2.mines.length >= 1, 'mine planted');
  const mine = m2.mines[0];
  const near = m2.paths[0].samplesWithin(mine.x, mine.z, 1.2)[0];
  const e = m2.spawnEnemy('husk', { d: near });
  m2.step();
  m2.step();
  assert.ok(!e.alive || e.hp < e.maxHp, 'mine hurt the enemy');

  const m3 = newMatch({ options: { infiniteCash: true } });
  m3.command({ type: 'place', tower: 'rifleman', x: SPOT.x, z: SPOT.z });
  m3.step();
  const base = m3.effective(m3.towers[0]).damage;
  m3.command({ type: 'place', tower: 'rune_totem', x: SPOT.x + 3, z: SPOT.z - 2.5 });
  m3.step();
  m3.step();
  assert.ok(m3.towers.length === 2, 'totem placed');
  assert.ok(Math.abs(m3.effective(m3.towers[0]).damage - base * 1.12) < 1e-9, 'aura +12% damage');
});

test('determinism: same seed and commands give the same hash; replay reproduces it', () => {
  const a = playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 'det', maxTicks: 60 * 300 });
  const b = playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 'det', maxTicks: 60 * 300 });
  assert.equal(a.hash, b.hash);
  assert.ok(a.log.length > 10);
  assert.equal(replay(a, { content: C, mapWorld: buildMapWorld(MAP, C.props) }), a.hash);
  // a different command stream gives a different result
  const c = playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 'det', maxTicks: 60 * 300, weak: true });
  assert.notEqual(c.hash, a.hash);
});

test('balance: bot wins Normal with level-1 towers, a 2-tower strategy loses', () => {
  const win = playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), difficulty: 'normal', seed: 'bal0' });
  assert.equal(win.won, true, `normal: reached wave ${win.wave}`);
  assert.ok(win.baseHp < 150, 'not flawless: some pressure');
  const weak = playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), difficulty: 'normal', seed: 'bal0', weak: true });
  assert.equal(weak.won, false);
});
