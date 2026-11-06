// node tools/gen-quests.mjs [--check]: writes data/quests/generated_b1.json (tiered achievements, extra
// daily quests and collection goals) on top of the hand-written data/quests.json. Deterministic; never
// edit the output by hand. Honest counting (docs/COMPLETION.md): most entries are TIERS of the same
// condition; the file's $doc lists how many distinct conditions there are.
import { readFileSync, writeFileSync } from 'node:fs';

const fmt = (n) => n.toLocaleString('en-US');
// stat, tiers, names, description, base reward per tier (sigils grow with the tier)
const STAT_TIERS = [
  ['kills', [100, 250, 500, 2500, 5000, 25000, 50000, 100000], ['First blood', 'Thinning the horde', 'Pest exterminator', 'Rift warden', 'Blight breaker', 'Plague ender', 'Valley saviour', 'Hundred-thousand'], (n) => `Defeat ${fmt(n)} enemies in total`],
  ['bossKills', [1, 3, 10, 25, 50, 100], ['Giant felled', 'Titan tamer', 'Boss breaker', 'Warlord bane', 'Colossus collector', 'Hundred crowns'], (n) => `Defeat ${fmt(n)} boss${n > 1 ? 'es' : ''}`],
  ['wins', [1, 3, 25, 50, 100, 250], ['Victor', 'Hat trick', 'Commander', 'General', 'Marshal', 'Living legend'], (n) => `Win ${fmt(n)} match${n > 1 ? 'es' : ''}`],
  ['matches', [1, 10, 50, 100, 250], ['Reporting for duty', 'Regular', 'Old hand', 'Lifer', 'Valley veteran'], (n) => `Play ${fmt(n)} match${n > 1 ? 'es' : ''}`],
  ['wavesCleared', [50, 200, 500, 1000, 2500, 5000], ['Wave rider', 'Breakwater', 'Seawall', 'Tide turner', 'Storm breaker', 'Endless shore'], (n) => `Clear ${fmt(n)} waves`],
  ['placed', [25, 100, 500, 1000, 2500], ['Foundations', 'Architect', 'Fortress builder', 'City of towers', 'Monument maker'], (n) => `Place ${fmt(n)} towers`],
  ['upgrades', [25, 100, 500, 1000, 2500], ['Tinkerer', 'Mechanic', 'Master engineer', 'Arcane smith', 'Upgrade obsessed'], (n) => `Buy ${fmt(n)} tower upgrades`],
  ['abilities', [10, 50, 200, 500, 1000], ['On call', 'Strike leader', 'Spell slinger', 'Force of nature', 'Thousand orders'], (n) => `Use hero abilities ${fmt(n)} times`],
  ['evolutions', [1, 25, 50, 100], ['First evolution', 'Evolution theory', 'Natural selection', 'Apex'], (n) => `Evolve ${fmt(n)} tower${n > 1 ? 's' : ''} in matches`],
  ['summons', [1, 25, 50, 100, 250], ['Pull the lever', 'Regular at the reels', 'High roller', 'Jackpot chaser', 'House always wins'], (n) => `Summon ${fmt(n)} time${n > 1 ? 's' : ''}`],
];
const DIFFS = [['medium', 'Steady hand'], ['extra_hard', 'Iron will'], ['extreme', 'Beyond extreme']];
const LEVELS = [[3, 'Seasoned crew'], [8, 'Elite squad'], [10, 'Decorated unit'], [12, 'Hall of heroes']];
const OWNED = [[3, 'Starter kit'], [12, 'Armoury'], [16, 'Arsenal II'], [20, 'Warehouse'], [25, 'Collector'], [30, 'Curator'], [37, 'Complete arsenal']];
const FACTION = [['war', 5, 'Boots on the ground'], ['war', 12, 'Combined arms'], ['war', 20, 'Grand army'], ['magic', 5, 'Circle of mages'], ['magic', 10, 'Arcane order'], ['magic', 16, 'High council']];
const RARITY = [['rare', 'Rare find'], ['epic', 'Epic haul']];
const DISCOVER = [[5, 'Field notes'], [15, 'Monster manual'], [25, 'Bestiary'], [35, 'Naturalist'], [42, 'Know thy enemy']];
const DISCOVER_BOSS = [[1, 'Big trouble'], [5, 'Boss spotter'], [15, 'Titan watcher'], [30, 'Warlord registry'], [50, 'Every crown']];

const reward = (tier, of, base = 60) => ({ sigils: Math.round((base * (1 + tier * 1.4)) / 10) * 10, ...(tier >= of - 2 ? { crowns: 500 * (tier + 1) } : {}) });

