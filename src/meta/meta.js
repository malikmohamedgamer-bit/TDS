// Meta progression (pure, deterministic, no DOM): player XP / levels, speed unlocks, summoning,
// shop, permanent tower levels, quests, achievements and daily login rewards.
// Every reward goes through grantReward(), which records an id so it is granted exactly once.
import { Rng, hashString } from '../core/rng.js';
import { grantReward } from '../save/save.js';

const DIFF_ORDER = ['relaxed', 'easy', 'normal', 'medium', 'hard', 'extra_hard', 'extreme', 'impossible'];

// ------------------------------------------------------------------ player level ------------
export function xpToNext(meta, level) {
  return meta.player.xpBase + meta.player.xpPerLevel * (level - 1);
}

/** Level reached for a total XP amount. */
export function levelForXp(meta, xp) {
  let level = 1;
  let need = xpToNext(meta, 1);
  let left = xp;
  while (left >= need && level < meta.player.maxLevel) { left -= need; level++; need = xpToNext(meta, level); }
  return { level, into: left, need };
}

/** Add XP; grants each level-up reward once. Returns the list of new levels. */
export function addXp(save, meta, xp) {
  const before = save.profile.level;
  save.profile.xp += Math.max(0, Math.floor(xp));
  const { level } = levelForXp(meta, save.profile.xp);
  save.profile.level = level;
  const gained = [];
  for (let l = before + 1; l <= level; l++) {
    const r = { ...meta.player.levelReward };
    const extra = meta.player.milestones?.[String(l)];
    if (extra) for (const [k, v] of Object.entries(extra)) r[k] = (r[k] || 0) + v;
    if (grantReward(save, `level:${l}`, r)) gained.push({ level: l, reward: r });
  }
  return gained;
}

export function unlockedSpeeds(save, meta) {
  return meta.speeds.filter((s) => save.profile.level >= s.level).map((s) => s.speed);
}

// ------------------------------------------------------------------ ownership ---------------
export function ensureStarters(save, meta) {
  for (const id of meta.starterTowers) if (!save.towers.owned[id]) save.towers.owned[id] = { level: 1 };
  if (grantReward(save, 'starter-wallet', meta.starterWallet)) return true;
  return false;
}

export const owns = (save, id) => !!save.towers.owned[id];

// ------------------------------------------------------------------ summoning ---------------
function rarityPool(content, rarity, banner = null) {
  const f = banner?.pool?.faction;
  return [...content.towers.values()].filter((t) => t.rarity === rarity && (!f || t.faction === f)).map((t) => t.id).sort();
}

/** Pity counter of a banner: the first banner keeps save.summon.pity, the others count in pityBy. */
export function bannerPity(save, meta, bannerId) {
  return bannerId === meta.summon.banners[0].id ? save.summon.pity || 0 : save.summon.pityBy?.[bannerId] || 0;
}
function setPity(save, meta, bannerId, n) {
  if (bannerId === meta.summon.banners[0].id) save.summon.pity = n;
  else save.summon.pityBy = { ...(save.summon.pityBy || {}), [bannerId]: n };
}

/**
 * Pull `count` times on a banner. Deterministic from the save's summon seed and pull counter, so a
 * server can verify results later. Returns results [{tower, rarity, duplicate, crowns, pity}].
 */
