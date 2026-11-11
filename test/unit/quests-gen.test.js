// Generated quests and achievements (tools/gen-quests.mjs): counts, unique ids, every condition is
// trackable, progress bars report partial progress, daily quests count every stat they use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { newSave } from '../../src/save/save.js';
import { questStatus, condProgress, applyMatchResult, localDate } from '../../src/meta/meta.js';

const C = await content();
const Q = C.quests;

test('quest pool: 80+ achievements, 20+ daily quests, unique ids, known conditions only', () => {
  assert.ok(Q.achievements.length >= 80, `achievements ${Q.achievements.length}`);
  assert.ok(Q.daily.length >= 20, `daily ${Q.daily.length}`);
  const ids = [...Q.daily, ...Q.story, ...Q.achievements].map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  const KNOWN = ['stat', 'winDifficulty', 'summons', 'towerLevel', 'owned', 'ownRarity', 'ownFaction', 'discovered', 'discoveredBosses', 'mapWon', 'modeWon', 'mapsWon'];
  assert.ok(Q.daily.length + Q.story.length >= 80, `quests ${Q.daily.length + Q.story.length}`);
  for (const q of Q.story) { if (q.mapWon) assert.ok(C.maps.has(q.mapWon), q.id); if (q.modeWon) assert.ok(C.modes.has(q.modeWon), q.id); }
  assert.equal(Q.story.filter((q) => q.mapWon).length, C.maps.size, 'one liberation quest per map');
  for (const q of [...Q.story, ...Q.achievements]) assert.ok(KNOWN.some((k) => q[k] !== undefined), q.id);
  const stats = Object.keys(newSave().stats);
  for (const q of [...Q.daily, ...Q.achievements]) if (q.stat) assert.ok(stats.includes(q.stat), `${q.id} uses a saved stat`);
  for (const q of Q.achievements) assert.ok(q.reward && Object.values(q.reward).every((v) => v > 0), q.id);
});

test('progress bars show partial progress for every condition kind', () => {
  const save = newSave();
  save.stats.kills = 130;
  save.towers.owned = { rifleman: { level: 4 }, ember_adept: { level: 1 }, frost_weaver: { level: 2 } };
  save.index.enemies = [...C.enemies.values()].filter((e) => !e.boss).slice(0, 3).map((e) => e.id).concat(['gravemaw']);
  const get = (id) => condProgress(Q.achievements.find((q) => q.id === id), save, C);
  assert.deepEqual(get('a_kills_250'), { progress: 130, target: 250 });
  assert.deepEqual(get('a_level_8'), { progress: 4, target: 8 });
  assert.deepEqual(get('a_own_12'), { progress: 3, target: 12 });
  assert.deepEqual(get('a_magic_5'), { progress: 2, target: 5 });
  assert.deepEqual(get('a_discover_5'), { progress: 3, target: 5 });
  assert.deepEqual(get('a_bosses_1'), { progress: 1, target: 1 });
  const st = questStatus(save, Q, C, '2026-11-06');
  assert.ok(st.find((q) => q.id === 'a_bosses_1').done);
  assert.ok(st.every((q) => q.progress <= q.target && q.target >= 1));
});

test('every daily quest stat moves when a match is played (matches counts too)', () => {
  const save = newSave();
  const date = localDate();
  const res = { won: true, lost: false, wave: 20, waves: 20, difficulty: 'normal', map: 'riftline', mode: 'campaign', stats: { kills: 300, placed: 30, upgrades: 25, evolutions: 2, abilities: 15, bossesKilled: 2 }, rewardMul: 1, assisted: false, seen: [], loadout: [], modifiers: [], preset: 'default', assists: [] };
  // try every daily quest by forcing it onto today's board
  for (const q of Q.daily) {
    save.quests = { daily: { date, ids: [q.id], progress: {} } };
    applyMatchResult(save, { ...res, seed: `q-${q.id}` }, C, C.meta, date);
    const st = questStatus(save, Q, C, date).find((x) => x.id === q.id);
    assert.ok(st && st.progress > 0, `${q.id} (${q.stat}) counts`);
  }
});

test('map and mode quests: a Campaign win liberates the map, another mode win counts for its mode only', () => {
  const save = newSave();
  const st = (id) => questStatus(save, Q, C, '2026-11-11').find((q) => q.id === id);
  assert.equal(st('s_map_riftline').done, false);
  const res = (mode, seed) => ({ seed, map: 'riftline', difficulty: 'easy', mode, won: true, wave: 20, waves: 20, stats: { kills: 10 }, seen: [], loadout: [] });
  applyMatchResult(save, res('skirmish', 'q1'), C, C.meta, '2026-11-11');
  assert.equal(st('s_map_riftline').done, false, 'a Skirmish win does not liberate the map');
  assert.equal(st('s_mode_skirmish').done, true);
  applyMatchResult(save, res('campaign', 'q2'), C, C.meta, '2026-11-11');
  assert.equal(st('s_map_riftline').done, true);
  assert.equal(st('s_mode_mutation').done, false);
  assert.deepEqual(condProgress(Q.achievements.find((q) => q.id === 'a_maps_5'), save, C), { progress: 1, target: 5 });
});
