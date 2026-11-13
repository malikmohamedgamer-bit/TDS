// Per-map difficulty factors (data/difficultyHp.json) scale enemy health for that map and
// difficulty only; everything else is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';

const C = await content();
const map = C.maps.get('riftline');
const hpOf = (difficulty) => {
  const m = new Match({ content: C, mapWorld: buildMapWorld(map, C.props), seed: 'dhp', difficulty });
  return m.spawnEnemy([...C.enemies.values()].find((e) => !e.boss && !e.summonOnly).id).maxHp;
};

test('difficultyHp: a per-map factor scales enemy health for that map and difficulty only', () => {
  const saved = C.difficultyHp;
  try {
    C.difficultyHp = {};
    const base = hpOf('hard');
    const normal = hpOf('normal');
    C.difficultyHp = { riftline: { hard: 0.8 }, frostmere: { hard: 2 } };
    assert.ok(Math.abs(hpOf('hard') - base * 0.8) < 1e-6);
    assert.equal(hpOf('normal'), normal, 'other difficulties unchanged');
  } finally {
    C.difficultyHp = saved;
  }
  for (const [id, row] of Object.entries(C.difficultyHp || {})) {
    assert.ok(C.maps.has(id), `known map ${id}`);
    for (const [d, f] of Object.entries(row)) assert.ok(C.difficulties.has(d) && f > 0 && f < 5, `${id}.${d} = ${f}`);
  }
});