export function summon(save, content, meta, bannerId, count = 1) {
  const banner = meta.summon.banners.find((b) => b.id === bannerId);
  if (!banner) throw new Error(`Unknown banner ${bannerId}`);
  const cost = count === 10 ? banner.cost10 : banner.cost * count;
  const cur = banner.currency;
  if ((save.wallet[cur] || 0) < cost) return { ok: false, reason: `Need ${cost - (save.wallet[cur] || 0)} more ${cur}` };
  save.wallet[cur] -= cost;
  if (!save.summon.seed) save.summon.seed = (hashString(`${save.createdAt}:${save.profile.name}`) || 1) >>> 0;
  const order = meta.rarityOrder;
  const weights = meta.summon.rarityWeights;
  const pityMin = order.indexOf(meta.summon.pity.minRarity);
  const results = [];
  for (let i = 0; i < count; i++) {
    const rng = new Rng((save.summon.seed ^ hashString(`pull:${save.summon.pulls}`)) >>> 0);
    save.summon.pulls++;
    setPity(save, meta, bannerId, bannerPity(save, meta, bannerId) + 1);
    let rarity = rng.weighted(Object.keys(weights), (r) => weights[r]);
    const forced = bannerPity(save, meta, bannerId) >= meta.summon.pity.pulls && order.indexOf(rarity) < pityMin;
    if (forced) rarity = meta.summon.pity.minRarity;
    // fall back to the nearest lower rarity that has towers
    let ri = order.indexOf(rarity);
    let pool = rarityPool(content, order[ri], banner);
    while (!pool.length && ri > 0) pool = rarityPool(content, order[--ri], banner);
    rarity = order[ri];
    if (ri >= pityMin) setPity(save, meta, bannerId, 0);
    const tower = pool[Math.floor(rng.next() * pool.length)];
    const duplicate = owns(save, tower);
    let crowns = 0;
    if (duplicate) {
      crowns = meta.summon.duplicateCrowns[rarity] || 0;
      save.wallet.crowns += crowns;
    } else save.towers.owned[tower] = { level: 1 };
    results.push({ tower, rarity, duplicate, crowns, forced });
  }
  save.stats.summons = (save.stats.summons || 0) + count;
  return { ok: true, cost, currency: cur, results };
}

// ------------------------------------------------------------------ shop --------------------
export function towerPrice(meta, def) {
  return meta.shop.towerPrices[def.rarity] ?? 99999;
}

/** Deterministic daily deal: one tower the player does not own yet, discounted. */
export function dailyDeal(save, content, meta, date) {
  const notOwned = [...content.towers.keys()].filter((id) => !owns(save, id)).sort();
  if (!notOwned.length) return null;
  const id = notOwned[hashString(`deal:${date}`) % notOwned.length];
  const def = content.towers.get(id);
  return { tower: id, price: Math.round(towerPrice(meta, def) * (1 - meta.shop.dailyDealDiscount) / 10) * 10, full: towerPrice(meta, def) };
}

export function buyTower(save, content, meta, id, date) {
  const def = content.towers.get(id);
  if (!def) return { ok: false, reason: 'Unknown tower' };
  if (owns(save, id)) return { ok: false, reason: 'Already owned' };
  const deal = dailyDeal(save, content, meta, date);
  const price = deal && deal.tower === id ? deal.price : towerPrice(meta, def);
  if (save.wallet.crowns < price) return { ok: false, reason: `Need ${price - save.wallet.crowns} more crowns` };
  save.wallet.crowns -= price;
  save.towers.owned[id] = { level: 1 };
  return { ok: true, price };
}

export function buyBundle(save, meta, bundleId) {
  const b = meta.shop.bundles.find((x) => x.id === bundleId);
  if (!b) return { ok: false, reason: 'Unknown item' };
  for (const [k, v] of Object.entries(b.price)) if ((save.wallet[k] || 0) < v) return { ok: false, reason: `Need ${v - (save.wallet[k] || 0)} more ${k}` };
  for (const [k, v] of Object.entries(b.price)) save.wallet[k] -= v;
  for (const [k, v] of Object.entries(b.gives)) save.wallet[k] = (save.wallet[k] || 0) + v;
  return { ok: true };
}

// ------------------------------------------------------------------ permanent tiers ---------
export function levelUpCost(prog, level) {
  return prog.costs?.[level] ?? null; // cost to go from `level` to level + 1
}

export function levelUpTower(save, prog, id) {
  const t = save.towers.owned[id];
  if (!t) return { ok: false, reason: 'Tower locked' };
  if (t.level >= prog.maxLevel) return { ok: false, reason: 'Max level' };
  const cost = levelUpCost(prog, t.level);
  if (save.wallet.crowns < cost) return { ok: false, reason: `Need ${cost - save.wallet.crowns} more crowns` };
  save.wallet.crowns -= cost;
  t.level++;
  const evo = prog.evolutions.find((e) => e.level === t.level);
  return { ok: true, level: t.level, cost, evolved: evo || null };
}

