// Milestone 7, content batch 1: legendary towers, the Thornmother boss, the Frostmere Crossing map
// (two roads), and the summon / bot / daily rules that depend on them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { towerStats } from '../../src/sim/stats.js';
import { playBot } from '../../src/sim/bot.js';
import { newSave } from '../../src/save/save.js';
import { ensureStarters, summon, dailyChallenge } from '../../src/meta/meta.js';
import { soakMap } from '../../src/core/soak.js';

const C = await content();
const world = (id) => buildMapWorld(C.maps.get(id), C.props);
const run = (m, s) => { for (let i = 0; i < s * 60; i++) m.step(); };

test('content batch 1 is loaded: 2 legendary towers, 2 bosses, 2 maps', () => {
  const legend = [...C.towers.values()].filter((t) => t.rarity === 'legendary').map((t) => t.id).sort();
  assert.deepEqual(legend, ['starfall_oracle', 'titan_railgun']);
  assert.deepEqual([...C.enemies.values()].filter((e) => e.boss).map((e) => e.id).sort(), ['gravemaw', 'thornmother']);
  assert.deepEqual([...C.maps.keys()].sort(), ['frostmere', 'riftline']);
  assert.equal(C.maps.get('frostmere').paths.length, 2);
});

test('Titan Railgun ignores armour, hits air and hidden enemies; Arc Rail branch chains', () => {
  const def = C.towers.get('titan_railgun');
  const base = towerStats(def).stats;
  assert.equal(base.armorPierce, 1);
  assert.ok(base.targets.air && base.detection);
  const arc = towerStats(def, { linear: 2, branch: 'B', branchLevel: 2 }).stats;
  assert.equal(arc.chain.count, 5);
  assert.ok(arc.rate > base.rate * 1.9, 'linear + Storm Rail fire rate');
  const m = new Match({ content: C, mapWorld: world('riftline'), seed: 'rail', options: { infiniteCash: true } });
  m.command({ type: 'place', tower: 'titan_railgun', x: -4, z: -6 });
  m.step();
  const e = m.spawnEnemy('ironshell', { d: 60 });
  e.baseSpeed = 0;
  const hp0 = e.hp;
  run(m, 5);
  assert.ok(hp0 - e.hp >= base.damage * 0.99 || !e.alive, 'full damage through 50% armour');
});

test('Starfall Oracle splashes and marks: marked enemies take more damage', () => {
  const st = towerStats(C.towers.get('starfall_oracle')).stats;
  assert.ok(st.splash > 3 && st.mark.amount > 0 && st.targets.air);
  const m = new Match({ content: C, mapWorld: world('riftline'), seed: 'star', options: { infiniteCash: true } });
  m.command({ type: 'place', tower: 'starfall_oracle', x: -4, z: -6 });
  m.step();
  const d = m.paths[0].samplesWithin(-4, -6, 15)[0];
  assert.ok(Number.isFinite(d));
  const es = [0, 1, 2].map((i) => { const e = m.spawnEnemy('mossback', { d: d + i * 0.8 }); e.baseSpeed = 0; return e; });
  run(m, 6);
  assert.ok(es.filter((e) => e.hp < e.maxHp).length >= 2, 'splash hit several');
  assert.ok(es.some((e) => e.mark > 0 && e.markUntil > m.time), 'marked');
});

test('Thornmother phases: brood burst, carapace shield with telegraph, frenzy; no healers summoned', () => {
  const m = new Match({ content: C, mapWorld: world('riftline'), seed: 'thorn', options: { infiniteCash: true } });
  const boss = m.spawnEnemy('thornmother', { d: 20 });
  boss.baseSpeed = 0;
  const seen = [];
  for (const f of [0.35, 0.3, 0.8]) {
    m._damage(boss, { amount: boss.maxHp * f, type: 'holy' }, null);
    m.step();
    seen.push(...m.drainEvents());
  }
  const phases = seen.filter((e) => e.type === 'bossPhase').map((e) => e.name);
  assert.deepEqual(phases, ['Brood Burst', 'Thorn Carapace', 'Frenzy']);
  assert.ok(seen.some((e) => e.type === 'telegraph'));
  const spawned = seen.filter((e) => e.type === 'spawn').map((e) => e.enemy);
  assert.ok(spawned.includes('brood_sac') && spawned.includes('skitter'));
  assert.ok(!spawned.includes('mender'), 'frenzy does not heal her');
});

