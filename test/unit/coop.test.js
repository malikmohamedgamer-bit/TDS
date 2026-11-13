// Co-op simulation (docs/multiplayer.md, Contract 1): players, wallets, ownership, per-player
// heroes and abilities, income attribution, wave bonus split, determinism and result().players.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { createScript, roadSpots } from './helpers/coopScript.js';

const C = await content();
const world = (id = 'riftline') => buildMapWorld(C.maps.get(id), C.props);
const LOADOUT = ['rifleman', 'gunner', 'ember_adept', 'supply_depot', 'spirit_summoner', 'mine_layer'];
const TWO = [{ pid: 'p1', hero: 'commander_vale', name: 'Ada' }, { pid: 'p2', hero: 'sergeant_kade', name: 'Bo' }];
const THREE = [...TWO, { pid: 'p3', hero: 'warmaster_ryn', name: 'Cy' }];
const coop = (players = TWO, extra = {}) => new Match({
  content: C, mapWorld: world(extra.map), seed: extra.seed || 'coop', loadout: LOADOUT, players,
  options: { mode: 'coop', manualStart: true, ...(extra.options || {}) },
});
const HUSK = C.enemies.get('husk');
/** A spot where `tower` can be built (the first free one from the road grid). */
const spotFor = (m, tower, pid) => roadSpots(m).find((s) => m.canPlace(tower, s.x, s.z, null, false, pid).ok);
/** Places a tower for pid and applies it; returns the tower. */
function build(m, tower, pid) {
  const s = spotFor(m, tower, pid);
  assert.ok(m.command({ type: 'place', tower, x: s.x, z: s.z, pid }).ok);
  m.step();
  return m.towers[m.towers.length - 1];
}
/** Kills a fresh husk with a lethal hit from src (a tower or null) / packet.by. */
function killHusk(m, src, by) {
  const e = m.spawnEnemy('husk', { d: 3 });
  m._damage(e, { amount: e.hp * 10, type: 'physical', by }, src);
  assert.equal(e.alive, false);
  return e;
}

test('a match without players is one player p1: cash, hero and abilities as before', () => {
  const m = new Match({ content: C, mapWorld: world(), seed: 'sp', hero: 'warmaster_ryn' });
  assert.deepEqual(m.players.map((p) => p.pid), ['p1']);
  assert.equal(m.heroes.length, 1);
  assert.equal(m.hero, m.heroes[0]);
  assert.equal(m.hero.def.id, 'warmaster_ryn');
  assert.equal(m.hero.pid, 'p1');
  assert.equal(m.abilities, m.abilitiesOf('p1'));
  assert.equal(m.abilitiesOf(), m.abilities, 'no pid = the first player');
  assert.equal(m.wallet('p1'), m.cash);
  m.cash = 1234;
  assert.equal(m.wallet('p1'), 1234);
  assert.equal(m.wallets[0], 1234);
  assert.equal(m.wallet('nobody'), 0);
  assert.deepEqual(m.abilitiesOf('nobody'), []);
  assert.equal(m.heroOf('nobody'), null);
  assert.equal(m.result().players, undefined, 'single-player results keep their old shape');
});

test('players: 1-4, unique ids; the co-op mode scales start cash and enemy health by player count', () => {
  assert.throws(() => coop([...THREE, { pid: 'p4' }, { pid: 'p5' }]), /At most 4/);
  assert.throws(() => coop([{ pid: 'x' }, { pid: 'x' }]), /unique/);
  const mode = C.modes.get('coop');
  assert.equal(mode.online, true);
  const solo = coop([{ pid: 'p1' }]);
  for (const [n, players] of [[2, TWO], [3, THREE]]) {
    const m = coop(players);
    assert.deepEqual(m.wallets, players.map(() => Math.round(solo.cash * mode.coop.cashShare[n - 1])));
    const e = m.spawnEnemy('husk');
    const e1 = solo.spawnEnemy('husk');
    assert.ok(Math.abs(e.maxHp - e1.maxHp * mode.coop.enemyHp[n - 1]) < 1e-9, `${n} players: enemy health`);
  }
  // two players outside the co-op mode: no scaling (the numbers belong to the coop mode)
  const camp = new Match({ content: C, mapWorld: world(), seed: 'coop', loadout: LOADOUT, players: TWO });
  const sp = new Match({ content: C, mapWorld: world(), seed: 'coop', loadout: LOADOUT });
  assert.deepEqual(camp.wallets, [sp.cash, sp.cash]);
  assert.equal(camp.spawnEnemy('husk').maxHp, sp.spawnEnemy('husk').maxHp);
});