// ------------------------------------------------------------------ quests / achievements ---
export function dailyQuestIds(quests, date) {
  const ids = quests.daily.map((q) => q.id).sort();
  const rng = new Rng(`quests:${date}`);
  return rng.shuffle(ids).slice(0, 3);
}

/** Ensure today's quest board exists (resets daily progress at the date change). */
export function questBoard(save, quests, date) {
  if (!save.quests.daily || save.quests.daily.date !== date) save.quests.daily = { date, ids: dailyQuestIds(quests, date), progress: {} };
  save.quests.story ||= {};
  return save.quests.daily;
}

/** Progress of a story / achievement condition as {progress, target} (bars show partial progress). */
/** First clears recorded in save.claimed as `firstclear:<map>:<difficulty>:<mode>` (granted once each). */
function firstClears(save) {
  const maps = new Set();
  const modes = new Set();
  for (const id of save.claimed || []) {
    if (!id.startsWith('firstclear:')) continue;
    const [, map, , mode] = id.split(':');
    if (mode === 'campaign') maps.add(map);
    modes.add(mode);
  }
  return { maps, modes };
}

export function condProgress(q, save, content) {
  const s = save.stats;
  const owned = Object.keys(save.towers.owned);
  const seenEnemies = save.index?.enemies || [];
  if (q.stat) return { progress: Math.min(s[q.stat] || 0, q.target), target: q.target };
  if (q.summons) return { progress: Math.min(s.summons || 0, q.summons), target: q.summons };
  if (q.towerLevel) return { progress: Math.min(Math.max(0, ...Object.values(save.towers.owned).map((t) => t.level)), q.towerLevel), target: q.towerLevel };
  if (q.owned) return { progress: Math.min(owned.length, q.owned), target: q.owned };
  if (q.ownFaction) { const n = owned.filter((id) => content.towers.get(id)?.faction === q.ownFaction.faction).length; return { progress: Math.min(n, q.ownFaction.count), target: q.ownFaction.count }; }
  if (q.discovered) return { progress: Math.min(seenEnemies.filter((id) => !content.enemies.get(id)?.boss).length, q.discovered), target: q.discovered };
  if (q.discoveredBosses) return { progress: Math.min(seenEnemies.filter((id) => content.enemies.get(id)?.boss).length, q.discoveredBosses), target: q.discoveredBosses };
  if (q.mapsWon) return { progress: Math.min(firstClears(save).maps.size, q.mapsWon), target: q.mapsWon };
  const done = condDone(q, save, content);
  return { progress: done ? 1 : 0, target: 1 };
}

function condDone(q, save, content, prog = null) {
  const s = save.stats;
  if (q.stat) return (s[q.stat] || 0) >= q.target;
  if (q.ownFaction || q.discovered || q.discoveredBosses) { const p = condProgress(q, save, content); return p.progress >= p.target; }
  if (q.mapWon) return firstClears(save).maps.has(q.mapWon);
  if (q.modeWon) return firstClears(save).modes.has(q.modeWon);
  if (q.mapsWon) return firstClears(save).maps.size >= q.mapsWon;
  if (q.winDifficulty) return (save.progress.bestDifficultyWon ?? -1) >= DIFF_ORDER.indexOf(q.winDifficulty);
  if (q.summons) return (s.summons || 0) >= q.summons;
  if (q.towerLevel) return Object.values(save.towers.owned).some((t) => t.level >= q.towerLevel);
  if (q.owned) return Object.keys(save.towers.owned).length >= q.owned;
  if (q.ownRarity) return Object.keys(save.towers.owned).some((id) => content.towers.get(id)?.rarity === q.ownRarity);
  return false;
}

/** Status of every quest for the UI: {id, name, desc, progress, target, done, claimed, reward, kind}. */
export function questStatus(save, quests, content, date) {
  const board = questBoard(save, quests, date);
  const out = [];
  for (const id of board.ids) {
    const q = quests.daily.find((x) => x.id === id);
    if (!q) continue;
    const p = board.progress[id] || 0;
    out.push({ kind: 'daily', ...q, progress: Math.min(p, q.target), done: p >= q.target, claimed: save.claimed.includes(`quest:${date}:${id}`), claimId: `quest:${date}:${id}` });
  }
  for (const q of quests.story) {
    out.push({ kind: 'story', ...q, ...condProgress(q, save, content), done: condDone(q, save, content), claimed: save.claimed.includes(`story:${q.id}`), claimId: `story:${q.id}` });
  }
  for (const q of quests.achievements) {
    out.push({ kind: 'achievement', ...q, ...condProgress(q, save, content), done: condDone(q, save, content), claimed: save.claimed.includes(`ach:${q.id}`), claimId: `ach:${q.id}` });
  }
  return out;
}

