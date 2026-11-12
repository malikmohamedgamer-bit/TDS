// Player progress save: versioned schema, migrations, export/import with checksum, automatic
// backup, and safe loading (falls back to the backup, then to a fresh save). Pure apart from the
// injected storage, so Node tests and a future server can use the same code.

export const SAVE_SCHEMA = 3;
export const SAVE_KEY = 'tds.save';
export const BACKUP_KEY = 'tds.save.backup';
export const MAX_TOWER_LEVEL = 10;

export function newSave(now = 0) {
  return {
    schema: SAVE_SCHEMA,
    createdAt: now,
    updatedAt: now,
    profile: { name: 'Commander', xp: 0, level: 1 },
    wallet: { crowns: 0, sigils: 0 },
    towers: { owned: {}, loadout: [] }, // starter towers are granted from data/meta.json at boot
    heroes: { owned: ['commander_vale'], selected: 'commander_vale' },
    progress: { best: {}, unlockedMaps: ['riftline'], tutorialDone: false, bestDifficultyWon: -1 },
    stats: { matches: 0, wins: 0, kills: 0, wavesCleared: 0, placed: 0, upgrades: 0, evolutions: 0, abilities: 0, bossKills: 0, summons: 0 },
    daily: { last: null, streak: 0 },
    claimed: [],
    quests: {},
    achievements: {},
    index: { towers: [], enemies: [] },
    summon: { pity: 0, pulls: 0, seed: 0 },
  };
}

/**
 * Migrations: each takes a save at version N and returns version N+1.
 * v1 was the prototype format: {version: 1, gold, towers: {id: level}, loadout}.
 */
export const MIGRATIONS = {
  1: (s) => {
    const out = newSave(s.createdAt || 0);
    out.wallet.crowns = Math.max(0, Math.floor(s.gold || 0));
    out.towers.owned = {};
    for (const [id, lv] of Object.entries(s.towers || {})) out.towers.owned[id] = { level: lv | 0 || 1 };
    out.towers.loadout = Array.isArray(s.loadout) ? s.loadout.slice(0, 6) : [];
    out.claimed = Array.isArray(s.claimed) ? s.claimed : [];
    return out;
  },
  // v2 -> v3: meta progression fields (daily login, more stats, summon seed); keeps everything else
  2: (s) => ({ ...s, daily: s.daily || { last: null, streak: 0 }, summon: { seed: 0, ...(s.summon || {}) } }),
};

