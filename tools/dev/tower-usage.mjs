// node tools/dev/tower-usage.mjs <map> <seeds> <loadout ids,...>: which towers the balance bot builds,
// and how often in won vs lost runs (Standard Normal, skill 0.7, level 1). Balance investigation aid.
import { readFile } from 'node:fs/promises';
import { loadContent } from '../../src/core/content.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { playBot } from '../../src/sim/bot.js';

const [mapId = 'riftline', seeds = '12', ids = ''] = process.argv.slice(2);
const content = await loadContent(async (p) => JSON.parse(await readFile(`data/${p}`, 'utf8')));
const loadout = ids ? ids.split(',') : undefined;
const tally = { won: {}, lost: {} };
let wins = 0;
for (let s = 0; s < +seeds; s++) {
  const r = playBot({ content, mapWorld: buildMapWorld(content.maps.get(mapId), content.props), difficulty: 'normal', seed: `bal-${s}`, levels: undefined, loadout, strategy: 'smart', skill: 0.7, options: {} });
  const k = r.won ? 'won' : 'lost';
  if (r.won) wins++;
  for (const t of r.towers) { const n = t.replace(/\(.*$/, ''); tally[k][n] = (tally[k][n] || 0) + 1; }
  console.log(`seed ${s}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave} ${r.towers.join(' ')}`);
}
console.log(`${wins}/${seeds} won`);
for (const k of ['won', 'lost']) console.log(k, JSON.stringify(Object.entries(tally[k]).sort((a, b) => b[1] - a[1])));
