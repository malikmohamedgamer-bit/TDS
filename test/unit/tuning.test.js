import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content, coreTowers } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { resolveTuning, tuningWarnings, KNOBS } from '../../src/sim/tuning.js';
import { playBot } from '../../src/sim/bot.js';

const C = await content();
const MAP = C.maps.get('riftline');
const mk = (options = {}, o = {}) => new Match({ content: C, mapWorld: buildMapWorld(MAP, C.props), seed: 't', options, ...o });

test('tuning.json: three presets, every knob present and inside its safe range', () => {
  assert.deepEqual(Object.keys(C.tuning.presets).sort(), ['original', 'relaxed', 'standard']);
  for (const [id, p] of Object.entries(C.tuning.presets)) for (const k of KNOBS) assert.equal(typeof p[k], 'number', `${id}.${k}`);
  assert.deepEqual(tuningWarnings(C.tuning), []);
  assert.ok(C.tuning.presets[C.tuning.preset], 'the default preset exists');
  assert.throws(() => resolveTuning(C.tuning, 'nope'), /Unknown tuning preset/);
});

test('knobs change the simulation: enemy HP, costs, start cash, keep HP', () => {
  const orig = mk({ preset: 'original' });
  const relaxed = mk({ preset: 'relaxed' });
  const r = C.tuning.presets.relaxed;
  const def = C.towers.get('marksman');
  assert.equal(orig.costOf(def), def.cost);
  assert.ok(relaxed.costOf(def) < def.cost);
  assert.ok(Math.abs(relaxed.enemyHpScale(1) - r.enemyHp) < 1e-9);
  assert.equal(relaxed.cash, Math.round(C.waves.get('riftline_campaign').startCash * r.startCash));
  assert.equal(relaxed.baseMax, Math.round(150 * r.keepHp));
  const std = mk({ preset: 'standard' });
  assert.ok(std.enemyHpScale(1) > orig.enemyHpScale(1), 'standard is harder than original');
});

test('assists: extra cash, slow enemies, hero boost, full refund, skip wave; runs are flagged', () => {
  const base = mk({ preset: 'standard' });
  const a = mk({ preset: 'standard', assist: { extraCash: true, slowEnemies: true, heroBoost: true, fullRefund: true, skipWave: true } });
  assert.equal(a.cash, base.cash + 400);
  assert.ok(a.tune.enemySpeed < base.tune.enemySpeed);
  assert.ok(a.tune.heroDamage > base.tune.heroDamage);
  a.command({ type: 'place', tower: 'rifleman', x: -4, z: -6 });
  a.step();
  const before = a.cash;
  a.command({ type: 'sell', uid: a.towers[0].uid });
  a.step();
  assert.equal(a.cash - before, a.costOf(C.towers.get('rifleman')), '100% refund');
  assert.equal(base.command({ type: 'assistSkip' }).ok, false);
  a.command({ type: 'skip' });
  a.step();
  assert.ok(a.command({ type: 'assistSkip' }).ok);
  a.step();
  assert.equal(a.wave, 2);
  assert.ok(a.enemies.every((e) => e.wave === 2), 'wave 1 enemies removed');
  const res = a.result();
  assert.equal(res.assisted, true);
  assert.equal(base.result().assisted, false);
});

test('balance: every preset stays winnable on its target difficulty; lazy play loses on Standard', () => {
  const run = (preset, difficulty, seed, strategy = 'smart') => playBot({ content: C, mapWorld: buildMapWorld(MAP, C.props), difficulty, seed, strategy, skill: 0.7, loadout: coreTowers(C), options: { preset } });
  for (const preset of Object.keys(C.tuning.presets)) {
    const wins = ['u0', 'u1', 'u2'].filter((s) => run(preset, 'normal', s).won).length;
    assert.ok(wins >= 1, `${preset}: imperfect bot won ${wins}/3 on Normal`);
  }
  for (const s of ['l0', 'l1']) assert.equal(run('standard', 'normal', s, 'lazy').won, false, 'lazy strategy must lose on Standard Normal');
});
