// npm run balance -- [--preset standard|original|relaxed|all] [--difficulty normal|all|a,b] [--loadout all|starters|a,b]
//   [--seeds 20] [--skill 0.7] [--strategy smart|lazy|weak] [--level 1] [--map id] [--hero id|all] [--verbose]
//   npm run balance -- --daily 10 [--from 2026-11-05] [--seeds 4] [--loaner 3] [--budget 3]   (Daily Challenge over N dates)
// Plays whole matches headlessly and prints win rates. "smart" with skill < 1 is a sensible but
// imperfect player; "lazy" uses 1-2 cheap tower types and never upgrades.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, validateContent } from '../src/core/content.js';
import { buildMapWorld } from '../src/core/mapLayout.js';
import { playBot, playCoopBot } from '../src/sim/bot.js';
import { dailyChallenge } from '../src/meta/meta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const content = await loadContent(async (p) => JSON.parse(await readFile(join(root, 'data', p), 'utf8')));
// --diffhp x: try a per-map difficulty factor (data/difficultyHp.json) for the --map / --difficulty given
if (opt('diffhp')) for (const m of opt('map', '').split(',')) for (const d of opt('difficulty', 'normal').split(',')) (content.difficultyHp[m] ||= {})[d] = Number(opt('diffhp'));
const errs = validateContent(content);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }

const list = (v, all) => (v === 'all' ? all : v.split(','));
const presets = list(opt('preset', content.tuning?.preset || 'standard'), Object.keys(content.tuning?.presets || { standard: 1 }));
const diffs = list(opt('difficulty', 'normal'), [...content.difficulties.keys()]);
const maps = list(opt('map', 'all'), [...content.maps.keys()]);
const seeds = Number(opt('seeds', 10));
const skill = Number(opt('skill', 0.7));
const strategy = opt('strategy', 'smart');
const level = Number(opt('level', 1));
const verbose = args.includes('--verbose');
const heroes = list(opt('hero', [...content.heroes.keys()][0]), [...content.heroes.keys()]);
const loadoutArg = opt('loadout', 'all');
const loadout = loadoutArg === 'all' ? undefined : loadoutArg === 'starters' ? content.meta.starterTowers : loadoutArg.split(',');
const levels = Object.fromEntries([...content.towers.keys()].map((id) => [id, level]));

if (args.includes('--coop')) {
  // co-op: one bot per player (docs/multiplayer.md); --coop 2|3|4, --map ids, --seeds n
  const n = Number(opt('coop', 2));
  // --coopcash X --coophp Y: try co-op numbers without editing data/modes.json
  const cm = content.modes.get('coop').coop;
  if (opt('coopcash')) cm.cashShare[n - 1] = Number(opt('coopcash'));
  if (opt('coophp')) cm.enemyHp[n - 1] = Number(opt('coophp'));
  const pool = loadoutArg === 'all' ? ['rifleman', 'marksman', 'gunner', 'rocket_battery', 'gunship', 'supply_depot', 'mine_layer', 'ember_adept', 'frost_weaver', 'storm_caller', 'rune_totem', 'spirit_summoner'] : loadout;
  let total = 0;
  let won = 0;
  for (const mapId of maps) {
    let w = 0;
    for (let s = 0; s < seeds; s++) {
      const r = playCoopBot({ content, mapWorld: buildMapWorld(content.maps.get(mapId), content.props), players: n, difficulty: diffs[0], seed: `coop-${n}-${s}`, pool, levels, skill, options: { preset: presets[0] } });
      if (r.won) w++;
      if (verbose) console.log(`  ${mapId} seed ${s}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave}/${r.waves} keep ${Math.round(r.baseHp)}`);
    }
    console.log(`${mapId.padEnd(18)} coop x${n} cash ${cm.cashShare[n - 1]} hp ${cm.enemyHp[n - 1]} ${diffs[0]}: ${w}/${seeds} won (${Math.round((w / seeds) * 100)}%)`);
    won += w;
    total += seeds;
  }
  console.log(`co-op x${n}: ${won}/${total} won (${Math.round((won / total) * 100)}%)`);
  process.exit(0);
}

if (args.includes('--daily')) {
  // Daily Challenge: each date fixes its own difficulty, modifiers, loaner loadout and levels.
  const days = Number(opt('daily', 10));
  const from = new Date(`${opt('from', '2026-11-05')}T00:00:00Z`);
  const mapId = opt('map', [...content.maps.keys()][0]);
  const dm = content.modes.get('daily');
  if (opt('loaner')) dm.loanerLevel = Number(opt('loaner'));
  if (opt('budget')) dm.dailyBudget = Number(opt('budget'));
  let wins = 0;
  let runs = 0;
  for (let i = 0; i < days; i++) {
    const date = new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10);
    const dc = dailyChallenge(content, date);
    const map = content.maps.get(dc.map || mapId);
    let w = 0;
    let waves = 0;
    for (let s = 0; s < seeds; s++) {
      const r = playBot({ content, mapWorld: buildMapWorld(map, content.props), difficulty: dc.difficulty, seed: `daily-${date}-${s}`, loadout: dc.loadout, levels: dc.levels, skill, options: { mode: 'daily', modifiers: dc.modifiers, preset: opt('preset', undefined) } });
      if (r.won) w++;
      waves += r.won ? r.waves : r.wave - 1;
      if (verbose) console.log(`  ${date} seed ${s}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave}/${r.waves} keep ${Math.round(r.baseHp)}`);
    }
    wins += w;
    runs += seeds;
    console.log(`${date} ${dc.difficulty} [${dc.modifiers.join(',') || 'no modifier'}] ${dc.loadout.join(',')}: ${w}/${seeds} won, avg waves ${(waves / seeds).toFixed(1)}`);
  }
  console.log(`Daily Challenge over ${days} dates: ${wins}/${runs} won (${Math.round((wins / runs) * 100)}%)`);
  process.exit(0);
}

const summary = [];
for (const mapId of maps) {
  const map = content.maps.get(mapId);
  for (const preset of presets) {
    for (const d of diffs) for (const hero of heroes) {
      let wins = 0;
      let waves = 0;
      let keep = 0;
      const t0 = performance.now();
      for (let s = 0; s < seeds; s++) {
        const r = playBot({ content, mapWorld: buildMapWorld(map, content.props), difficulty: d, seed: `bal-${s}`, levels, loadout, strategy, skill, hero, options: { preset, mode: opt('mode', undefined) } });
        if (r.won) { wins++; keep += r.baseHp; }
        waves += r.won ? r.waves : r.wave - 1;
        if (verbose) console.log(`  ${preset} ${d} seed ${s}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave}/${r.waves} keep ${Math.round(r.baseHp)} placed ${r.bot.placed} upg ${r.bot.upgrades}`);
      }
      const line = { map: mapId, preset, difficulty: d, hero, strategy, skill, level, seeds, wins, winRate: wins / seeds, avgWavesCleared: +(waves / seeds).toFixed(1), avgKeepOnWin: wins ? Math.round(keep / wins) : 0, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
      summary.push(line);
      console.log(`${mapId.padEnd(10)} ${preset.padEnd(9)} ${d.padEnd(10)} ${heroes.length > 1 ? `${hero.padEnd(17)} ` : ''}${strategy}/${skill} L${level}: ${wins}/${seeds} won (${Math.round(line.winRate * 100)}%), avg waves cleared ${line.avgWavesCleared}, keep on win ${line.avgKeepOnWin} [${line.seconds}s]`);
    }
  }
}
if (args.includes('--json')) console.log(JSON.stringify(summary));