test('ownership: only the owner upgrades, sells, moves or retargets a tower; unknown pids are refused', () => {
  const m = coop();
  const c2 = m.wallet('p2');
  const t = build(m, 'rifleman', 'p1');
  assert.equal(t.owner, 'p1');
  assert.equal(m.wallet('p2'), c2, 'the placer pays, nobody else');
  const s = spotFor(m, 'rifleman', 'p2');
  for (const cmd of [{ type: 'upgrade', uid: t.uid }, { type: 'sell', uid: t.uid }, { type: 'target', uid: t.uid, mode: 'last' }, { type: 'move', uid: t.uid, x: s.x, z: s.z }]) {
    const v = m.validate({ ...cmd, pid: 'p2' });
    assert.equal(v.ok, false, cmd.type);
    assert.equal(v.code, 'owner', cmd.type);
    assert.equal(m.command({ ...cmd, pid: 'p2' }).ok, false);
    assert.equal(m.validate({ ...cmd, pid: 'p1' }).ok, true, `${cmd.type} by the owner`);
    assert.equal(m.validate(cmd).ok, true, `${cmd.type} without pid = the first player`);
  }
  for (const cmd of [{ type: 'place', tower: 'rifleman', x: s.x, z: s.z }, { type: 'upgrade', uid: t.uid }, { type: 'hero', x: 1, z: 1 }, { type: 'skip' }, { type: 'ability', id: m.abilities[0].id }]) {
    assert.equal(m.validate({ ...cmd, pid: 'ghost' }).code, 'player', cmd.type);
  }
  assert.equal(m.canPlace('rifleman', s.x, s.z, null, false, 'ghost').code, 'player');
  // the owner's commands work and use the owner's wallet
  const c1 = m.wallet('p1');
  const up = m.validate({ type: 'upgrade', uid: t.uid, pid: 'p1' });
  m.command({ type: 'upgrade', uid: t.uid, pid: 'p1' });
  m.command({ type: 'target', uid: t.uid, mode: 'strongest', pid: 'p1' });
  m.step();
  assert.equal(m.wallet('p1'), c1 - up.cost);
  assert.equal(m.wallet('p2'), c2);
  assert.equal(t.targeting, 'strongest');
  const refund = m.refundOf(t);
  m.command({ type: 'sell', uid: t.uid, pid: 'p1' });
  m.step();
  assert.equal(m.wallet('p1'), c1 - up.cost + refund);
  assert.equal(m.towers.length, 0);
  // the cash check reads the issuing player's wallet
  m.wallets[1] = 0;
  assert.equal(m.validate({ type: 'place', tower: 'rifleman', x: s.x, z: s.z, pid: 'p2' }).code, 'cash');
  assert.equal(m.validate({ type: 'place', tower: 'rifleman', x: s.x, z: s.z, pid: 'p1' }).ok, true);
});

