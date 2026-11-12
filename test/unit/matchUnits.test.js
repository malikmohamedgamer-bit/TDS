import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { Match } from '../../src/sim/match.js';
import { matchEnemyIds } from '../../src/sim/matchUnits.js';

const C = await content();
const mk = (map, options = {}) => new Match({ content: C, mapWorld: buildMapWorld(C.maps.get(map), C.props), seed: 'units', options });

test('match units: every wave enemy plus its spawn graph, far fewer than the whole roster', () => {
  const m = mk('gen_verdant_9');
  const ids = matchEnemyIds(m);
  for (let w = 1; w <= m.waveCount(); w++) for (const g of m.waveDef(w).groups) assert.ok(ids.has(g.enemy), g.enemy);
  // everything a listed enemy can bring is listed too (summons, splits, boss portals)
  for (const id of ids) {
    const refs = JSON.stringify(C.enemies.get(id)).match(/"[a-z0-9_]+"/g).map((x) => x.slice(1, -1)).filter((x) => C.enemies.has(x) && x !== id);
    for (const r of refs) assert.ok(ids.has(r), `${id} -> ${r}`);
  }
  assert.ok(ids.size < C.enemies.size / 3, `${ids.size} of ${C.enemies.size}`);
});

test('match units: boss rush lists its drawn bosses; endless covers its first waves; the sim is unchanged by the lookup', () => {
  const br = mk('riftline', { mode: 'boss_rush' });
  const ids = matchEnemyIds(br);
  for (let w = 1; w <= br.waveCount(); w++) for (const g of br.waveDef(w).groups) assert.ok(ids.has(g.enemy));
  const en = mk('riftline', { mode: 'endless' });
  const eids = matchEnemyIds(en, { endlessWaves: 30 });
  for (const g of en.waveDef(30).groups) assert.ok(eids.has(g.enemy));
  // looking ahead must not change what the match does
  const a = mk('riftline', { mode: 'endless' });
  const b = mk('riftline', { mode: 'endless' });
  matchEnemyIds(a);
  assert.deepEqual(a.waveDef(12), b.waveDef(12));
  for (let i = 0; i < 1200; i++) { a.step(); b.step(); }
  assert.equal(a.hash(), b.hash());
});