export function migrate(raw) {
  let s = raw;
  let v = s.schema ?? s.version ?? 1;
  if (v > SAVE_SCHEMA) throw new Error(`Save is from a newer version (${v})`);
  while (v < SAVE_SCHEMA) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from save version ${v}`);
    s = m(s);
    v++;
    s.schema = v;
  }
  return s;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Clamp / repair a migrated save so the game never trusts malformed values. */
export function sanitize(s, content) {
  const base = newSave(s.createdAt || 0);
  const out = { ...base, ...s };
  out.schema = SAVE_SCHEMA;
  out.profile = { ...base.profile, ...(isObj(s.profile) ? s.profile : {}) };
  out.profile.xp = nonNeg(out.profile.xp);
  out.profile.level = Math.max(1, nonNeg(out.profile.level));
  out.profile.name = String(out.profile.name || 'Commander').slice(0, 24);
  out.wallet = { crowns: nonNeg(s.wallet?.crowns), sigils: nonNeg(s.wallet?.sigils) };
  const owned = {};
  for (const [id, v] of Object.entries(isObj(s.towers?.owned) ? s.towers.owned : {})) {
    if (content && !content.towers.has(id)) continue;
    owned[id] = { level: Math.min(MAX_TOWER_LEVEL, Math.max(1, (v?.level | 0) || 1)) };
  }
  out.towers = { owned, loadout: (Array.isArray(s.towers?.loadout) ? s.towers.loadout : []).filter((id) => owned[id]).slice(0, 6) };
  out.claimed = [...new Set((Array.isArray(s.claimed) ? s.claimed : []).map(String))];
  out.stats = { ...base.stats, ...(isObj(s.stats) ? s.stats : {}) };
  for (const k of Object.keys(out.stats)) out.stats[k] = nonNeg(out.stats[k]);
  out.progress = { ...base.progress, ...(isObj(s.progress) ? s.progress : {}) };
  // records: {map: {difficulty: waves}} and {map: number}; anything else is dropped
  const numMap = (v) => Object.fromEntries(Object.entries(isObj(v) ? v : {}).filter(([, n]) => Number.isFinite(n) && n >= 0));
  out.progress.best = Object.fromEntries(Object.entries(isObj(out.progress.best) ? out.progress.best : {}).filter(([, v]) => isObj(v)).map(([k, v]) => [k, numMap(v)]));
  for (const k of ['bestTime', 'bestEndless']) if (out.progress[k] !== undefined) out.progress[k] = numMap(out.progress[k]);
  out.progress.tutorialDone = !!out.progress.tutorialDone;
  out.heroes = { ...base.heroes, ...(isObj(s.heroes) ? s.heroes : {}) };
  out.summon = { pity: nonNeg(s.summon?.pity), pulls: nonNeg(s.summon?.pulls), seed: nonNeg(s.summon?.seed) };
  if (isObj(s.summon?.pityBy)) out.summon.pityBy = Object.fromEntries(Object.entries(s.summon.pityBy).map(([k, v]) => [k, nonNeg(v)]));
  out.daily = { last: typeof s.daily?.last === 'string' ? s.daily.last : null, streak: nonNeg(s.daily?.streak) };
  out.progress.bestDifficultyWon = Number.isFinite(out.progress.bestDifficultyWon) ? out.progress.bestDifficultyWon : -1;
  out.quests = isObj(s.quests) ? { ...s.quests } : {};
  const dq = out.quests.daily;
  if (!isObj(dq) || typeof dq.date !== 'string' || !Array.isArray(dq.ids) || !isObj(dq.progress)) delete out.quests.daily;
  else out.quests.daily = { date: dq.date, ids: dq.ids.map(String), progress: numMap(dq.progress) };
  if (out.quests.story !== undefined && !isObj(out.quests.story)) delete out.quests.story;
  const wq = out.quests.weekly;
  if (!isObj(wq) || typeof wq.week !== 'string' || !Array.isArray(wq.ids) || !isObj(wq.progress)) delete out.quests.weekly;
  else out.quests.weekly = { week: wq.week, ids: wq.ids.map(String), progress: numMap(wq.progress) };
  out.achievements = isObj(s.achievements) ? s.achievements : {};
  out.cosmetics = Object.fromEntries(Object.entries(isObj(s.cosmetics) ? s.cosmetics : {}).filter(([, v]) => typeof v === 'string'));
  const strList = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string'))];
  out.index = { towers: strList(s.index?.towers), enemies: strList(s.index?.enemies) };
  return out;
}

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const b64encode = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : globalThis.Buffer.from(s, 'utf8').toString('base64'));
const b64decode = (s) => (typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : globalThis.Buffer.from(s, 'base64').toString('utf8'));

/** Export as a copy-pasteable string: "TDS1.<base64 json>.<checksum>". */
export function exportSave(save) {
  const json = JSON.stringify(save);
  return `TDS1.${b64encode(json)}.${fnv(json)}`;
}

export function importSave(text, content) {
  const parts = String(text).trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'TDS1') throw new Error('Not a TDS save code');
  let json;
  try { json = b64decode(parts[1]); } catch { throw new Error('Save code is damaged'); }
  if (fnv(json) !== parts[2]) throw new Error('Save code checksum does not match (damaged or edited)');
  let raw;
  try { raw = JSON.parse(json); } catch { throw new Error('Save code is damaged'); }
  return sanitize(migrate(raw), content);
}

/** Load with fallback: main -> backup -> fresh. Returns {save, source, error}. */
export function loadSave(storage, content, now = 0) {
  for (const [key, source] of [[SAVE_KEY, 'main'], [BACKUP_KEY, 'backup']]) {
    const raw = storage.get(key);
    if (!raw) continue;
    try {
      return { save: sanitize(migrate(JSON.parse(raw)), content), source };
    } catch (err) {
      if (source === 'backup') return { save: newSave(now), source: 'fresh', error: String(err.message || err) };
    }
  }
  return { save: newSave(now), source: 'fresh' };
}

/** Write the save; the previous good save becomes the backup. */
export function writeSave(storage, save, now = 0) {
  save.updatedAt = now;
  const prev = storage.get(SAVE_KEY);
  if (prev) {
    try { JSON.parse(prev); storage.set(BACKUP_KEY, prev); } catch { /* keep the old backup */ }
  }
  return storage.set(SAVE_KEY, JSON.stringify(save));
}

/**
 * Grant a reward exactly once. reward: {crowns, sigils, xp, towers: [ids], ...}.
 * Returns true if granted now, false if it had already been claimed.
 */
export function grantReward(save, rewardId, reward) {
  if (save.claimed.includes(rewardId)) return false;
  save.claimed.push(rewardId);
  if (reward.crowns) save.wallet.crowns += Math.max(0, Math.floor(reward.crowns));
  if (reward.sigils) save.wallet.sigils += Math.max(0, Math.floor(reward.sigils));
  if (reward.xp) save.profile.xp += Math.max(0, Math.floor(reward.xp));
  for (const id of reward.towers || []) if (!save.towers.owned[id]) save.towers.owned[id] = { level: 1 };
  return true;
}