test('each player has a hero and abilities of their own', () => {
  const m = coop(THREE);
  assert.deepEqual(m.heroes.map((h) => [h.pid, h.def.id]), THREE.map((p) => [p.pid, p.hero]));
  assert.equal(m.hero, m.heroes[0]);
  assert.equal(m.heroOf('p2'), m.heroes[1]);
  assert.equal(new Set(m.heroes.map((h) => `${h.x},${h.z}`)).size, 3, 'heroes start apart');
  assert.deepEqual(m.abilitiesOf('p2').map((a) => a.id), C.heroes.get('sergeant_kade').abilities);
  assert.equal(m.abilities, m.abilitiesOf('p1'));
  // hero commands move only the issuer's hero
  const before = m.heroes.map((h) => [h.x, h.z]);
  m.command({ type: 'hero', x: 5, z: 6, pid: 'p2' });
  m.step();
  assert.deepEqual([m.heroes[1].x, m.heroes[1].z], [5, 6]);
  assert.deepEqual([m.heroes[0].x, m.heroes[0].z], before[0]);
  assert.deepEqual([m.heroes[2].x, m.heroes[2].z], before[2]);
  // abilities: someone else's ability is not equipped; cooldowns and modes are per player
  const kade = m.abilitiesOf('p2')[0];
  assert.equal(m.validate({ type: 'ability', id: kade.id, x: 0, z: 0, pid: 'p1' }).code, 'missing');
  assert.equal(m.validate({ type: 'abilityMode', id: kade.id, mode: 'auto', pid: 'p1' }).ok, false);
  m.command({ type: 'ability', id: kade.id, x: 0, z: 0, pid: 'p2' });
  m.command({ type: 'abilityMode', id: m.abilitiesOf('p3')[0].id, mode: 'auto', pid: 'p3' });
  m.step();
  assert.ok(kade.ready > m.time);
  assert.equal(m.validate({ type: 'ability', id: kade.id, x: 0, z: 0, pid: 'p2' }).code, 'cooldown');
  assert.ok(m.abilitiesOf('p1').every((a) => a.ready === 0));
  assert.equal(m.abilitiesOf('p3')[0].mode, 'auto');
  assert.equal(m.abilitiesOf('p1')[0].mode, 'manual');
  // a downed hero blocks only its own player's abilities
  m._heroDown(m.heroes[0]);
  assert.equal(m.validate({ type: 'ability', id: m.abilities[0].id, x: 0, z: 0, pid: 'p1' }).code, 'down');
  assert.equal(m.validate({ type: 'ability', id: m.abilitiesOf('p3')[1].id, x: 0, z: 0, pid: 'p3' }).ok, true);
});

test('two players can carry the same ability: each copy has its own cooldown', () => {
  const m = coop([{ pid: 'a', hero: 'commander_vale' }, { pid: 'b', hero: 'archmage_seren' }]);
  assert.ok(m.abilitiesOf('a').some((x) => x.id === 'frost_nova') && m.abilitiesOf('b').some((x) => x.id === 'frost_nova'));
  m.command({ type: 'ability', id: 'frost_nova', x: 0, z: 0, pid: 'b' });
  m.step();
  assert.equal(m.validate({ type: 'ability', id: 'frost_nova', x: 0, z: 0, pid: 'b' }).code, 'cooldown');
  assert.equal(m.validate({ type: 'ability', id: 'frost_nova', x: 0, z: 0, pid: 'a' }).ok, true);
});

test('every hero fights, gets hurt and goes down on its own', () => {
  const m = coop(TWO, { options: { enemiesHurtHero: true } });
  const e = m.spawnEnemy('husk', { d: 20 });
  // both heroes next to the enemy: both attack it
  for (const h of m.heroes) { h.x = e.x + 1; h.z = e.z; }
  e.hp = e.maxHp = 1e6;
  m.time = 1; // let attack cooldowns run out
  const events = [];
  for (let i = 0; i < 120; i++) { m._updateHero(1 / 60); events.push(...m.drainEvents()); }
  const attackers = new Set(events.filter((ev) => ev.type === 'heroAttack').map((ev) => ev.pid));
  assert.deepEqual([...attackers].sort(), ['p1', 'p2']);
  assert.ok(m.playerStats[0].damage > 0 && m.playerStats[1].damage > 0, 'hero damage is credited per player');
  // an enemy attack hits every hero in range; each goes down with its own timer
  const atk = { range: 5, damage: 1e4, stun: 0, interval: 1 };
  m._enemyAttack({ ...e, def: { ...e.def, attack: atk } });
  const downs = m.drainEvents().filter((ev) => ev.type === 'heroDown');
  assert.deepEqual(downs.map((ev) => ev.pid), ['p1', 'p2']);
  assert.ok(m.heroes.every((h) => h.hp === 0 && h.downUntil > m.time));
  // one comes back while the other stays down
  m.heroes[1].downUntil = m.time;
  m._updateHero(1 / 60);
  assert.equal(m.heroes[1].hp, m.heroes[1].maxHp);
  assert.equal(m.heroes[0].hp, 0);
});