export function claimQuest(save, quests, content, date, claimId) {
  const q = questStatus(save, quests, content, date).find((x) => x.claimId === claimId);
  if (!q) return { ok: false, reason: 'Unknown quest' };
  if (!q.done) return { ok: false, reason: 'Not finished yet' };
  if (!grantReward(save, claimId, q.reward)) return { ok: false, reason: 'Already claimed' };
  return { ok: true, reward: q.reward };
}

// ------------------------------------------------------------------ daily challenge --------
/**
 * Today's challenge (same for everyone): fixed difficulty, modifiers and a 6-tower loaner loadout
 * built from roles (area, anti-air, long range, two damage dealers, support) so every day is fair.
 */
export function dailyChallenge(content, date) {
  const mode = content.modes?.get('daily');
  const rng = new Rng(`daily:${date}`);
  // Modifiers: fill a difficulty budget (dailyCost points) so every date is about as hard.
  const budget = mode?.dailyBudget ?? 2;
  const mods = [];
  let spent = 0;
  const pool = [...content.modifiers.values()].filter((m) => m.inDaily !== false).map((m) => m.id).sort();
  for (const id of rng.shuffle(pool)) {
    const cost = content.modifiers.get(id).dailyCost ?? 1;
    if (spent + cost <= budget) { mods.push(id); spent += cost; }
    if (spent >= budget) break;
  }
  const order = content.meta?.rarityOrder || [];
  const maxR = mode?.loanerMaxRarity ? order.indexOf(mode.loanerMaxRarity) : Infinity;
  // generated batches stay out of the daily, so its measured balance does not shift
  const all = [...content.towers.values()].filter((t) => !(order.indexOf(t.rarity) > maxR) && !t.generated).sort((a, b) => (a.id < b.id ? -1 : 1));
  const loadout = [];
  const take = (pred) => {
    const pool = rng.shuffle(all.filter((t) => pred(t) && !loadout.includes(t.id)));
    if (pool.length) loadout.push(pool[0].id);
  };
  // Role slots keep every loadout complete: a long-range boss killer, splash, anti-air,
  // two sustained-damage picks (12+ DPS, so slow control towers never stack) and one support.
  take((t) => (t.stats.range || 0) >= 25 && t.stats.damage);
  take((t) => t.stats.splash > 0 && t.stats.damage);
  take((t) => t.stats.targets?.air && t.stats.damage);
  const dps = (t) => (t.stats.damage || 0) * (t.stats.rate || 0);
  take((t) => dps(t) >= 12);
  take((t) => dps(t) >= 12);
  take((t) => !t.stats.damage);
  const levels = Object.fromEntries(loadout.map((id) => [id, mode?.loanerLevel ?? 5]));
  return { date, difficulty: mode?.difficulty || 'easy', modifiers: mods, loadout, levels, rewardId: `dailychallenge:${date}`, reward: { sigils: 120, crowns: 300 } };
}

// ------------------------------------------------------------------ match results ----------
/**
 * Apply a finished match: stats, records, quest progress, index, rewards (once per match id).
 * Assisted runs: crowns and XP only (no records, quest or achievement progress).
 */
