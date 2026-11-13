import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { newSave, migrate, sanitize, exportSave, importSave } from '../../src/save/save.js';
import {
  levelForXp, addXp, unlockedSpeeds, ensureStarters, summon, dailyDeal, buyTower, buyBundle, levelUpTower,
  questStatus, claimQuest, applyMatchResult, dailyStatus, claimDaily, dailyQuestIds,
} from '../../src/meta/meta.js';

const C = await content();
const META = C.meta;
const fresh = () => { const s = newSave(1); ensureStarters(s, META); return s; };
const result = (o = {}) => ({ seed: 's1', map: 'riftline', difficulty: 'normal', won: true, wave: 20, waves: 20, assisted: false, rewardMul: 1,
  stats: { kills: 300, placed: 12, upgrades: 20, evolutions: 2, abilities: 5, bossesKilled: 2 }, seen: ['husk', 'gravemaw'], loadout: ['rifleman'], ...o });

test('starters: 5 towers and the starter wallet, granted once', () => {
  const s = fresh();
  assert.deepEqual(Object.keys(s.towers.owned).sort(), [...META.starterTowers].sort());
  const c = s.wallet.crowns;
  assert.equal(ensureStarters(s, META), false);
  assert.equal(s.wallet.crowns, c);
});

test('player XP, levels, level-up rewards once, speed unlocks', () => {
  const s = fresh();
  assert.deepEqual(levelForXp(META, 0), { level: 1, into: 0, need: META.player.xpBase });
  assert.deepEqual(unlockedSpeeds(s, META), [0.5, 1, 1.5]);
  const sig = s.wallet.sigils;
  const lv = addXp(s, META, 1000);
  assert.ok(s.profile.level >= 3, `level ${s.profile.level}`);
  assert.equal(lv.length, s.profile.level - 1);
  assert.ok(s.wallet.sigils > sig);
  assert.ok(unlockedSpeeds(s, META).includes(2), '2x unlocked at level 3');
  assert.ok(!unlockedSpeeds(s, META).includes(3));
  s.profile.level = 1; // even if the level drops (bad data), rewards are not granted twice
  const before = s.wallet.sigils;
  addXp(s, META, 0);
  assert.equal(s.wallet.sigils, before);
});

test('summons: deterministic, cost currency, duplicates pay crowns, pity guarantees epic', () => {
  const a = fresh();
  const b = fresh();
  a.wallet.sigils = b.wallet.sigils = 100000;
  const ra = summon(a, C, META, 'standard', 10);
  const rb = summon(b, C, META, 'standard', 10);
  assert.ok(ra.ok);
  assert.deepEqual(ra.results.map((r) => r.tower), rb.results.map((r) => r.tower));
  assert.equal(a.wallet.sigils, 100000 - META.summon.banners[0].cost10);
  let sawEpic = false;
  for (let i = 0; i < 4; i++) {
    const r = summon(a, C, META, 'standard', 10);
    for (const x of r.results) if (['epic', 'legendary'].includes(x.rarity)) sawEpic = true;
  }
  assert.ok(sawEpic, 'pity guarantees an epic within 30 pulls');
  assert.ok(a.summon.pity < META.summon.pity.pulls);
  const poor = fresh();
  poor.wallet.sigils = 0;
  assert.equal(summon(poor, C, META, 'standard', 1).ok, false);
  const dup = fresh();
  dup.wallet.sigils = 100000;
  for (const id of C.towers.keys()) dup.towers.owned[id] = { level: 1 };
  const c0 = dup.wallet.crowns;
  const r = summon(dup, C, META, 'standard', 1);
  assert.ok(r.results[0].duplicate);
  assert.ok(dup.wallet.crowns > c0);
});

test('shop: buy a tower once, daily deal is discounted and stable for a day, bundles', () => {
  const s = fresh();
  s.wallet.crowns = 100000;
  const deal = dailyDeal(s, C, META, '2026-11-05');
  assert.deepEqual(dailyDeal(s, C, META, '2026-11-05'), deal);
  assert.ok(deal.price < deal.full);
  const r = buyTower(s, C, META, deal.tower, '2026-11-05');
  assert.equal(r.price, deal.price);
  assert.equal(buyTower(s, C, META, deal.tower, '2026-11-05').ok, false);
  const sig = s.wallet.sigils;
  assert.ok(buyBundle(s, META, 'sigils_small').ok);
  assert.equal(s.wallet.sigils, sig + 100);
});

test('permanent tower levels cost crowns and evolve at 5, 10, 15', () => {
  const s = fresh();
  s.wallet.crowns = 1e6;
  const prog = C.progression.towerLevels;
  const evos = [];
  for (let i = 1; i < prog.maxLevel; i++) { const r = levelUpTower(s, prog, 'rifleman'); assert.ok(r.ok); if (r.evolved) evos.push(r.level); }
  assert.deepEqual(evos, [5, 10, 15]);
  assert.equal(levelUpTower(s, prog, 'rifleman').ok, false);
  assert.equal(levelUpTower(s, prog, 'gunship').ok, false, 'locked tower cannot level');
});