test('kill cash goes to whoever made the kill: tower owner, hero, ally, ability caster; no source splits', () => {
  const m = coop(THREE);
  const t = build(m, 'rifleman', 'p2');
  const start = m.wallets.slice();
  const kill = m._gainCash(HUSK.reward, 'kill', -1); // the per-kill amount (rounded once)
  m.wallets = start.slice(); m.playerStats.forEach((s) => { s.cashEarned = 0; }); m.stats.cashEarned = 0;
  killHusk(m, t, undefined);
  assert.deepEqual(m.wallets, [start[0], start[1] + kill, start[2]], 'tower kill: its owner');
  assert.equal(t.kills, 1);
  killHusk(m, null, 'p3'); // hero hit, ally hit or ability packet: packet.by
  assert.deepEqual(m.wallets, [start[0], start[1] + kill, start[2] + kill]);
  assert.deepEqual(m.playerStats.map((s) => s.kills), [0, 1, 1]);
  // burn ticks keep crediting the tower that set the fire
  const e = m.spawnEnemy('husk', { d: 3 });
  m._damage(e, { amount: 1, type: 'fire', burn: { dps: 1e5, duration: 1 } }, t);
  m.step();
  assert.equal(e.alive, false);
  assert.equal(m.playerStats[1].kills, 2);
  // no source at all: the cash is split evenly
  const w = m.wallets.slice();
  killHusk(m, null, undefined);
  const got = m.wallets.map((v, i) => v - w[i]);
  assert.equal(got.reduce((a, b) => a + b, 0), kill);
  assert.ok(Math.max(...got) - Math.min(...got) <= 1);
  assert.equal(m.stats.kills, 4);
});

test('ability effects belong to the caster: skill allies, executes and war chests', () => {
  const m = coop([{ pid: 'a', hero: 'commander_vale' }, { pid: 'b', hero: 'sergeant_kade' }, { pid: 'c', hero: 'warmaster_ryn' }, { pid: 'd', hero: 'shadowblade_vex' }]);
  const p = C.maps.get('riftline').paths[0].points[3];
  m._castAbility('reinforcements', p.x ?? p[0], p.z ?? p[1], 1);
  m.time += 5;
  m._updateAbilities();
  const allies = m.allies.filter((x) => x.owner === -1);
  assert.equal(allies.length, 2);
  assert.ok(allies.every((x) => x.pid === 'b'));
  const before = m.wallets.slice();
  const cash = C.abilities.get('war_chest').effects.cash;
  m._castAbility('war_chest', 0, 0, 2);
  m.time += 5;
  m._updateAbilities();
  assert.deepEqual(m.wallets, before.map((v, i) => (i === 2 ? v + cash : v)));
  assert.equal(m.playerStats[2].cashEarned, cash);
  // execute (Shadow Strike) credits the kill and its damage to the caster
  const e = m.spawnEnemy('husk', { d: 10 });
  e.hp = 1;
  m._castAbility('shadow_strike', e.x, e.z, 3);
  m.time += 5;
  m._updateAbilities();
  assert.equal(e.alive, false);
  assert.equal(m.playerStats[3].kills, 1);
  assert.ok(m.playerStats[3].damage > 0);
});

test('wave bonus is split evenly (remainder to the first players), tower income goes to the owner', () => {
  const m = coop(THREE, { options: { startCash: 5000 } });
  const depot = build(m, 'supply_depot', 'p3');
  const income = depot.base.income;
  // a bonus that does not divide by 3: find the next wave whose (rounded) bonus leaves a remainder
  const bonusOf = (w) => Math.round(((m.waveSet.bonusBase ?? 100) + (m.waveSet.bonusPerWave ?? 0) * w) * m.tune.waveBonus * (m.options.cashMul ?? 1) * (m.difficulty.cashMul ?? 1));
  let w = 1;
  while (bonusOf(w) % 3 === 0) w++;
  const bonus = bonusOf(w);
  const incomeCash = Math.round(income * (m.options.cashMul ?? 1) * (m.difficulty.cashMul ?? 1));
  m.paidWaves = w - 1;
  m.wave = w;
  const before = m.wallets.slice();
  m._payWaveRewards();
  const base = Math.floor(bonus / 3);
  const rem = bonus - base * 3;
  const want = [0, 1, 2].map((i) => base + (i < rem ? 1 : 0) + (i === 2 ? incomeCash : 0));
  assert.deepEqual(m.wallets.map((v, i) => v - before[i]), want);
  assert.ok(rem > 0, 'the remainder case was exercised');
  assert.deepEqual(m.playerStats.map((s) => s.cashEarned), want);
  // paid once only
  m._payWaveRewards();
  assert.deepEqual(m.wallets.map((v, i) => v - before[i]), want);
});

