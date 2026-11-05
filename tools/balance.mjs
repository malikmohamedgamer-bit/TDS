// npm run balance -- [--preset standard|original|relaxed|all] [--difficulty normal|all|a,b]
//   [--seeds 20] [--skill 0.7] [--strategy smart|lazy|weak] [--level 1] [--map id] [--verbose]
// Plays whole matches headlessly and prints win rates. "smart" with skill < 1 is a sensible but
// imperfect player; "lazy" uses 1-2 cheap tower types and never upgrades.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, validateContent } from '../src/core/content.js';
import { buildMapWorld } from '../src/core/mapLayout.js';
import { playBot } from '../src/sim/bot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const content = await loadContent(async (p) => JSON.parse(await readFile(join(root, 'data', p), 'utf8')));
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
const levels = Object.fromEntries([...content.towers.keys()].map((id) => [id, level]));

const summary = [];
for (const mapId of maps) {
  const map = content.maps.get(mapId);
  for (const preset of presets) {
    for (const d of diffs) {
      let wins = 0;
      let waves = 0;
      let keep = 0;
      const t0 = performance.now();
      for (let s = 0; s < seeds; s++) {
        const r = playBot({ content, mapWorld: buildMapWorld(map, content.props), difficulty: d, seed: `bal-${s}`, levels, strategy, skill, options: { preset } });
        if (r.won) { wins++; keep += r.baseHp; }
        waves += r.won ? r.waves : r.wave - 1;
        if (verbose) console.log(`  ${preset} ${d} seed ${s}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave}/${r.waves} keep ${Math.round(r.baseHp)} placed ${r.bot.placed} upg ${r.bot.upgrades}`);
      }
      const line = { map: mapId, preset, difficulty: d, strategy, skill, level, seeds, wins, winRate: wins / seeds, avgWavesCleared: +(waves / seeds).toFixed(1), avgKeepOnWin: wins ? Math.round(keep / wins) : 0, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
      summary.push(line);
      console.log(`${mapId.padEnd(10)} ${preset.padEnd(9)} ${d.padEnd(10)} ${strategy}/${skill} L${level}: ${wins}/${seeds} won (${Math.round(line.winRate * 100)}%), avg waves cleared ${line.avgWavesCleared}, keep on win ${line.avgKeepOnWin} [${line.seconds}s]`);
    }
  }
}
if (args.includes('--json')) console.log(JSON.stringify(summary));