test('Frostmere: two roads used by waves, both reach the keep, soak walker never gets stuck', () => {
  const mw = world('frostmere');
  const m = new Match({ content: C, mapWorld: mw, seed: 'fm' });
  assert.equal(m.paths.length, 2);
  for (const p of m.paths) {
    const end = p.pointAt(p.length, {});
    assert.ok(Math.hypot(end.x - 45, end.z - 2) < 1, 'road ends at the keep');
  }
  const groups = C.waves.get('frostmere_campaign').waves.flatMap((w) => w.groups);
  assert.ok(groups.some((g) => g.path === 0) && groups.some((g) => g.path === 1));
  assert.equal(C.waves.get('frostmere_campaign').waves[19].groups[0].enemy, 'thornmother');
  const r = soakMap(world('frostmere'), { seconds: 300 });
  assert.equal(r.failures.length, 0);
  assert.equal(r.rescues, 0);
});

test('summons can now roll legendary towers (no more epic fallback)', () => {
  const save = newSave(1);
  ensureStarters(save, C.meta);
  save.wallet.sigils = 1e7;
  const got = new Set();
  for (let i = 0; i < 40 && got.size === 0; i++) {
    for (const r of (summon(save, C, C.meta, 'standard', 10).results || [])) if (r.rarity === 'legendary') got.add(r.tower);
  }
  assert.ok(got.size > 0, 'a legendary appeared in 400 pulls');
  for (const id of got) assert.equal(C.towers.get(id).rarity, 'legendary');
});

test('daily loaners stay at epic or below (legendaries do not change the measured daily)', () => {
  for (let i = 0; i < 30; i++) {
    const dc = dailyChallenge(C, new Date(Date.UTC(2026, 10, 5 + i)).toISOString().slice(0, 10));
    for (const id of dc.loadout) assert.notEqual(C.towers.get(id).rarity, 'legendary');
  }
});

test('balance smoke: Frostmere Normal is winnable with the non-legendary towers; lazy play loses', () => {
  const loadout = [...C.towers.values()].filter((t) => t.rarity !== 'legendary').map((t) => t.id);
  const won = ['bal-1', 'bal-2', 'bal-3'].filter((seed) => playBot({ content: C, mapWorld: world('frostmere'), difficulty: 'normal', seed, skill: 0.7, loadout }).won);
  assert.ok(won.length >= 1, 'at least one of three seeds wins');
  assert.equal(playBot({ content: C, mapWorld: world('frostmere'), difficulty: 'normal', seed: 'bal-1', skill: 0.7, strategy: 'lazy' }).won, false);
});

test('difficulty bossHpMul softens bosses only, on that difficulty only', () => {
  const mk = (difficulty) => new Match({ content: C, mapWorld: world('riftline'), seed: 'bh', difficulty });
  const ratio = (d) => { const m = mk(d); return m.spawnEnemy('gravemaw', { d: 5 }).maxHp / m.spawnEnemy('husk', { d: 5 }).maxHp; };
  const med = C.difficulties.get('medium');
  assert.ok(med.bossHpMul > 0 && med.bossHpMul < 1);
  assert.ok(Math.abs(ratio('medium') / ratio('normal') - med.bossHpMul) < 1e-9);
  assert.equal(C.difficulties.get('normal').bossHpMul ?? 1, 1, 'Normal is unchanged');
});
