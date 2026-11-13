// New-player pacing (ROADMAP chunk 3), from the real meta functions: a player who wins 70% of
// 20-wave matches (losses clear about 11 waves), Easy for 5 matches then Normal, cycling through the
// maps they have unlocked. Prints the match number at which each milestone is reached. Seeded.
//   node tools/pacing.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = `${join(dirname(fileURLToPath(import.meta.url)), '..')}/`;
const imp = (p) => import(pathToFileURL(root + p));
const { loadContent } = await imp('src/core/content.js');
const { newSave } = await imp('src/save/save.js');
const meta = await imp('src/meta/meta.js');
const { Rng } = await imp('src/core/rng.js');
const C = await loadContent(async (p) => JSON.parse(readFileSync(root + 'data/' + p, 'utf8')));
const M = C.meta;
const save = newSave(1); meta.ensureStarters(save, M);
const rng = new Rng('pacing');
const maps = [...C.maps.values()].sort((a, b) => (a.unlockLevel || 1) - (b.unlockLevel || 1));
const marks = {}; const mark = (k, n) => { if (!(k in marks)) marks[k] = n; };
let crownsEarned = 0;
for (let n = 1; n <= 300; n++) {
  const lvl = meta.levelForXp(M, save.profile.xp).level;
  const open = maps.filter((m) => (m.unlockLevel || 1) <= lvl);
  const map = open[(n - 1) % open.length];
  const difficulty = n <= 5 ? 'easy' : 'normal';
  const won = rng.next() < 0.7;
  const before = save.wallet.crowns;
  meta.applyMatchResult(save, { seed: `p${n}`, map: map.id, difficulty, won, wave: won ? 20 : 11, waves: 20, assisted: false, rewardMul: 1, stats: { kills: 200, placed: 10, upgrades: 12, evolutions: 0, abilities: 4, bossesKilled: won ? 2 : 0 }, seen: [], loadout: [] }, C, M, '2026-11-14');
  crownsEarned += save.wallet.crowns - before;
  if (won) mark('first win', n);
  const L = meta.levelForXp(M, save.profile.xp).level;
  for (const t of [5, 10, 20, 30, 42]) if (L >= t) mark(`level ${t}`, n);
  if (crownsEarned >= 460) mark('crowns for a first evolution (one tower to level 5: 460)', n);
  if (crownsEarned >= 2200) mark('crowns for a rare tower in the shop (2200)', n);
  if (open.length >= 10) mark('10 maps open', n);
  if (open.length >= C.maps.size) mark(`all ${C.maps.size} maps open`, n);
}
console.log(JSON.stringify({ startSigils: M.starterWallet.sigils, summonCost: M.summon.banners[0].cost, matches: marks }, null, 1));