test('a boss draining cash takes its share from every wallet', () => {
  const m = coop();
  m.wallets = [1000, 501];
  m._bossAction(m.spawnEnemy('husk'), { type: 'drainCash', pct: 0.1 });
  assert.deepEqual(m.wallets, [900, 451]);
});

test('summoned allies and mines credit the tower owner', () => {
  const m = coop(TWO, { options: { startCash: 5000 } });
  const summoner = build(m, 'spirit_summoner', 'p2');
  m.command({ type: 'skip' });
  for (let i = 0; i < 60 * 12 && !m.allies.length; i++) m.step();
  assert.ok(m.allies.length > 0);
  assert.ok(m.allies.every((a) => a.owner === summoner.uid && a.pid === 'p2'));
  const layer = build(m, 'mine_layer', 'p1');
  for (let i = 0; i < 60 * 6 && !m.mines.some((x) => x.owner === layer.uid); i++) m.step();
  assert.ok(m.mines.some((x) => x.owner === layer.uid));
});

test('determinism: the same players, options and commands give the same hash on every tick', () => {
  const run = () => {
    const m = coop(THREE, { seed: 'det', options: { manualStart: false, cashMul: 2 } });
    const script = createScript(m, { seed: 'det', favour: ['spirit_summoner', 'mine_layer'] });
    const hashes = [];
    for (let i = 0; i < 60 * 150; i++) {
      for (const c of script(m)) m.command(c);
      m.step();
      m.drainEvents();
      hashes.push(m.hash());
    }
    return { m, hashes };
  };
  const a = run();
  const b = run();
  assert.equal(a.hashes.length, b.hashes.length);
  for (let i = 0; i < a.hashes.length; i++) if (a.hashes[i] !== b.hashes[i]) assert.fail(`hash differs at tick ${i + 1}`);
  assert.deepEqual(a.m.snapshot(), b.m.snapshot());
  assert.ok(a.m.wave >= 3, 'the run got into the waves');
  assert.ok(new Set(a.m.towers.map((t) => t.owner)).size >= 2, 'several players built');
});

test('co-op hash covers every wallet and hero; single-player hash ignores the extra fields', () => {
  const m = coop();
  const h0 = m.hash();
  m.wallets[1] += 1;
  assert.notEqual(m.hash(), h0);
  m.wallets[1] -= 1;
  m.heroes[1].x += 1;
  assert.notEqual(m.hash(), h0);
  // a player count of one hashes like an old single-player match (fixture: test/fixtures/sp-golden.json)
  const sp = new Match({ content: C, mapWorld: world(), seed: 'h' });
  const solo = new Match({ content: C, mapWorld: world(), seed: 'h', players: [{ pid: 'p1' }] });
  assert.equal(sp.hash(), solo.hash());
});

test('result().players reports what each player did', () => {
  const m = coop(TWO);
  const t = build(m, 'rifleman', 'p2');
  killHusk(m, t, undefined);
  const r = m.result();
  assert.deepEqual(r.players.map((p) => p.pid), ['p1', 'p2']);
  assert.deepEqual(r.players.map((p) => p.name), ['Ada', 'Bo']);
  assert.deepEqual(r.players.map((p) => p.hero), ['commander_vale', 'sergeant_kade']);
  for (const p of r.players) for (const k of ['kills', 'damage', 'cashEarned', 'placed']) assert.equal(typeof p[k], 'number', k);
  assert.deepEqual(r.players.map((p) => [p.kills, p.placed]), [[0, 0], [1, 1]]);
  assert.ok(r.players[1].damage > 0 && r.players[0].damage === 0);
  assert.equal(r.players[1].cashEarned, m.playerStats[1].cashEarned);
  assert.equal(JSON.parse(JSON.stringify(r)).players.length, 2);
});

test('tower limits count per player', () => {
  const def = [...C.towers.values()].find((d) => d.limit && d.cost <= 600);
  const m = new Match({ content: C, mapWorld: world(), seed: 'lim', loadout: [def.id], players: TWO, options: { mode: 'coop', manualStart: true, infiniteCash: true } });
  for (let i = 0; i < def.limit; i++) build(m, def.id, 'p1');
  const s = spotFor(m, def.id, 'p2');
  assert.equal(m.canPlace(def.id, s.x, s.z, null, false, 'p1').code, 'limit');
  assert.equal(m.canPlace(def.id, s.x, s.z, null, false, 'p2').ok, true);
});