const hand = JSON.parse(readFileSync(new URL('../data/quests.json', import.meta.url), 'utf8'));
const taken = new Set([...hand.daily, ...hand.story, ...hand.achievements].map((q) => q.id));
const achievements = [];
const add = (q) => { if (!taken.has(q.id)) { taken.add(q.id); achievements.push(q); } };
for (const [stat, tiers, names, desc] of STAT_TIERS) {
  tiers.forEach((n, i) => {
    // skip tiers the hand-written file already covers (same stat and target)
    if (hand.achievements.some((q) => q.stat === stat && q.target === n)) return;
    add({ id: `a_${stat}_${n}`, name: names[i], desc: desc(n), stat, target: n, reward: reward(i, tiers.length) });
  });
}
DIFFS.forEach(([d, name], i) => add({ id: `a_win_${d}`, name, desc: `Win on ${d.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} or harder`, winDifficulty: d, reward: reward(i + 2, 5, 100) }));
LEVELS.forEach(([n, name], i) => add({ id: `a_level_${n}`, name, desc: `Raise a tower to permanent level ${n}`, towerLevel: n, reward: reward(i, LEVELS.length) }));
OWNED.forEach(([n, name], i) => add({ id: `a_own_${n}`, name, desc: `Own ${n} towers`, owned: n, reward: reward(i, OWNED.length) }));
FACTION.forEach(([f, n, name], i) => add({ id: `a_${f}_${n}`, name, desc: `Own ${n} ${f === 'war' ? 'Modern War' : 'Magic'} towers`, ownFaction: { faction: f, count: n }, reward: reward(i % 3, 3) }));
RARITY.forEach(([r, name], i) => add({ id: `a_rarity_${r}`, name, desc: `Own ${r === 'epic' ? 'an' : 'a'} ${r} tower`, ownRarity: r, reward: reward(i, 2) }));
DISCOVER.forEach(([n, name], i) => add({ id: `a_discover_${n}`, name, desc: `Discover ${n} kinds of Blight (Index)`, discovered: n, reward: reward(i, DISCOVER.length) }));
DISCOVER_BOSS.forEach(([n, name], i) => add({ id: `a_bosses_${n}`, name, desc: `Discover ${n} boss${n > 1 ? 'es' : ''} (Index)`, discoveredBosses: n, reward: reward(i, DISCOVER_BOSS.length, 80) }));

// extra daily quests (three a day are drawn from the whole pool)
const DAILY = [
  ['kills', [80, 300], 'Defeat {n} enemies'], ['wavesCleared', [8, 25], 'Clear {n} waves'], ['placed', [8, 25], 'Place {n} towers'],
  ['upgrades', [6, 20], 'Buy {n} tower upgrades'], ['abilities', [3, 12], 'Use abilities {n} times'], ['wins', [2], 'Win {n} matches'],
  ['bossKills', [2], 'Defeat {n} bosses'], ['evolutions', [2], 'Evolve {n} towers in matches'], ['matches', [2, 4], 'Play {n} matches'],
];
const DAILY_NAMES = ['Morning patrol', 'Double shift', 'Night watch', 'Overtime', 'Quick drill', 'Field exercise', 'Supply run', 'Long day', 'Twice victorious', 'Big game', 'Rapid growth', 'Show up', 'Full roster', 'Busy hands', 'Tune-up'];
const daily = [];
let dn = 0;
for (const [stat, ns, text] of DAILY) for (const n of ns) {
  const id = `d_${stat}_${n}`;
  if (taken.has(id) || hand.daily.some((q) => q.stat === stat && q.target === n)) continue;
  taken.add(id);
  daily.push({ id, name: DAILY_NAMES[dn++ % DAILY_NAMES.length], desc: text.replace('{n}', fmt(n)), stat, target: n, reward: { sigils: 20 + 5 * Math.min(4, Math.round(n / 10)), crowns: 60 + 20 * Math.min(5, Math.round(n / 20)) } });
}

const kinds = new Set(achievements.map((q) => q.stat || Object.keys(q).find((k) => ['winDifficulty', 'towerLevel', 'owned', 'ownFaction', 'ownRarity', 'discovered', 'discoveredBosses', 'summons'].includes(k))));
const out = {
  $doc: `GENERATED by tools/gen-quests.mjs (do not edit by hand). Tiers of ${kinds.size} distinct achievement conditions (${[...kinds].join(', ')}) plus extra daily quests; hand-written quests stay in data/quests.json.`,
  daily,
  story: [],
  achievements,
};
const json = `${JSON.stringify(out, null, 1)}\n`;
const path = new URL('../data/quests/generated_b1.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== json) { console.error('data/quests/generated_b1.json is out of date'); process.exit(1); }
  console.log('generated_b1.json up to date');
} else {
  writeFileSync(path, json);
  console.log(`wrote ${achievements.length} achievements (${kinds.size} distinct conditions), ${daily.length} daily quests`);
  console.log(`totals with data/quests.json: achievements ${achievements.length + hand.achievements.length}, daily ${daily.length + hand.daily.length}, story ${hand.story.length}`);
}
