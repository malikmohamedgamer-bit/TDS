// node tools/dev/boss-rush.mjs [seeds]: Boss Rush win rate with the 12 core towers (bot skill 0.7),
// and which bosses each run drew.
import { readFile } from 'node:fs/promises';
import { loadContent } from '../../src/core/content.js';
import { buildMapWorld } from '../../src/core/mapLayout.js';
import { playBot } from '../../src/sim/bot.js';

const seeds = Number(process.argv[2] || 12);
const content = await loadContent(async (p) => JSON.parse(await readFile(`data/${p}`, 'utf8')));
const CORE = ['rifleman', 'marksman', 'gunner', 'rocket_battery', 'gunship', 'supply_depot', 'mine_layer', 'ember_adept', 'frost_weaver', 'storm_caller', 'rune_totem', 'spirit_summoner'];
let wins = 0;
const seen = new Set();
for (let s = 0; s < seeds; s++) {
  const r = playBot({ content, mapWorld: buildMapWorld(content.maps.get('riftline'), content.props), difficulty: 'normal', seed: `br-${s}`, loadout: CORE, skill: 0.7, options: { mode: 'boss_rush' } });
  if (r.won) wins++;
  for (const b of r.match.bossRushOrder || []) seen.add(b);
  console.log(`seed ${s}: ${r.won ? 'WON ' : 'LOST'} wave ${r.wave} ${(r.match.bossRushOrder || []).join(',')}`);
}
console.log(`${wins}/${seeds} won; ${seen.size} different bosses appeared`);
