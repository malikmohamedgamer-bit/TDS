import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content, coreTowers } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { generateWave, bossPool } from '../../src/sim/waveGen.js';
import { newSave } from '../../src/save/save.js';
import { ensureStarters, applyMatchResult, dailyChallenge } from '../../src/meta/meta.js';
import { playBot } from '../../src/sim/bot.js';

const C = await content();
const MAP = C.maps.get('riftline');
const mk = (options = {}) => new Match({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 'mode', options });

test('every mode in data/modes.json builds a match', () => {
  assert.ok(C.modes.size >= 7);
  for (const id of C.modes.keys()) {
    const m = mk({ mode: id });
    assert.equal(m.mode.id, id);
    assert.ok(m.waveDef(1)?.groups.length > 0, `${id} has a first wave`);
  }
});

test('endless: waves continue past the table, deterministic, boss every 10', () => {
  const m = mk({ mode: 'endless' });
  assert.equal(m.waveCount(), Infinity);
  const ws = C.waves.get('riftline_campaign');
  const a = generateWave(37, { seed: 'x', content: C, waveSet: ws });
  const b = generateWave(37, { seed: 'x', content: C, waveSet: ws });
  assert.deepEqual(a, b);
  for (const n of [30, 40, 50]) {
    const w = m.waveDef(n);
    assert.ok(w.boss && C.enemies.get(w.groups[0].enemy).boss, `wave ${n} has a boss`);
  }
  const big = m.waveDef(45).groups.reduce((s, g) => s + g.count * C.enemies.get(g.enemy).hp, 0);
  const small = m.waveDef(21).groups.reduce((s, g) => s + g.count * C.enemies.get(g.enemy).hp, 0);
  assert.ok(big > small, 'later waves are bigger');
});

test('boss rush rotates through every boss', () => {
  const m = mk({ mode: 'boss_rush' });
  const pool = bossPool(C);
  const seen = new Set();
  for (let n = 1; n <= m.waveCount(); n++) seen.add(m.waveDef(n).groups.find((g) => C.enemies.get(g.enemy).boss).enemy);
  assert.equal(seen.size, Math.min(pool.length, m.waveCount()));
  assert.equal(m.cash, Math.round(C.modes.get('boss_rush').startCash * m.tune.startCash));
});

test('modifiers: health, armour, range, no abilities, reward multiplier', () => {
  const base = mk();
  const m = mk({ mode: 'challenge', modifiers: ['tough', 'ironhide', 'myopia', 'no_abilities'] });
  assert.ok(Math.abs(m.tune.enemyHp - base.tune.enemyHp * 1.2) < 1e-9);
  assert.equal(m.abilities.length, 0);
  const e = m.spawnEnemy('husk', { d: 5 });
  assert.ok(Math.abs(e.armor - 0.12) < 1e-9);
  m.command({ type: 'place', tower: 'rifleman', x: -4, z: -6 });
  m.step();
  base.command({ type: 'place', tower: 'rifleman', x: -4, z: -6 });
  base.step();
  assert.ok(Math.abs(m.effective(m.towers[0]).range - base.effective(base.towers[0]).range * 0.9) < 1e-9);
  assert.ok(m.result().rewardMul > base.result().rewardMul * 2);
});

test('sandbox: infinite cash, skip any time, no rewards; time attack: short waves, time score', () => {
  const sb = mk({ mode: 'sandbox' });
  const cash = sb.cash;
  sb.command({ type: 'place', tower: 'gunship', x: -4, z: -6 });
  sb.step();
  assert.equal(sb.cash, cash);
  assert.ok(sb.command({ type: 'skip' }).ok);
  sb.step();
  assert.ok(sb.command({ type: 'skip' }).ok, 'skip again mid-wave');
  const save = newSave(1);
  ensureStarters(save, C.meta);
  const r = applyMatchResult(save, { ...sb.result(), won: true, wave: 20 }, C, C.meta, '2026-11-05');
  assert.equal(r.crowns, 0);
  assert.equal(save.stats.wins, 0);
  const ta = mk({ mode: 'time_attack' });
  assert.equal(ta.maxDuration, C.modes.get('time_attack').maxDuration);
  assert.equal(ta.result().score, 0);
});

test('daily challenge: same for everyone on a date, reward once per day', () => {
  const a = dailyChallenge(C, '2026-11-05');
  assert.deepEqual(dailyChallenge(C, '2026-11-05'), a);
  assert.notDeepEqual(dailyChallenge(C, '2026-11-06').modifiers.concat(dailyChallenge(C, '2026-11-06').loadout), a.modifiers.concat(a.loadout));
  assert.equal(a.loadout.length, 6);
  const save = newSave(1);
  ensureStarters(save, C.meta);
  const res = (seed) => ({ seed, map: 'riftline', difficulty: 'normal', mode: 'daily', dailyDate: '2026-11-05', won: true, wave: 20, waves: 20, rewardMul: 1, stats: { kills: 1 } });
  assert.equal(applyMatchResult(save, res('d1'), C, C.meta, '2026-11-05').daily, true);
  assert.equal(applyMatchResult(save, res('d2'), C, C.meta, '2026-11-05').daily, false, 'second win the same day');
});

test('daily challenge: modifier budget, role slots and excluded modifiers hold on every date', () => {
  const mode = C.modes.get('daily');
  for (let i = 0; i < 60; i++) {
    const date = new Date(Date.UTC(2026, 10, 5 + i)).toISOString().slice(0, 10);
    const dc = dailyChallenge(C, date);
    const cost = dc.modifiers.reduce((s, id) => s + (C.modifiers.get(id).dailyCost ?? 1), 0);
    assert.ok(dc.modifiers.length >= 1 && cost <= mode.dailyBudget, `${date}: budget ${cost}`);
    assert.ok(dc.modifiers.every((id) => C.modifiers.get(id).inDaily !== false), `${date}: excluded modifier`);
    assert.equal(new Set(dc.loadout).size, 6);
    const defs = dc.loadout.map((id) => C.towers.get(id));
    assert.ok(defs.some((t) => t.stats.range >= 25 && t.stats.damage), `${date}: long-range boss killer`);
    assert.ok(defs.some((t) => t.stats.splash > 0), `${date}: splash`);
    assert.ok(defs.some((t) => t.stats.targets?.air), `${date}: anti-air`);
    assert.ok(Object.values(dc.levels).every((l) => l === mode.loanerLevel));
  }
});

test('balance smoke: boss rush and daily challenge are winnable; endless lasts beyond 20 waves', () => {
  const run = (mode, seed, extra = {}) => playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), difficulty: 'normal', seed, skill: 0.7, loadout: coreTowers(C), options: { mode, ...extra }, maxTicks: 60 * 60 * 45 });
  assert.ok(['b0', 'b1'].some((s) => run('boss_rush', s).won), 'boss rush');
  const dc = dailyChallenge(C, '2026-11-05');
  assert.ok(['d0', 'd1', 'd2'].some((s) => playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), difficulty: dc.difficulty, seed: s, skill: 0.7, loadout: dc.loadout, levels: dc.levels, options: { mode: 'daily', modifiers: dc.modifiers } }).won), 'daily on Easy');
  const e = run('endless', 'e0');
  assert.ok(e.wave > 20, `endless reached wave ${e.wave}`);
});