export function applyMatchResult(save, result, content, meta, date) {
  const mr = meta.matchRewards;
  const diff = content.difficulties.get(result.difficulty);
  const rewardMul = (diff?.metaRewardMul ?? 1) * (result.rewardMul ?? 1);
  const cleared = result.won ? result.wave : Math.max(0, result.wave - 1);
  const crowns = Math.round(((result.won ? mr.winCrowns : mr.lossCrowns) + cleared * mr.crownsPerWave) * rewardMul);
  const modeDef = content.modes?.get(result.mode || 'campaign');
  const sandbox = !!modeDef?.noRewards;
  const endlessCrowns = modeDef?.rewardPerWave ? cleared * modeDef.rewardPerWave * rewardMul : 0;
  const finalCrowns = sandbox ? 0 : crowns + Math.round(endlessCrowns);
  const xp = sandbox ? 0 : cleared * mr.xpPerWave + (result.won ? mr.winXp : 0);
  const granted = grantReward(save, `match:${result.seed}`, { crowns: finalCrowns });
  const out = { granted, crowns: granted ? finalCrowns : 0, xp: 0, levels: [], firstClear: false, sigils: 0, daily: false, sandbox };
  if (!granted) return out;
  out.levels = addXp(save, meta, xp);
  out.xp = xp;
  for (const id of result.seen || []) if (!save.index.enemies.includes(id)) save.index.enemies.push(id);
  for (const id of result.loadout || []) if (!save.index.towers.includes(id)) save.index.towers.push(id);
  const s = save.stats;
  s.matches++;
  if (result.assisted || sandbox) return out;
  if (result.mode === 'daily' && result.won && result.dailyDate) {
    const dc = dailyChallenge(content, result.dailyDate);
    if (grantReward(save, dc.rewardId, dc.reward)) { out.daily = true; out.sigils += dc.reward.sigils || 0; out.crowns += dc.reward.crowns || 0; }
  }
  if (modeDef?.score === 'time' && result.won) {
    const prev = save.progress.bestTime?.[result.map];
    save.progress.bestTime = { ...(save.progress.bestTime || {}), [result.map]: prev ? Math.min(prev, result.score) : result.score };
  }
  if (modeDef?.endless) {
    save.progress.bestEndless = { ...(save.progress.bestEndless || {}), [result.map]: Math.max(save.progress.bestEndless?.[result.map] || 0, cleared) };
  }
  const st = result.stats;
  const add = { kills: st.kills, placed: st.placed || 0, upgrades: st.upgrades || 0, evolutions: st.evolutions || 0, abilities: st.abilities || 0, bossKills: st.bossesKilled || 0, wavesCleared: cleared, wins: result.won ? 1 : 0 };
  for (const [k, v] of Object.entries(add)) s[k] = (s[k] || 0) + v;
  if (result.won) {
    save.progress.bestDifficultyWon = Math.max(save.progress.bestDifficultyWon ?? -1, DIFF_ORDER.indexOf(result.difficulty));
    if (grantReward(save, `firstclear:${result.map}:${result.difficulty}:${result.mode || 'campaign'}`, { sigils: mr.firstClearSigils })) { out.firstClear = true; out.sigils = mr.firstClearSigils; }
  }
  const best = (save.progress.best[result.map] ||= {});
  best[result.difficulty] = Math.max(best[result.difficulty] || 0, cleared);
  const board = questBoard(save, content.quests, date);
  for (const id of board.ids) {
    const q = content.quests.daily.find((x) => x.id === id);
    if (q?.stat) board.progress[id] = (board.progress[id] || 0) + (q.stat === 'matches' ? 1 : add[q.stat] || 0);
  }
  return out;
}

// ------------------------------------------------------------------ daily login ------------
export function dailyStatus(save, meta, date) {
  const d = save.daily || { last: null, streak: 0 };
  const claimedToday = d.last === date;
  const yesterday = new Date(`${date}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const y = yesterday.toISOString().slice(0, 10);
  const nextStreak = claimedToday ? d.streak : d.last === y ? d.streak + 1 : 1;
  const day = ((nextStreak - 1) % meta.daily.rewards.length) + 1;
  return { claimedToday, streak: d.streak, nextDay: day, reward: meta.daily.rewards[day - 1], rewards: meta.daily.rewards, nextStreak };
}

export function claimDaily(save, meta, date) {
  const st = dailyStatus(save, meta, date);
  if (st.claimedToday) return { ok: false, reason: 'Already claimed today' };
  if (!grantReward(save, `daily:${date}`, st.reward)) return { ok: false, reason: 'Already claimed today' };
  save.daily = { last: date, streak: st.nextStreak };
  return { ok: true, reward: st.reward, day: st.nextDay };
}

/** Local calendar date YYYY-MM-DD (the caller passes it so tests are deterministic). */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