test('match results: rewards once per match, stats, records, quests, index; assisted runs count less', () => {
  const s = fresh();
  const c0 = s.wallet.crowns;
  const r1 = applyMatchResult(s, result(), C, META, '2026-11-05');
  assert.ok(r1.granted && r1.crowns > 0 && r1.firstClear);
  assert.equal(applyMatchResult(s, result(), C, META, '2026-11-05').granted, false);
  assert.equal(s.wallet.crowns, c0 + r1.crowns + r1.levels.reduce((n, l) => n + (l.reward.crowns || 0), 0));
  assert.equal(s.stats.wins, 1);
  assert.equal(s.progress.best.riftline.normal, 20);
  assert.ok(s.index.enemies.includes('gravemaw'));
  const qs = questStatus(s, C.quests, C, '2026-11-05');
  const story = qs.find((q) => q.id === 's_normal_win');
  assert.ok(story.done);
  assert.ok(claimQuest(s, C.quests, C, '2026-11-05', story.claimId).ok);
  assert.equal(claimQuest(s, C.quests, C, '2026-11-05', story.claimId).ok, false, 'claimed once');
  const a = fresh();
  applyMatchResult(a, result({ seed: 's2', assisted: true }), C, META, '2026-11-05');
  assert.equal(a.stats.wins, 0, 'assisted wins do not count');
  assert.deepEqual(a.progress.best, {});
});

test('match results: waves skipped with the Skip wave assist pay no crowns or XP', () => {
  const st = { ...result().stats };
  const played = applyMatchResult(fresh(), result({ seed: 'p', assisted: true }), C, META, '2026-11-05');
  // skipping every wave to a "win" pays exactly a loss with nothing cleared
  const farmed = applyMatchResult(fresh(), result({ seed: 'f', assisted: true, stats: { ...st, assistSkips: 20 } }), C, META, '2026-11-05');
  assert.equal(farmed.crowns, Math.round(META.matchRewards.lossCrowns));
  assert.equal(farmed.xp, 0);
  // five skipped waves cost five waves of pay and the win bonus
  const some = applyMatchResult(fresh(), result({ seed: 's', assisted: true, stats: { ...st, assistSkips: 5 } }), C, META, '2026-11-05');
  const mr = META.matchRewards;
  assert.equal(some.crowns, Math.round(mr.lossCrowns + 15 * mr.crownsPerWave));
  assert.ok(some.crowns < played.crowns && farmed.crowns < some.crowns);
});

test('daily quests rotate by date; daily login streak, once per day', () => {
  assert.deepEqual(dailyQuestIds(C.quests, '2026-11-05'), dailyQuestIds(C.quests, '2026-11-05'));
  assert.equal(dailyQuestIds(C.quests, '2026-11-05').length, 3);
  const s = fresh();
  assert.ok(claimDaily(s, META, '2026-11-05').ok);
  assert.equal(claimDaily(s, META, '2026-11-05').ok, false);
  assert.equal(claimDaily(s, META, '2026-11-06').day, 2);
  assert.equal(claimDaily(s, META, '2026-11-08').day, 1, 'streak resets after a missed day');
  assert.equal(dailyStatus(s, META, '2026-11-08').claimedToday, true);
});

test('save v2 migrates to v3 and meta state survives export/import', () => {
  const v2 = { schema: 2, wallet: { crowns: 5, sigils: 7 }, towers: { owned: { rifleman: { level: 3 } }, loadout: ['rifleman'] }, claimed: ['x'] };
  const s = sanitize(migrate(v2), C);
  assert.equal(s.schema, 3);
  assert.equal(s.towers.owned.rifleman.level, 3);
  assert.deepEqual(s.daily, { last: null, streak: 0 });
  const f = fresh();
  claimDaily(f, META, '2026-11-05');
  const back = importSave(exportSave(f), C);
  assert.equal(back.daily.last, '2026-11-05');
  assert.equal(claimDaily(back, META, '2026-11-05').ok, false);
});

test('faction banners: only that faction drops, pity counts per banner', async () => {
  const { bannerPity } = await import('../../src/meta/meta.js');
  const { sanitize } = await import('../../src/save/save.js');
  assert.ok(META.summon.banners.length >= 3);
  const s = newSave(7);
  s.wallet.sigils = 1e6;
  for (const id of ['war', 'magic']) {
    const r = summon(s, C, META, id, 10);
    assert.ok(r.ok && r.results.every((x) => C.towers.get(x.tower).faction === id), id);
  }
  assert.equal(bannerPity(s, META, 'standard'), 0, 'other banners leave the standard pity alone');
  // 40 pulls on one banner always contain an epic or better (pity 30)
  const t = newSave(8);
  t.wallet.sigils = 1e6;
  const all = [];
  for (let i = 0; i < 4; i++) all.push(...summon(t, C, META, 'war', 10).results);
  assert.ok(all.some((x) => ['epic', 'legendary'].includes(x.rarity)));
  assert.ok(bannerPity(t, META, 'war') < META.summon.pity.pulls);
  const back = sanitize(JSON.parse(JSON.stringify(t)), C);
  assert.equal(bannerPity(back, META, 'war'), bannerPity(t, META, 'war'), 'pity per banner survives a save round trip');
});
