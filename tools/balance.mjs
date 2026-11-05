// npm run balance [-- --difficulty normal --seeds 3]: bot plays every map on each difficulty.
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
const diffs = opt('difficulty', 'all') === 'all' ? [...content.difficulties.keys()] : opt('difficulty').split(',');
const seeds = Number(opt('seeds', 1));
const level = Number(opt('level', 1));
const weak = args.includes('--weak');
for (const map of content.maps.values()) {
  for (const d of diffs) {
    for (let s = 0; s < seeds; s++) {
      const t0 = performance.now();
      const levels = Object.fromEntries([...content.towers.keys()].map((id) => [id, level]));
      const r = playBot({ content, mapWorld: buildMapWorld(map, content.props), difficulty: d, seed: `bal${s}`, levels, weak });
      console.log(`${map.id} ${d.padEnd(10)} seed ${s} L${level}${weak ? ' weak' : ''}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave}/${r.waves} base ${r.baseHp} kills ${r.stats.kills} leaks ${r.stats.leaks} placed ${r.bot.placed} upg ${r.bot.upgrades} | ${(performance.now() - t0).toFixed(0)} ms`);
      if (args.includes('--verbose')) console.log('   ', r.towers.join(', '));
    }
  }
}
