// npm run soak [-- --minutes 10]: walks the hero around every map and reports problems.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../src/core/content.js';
import { buildMapWorld } from '../src/core/mapLayout.js';
import { soakMap } from '../src/core/soak.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const minutes = Number(args[args.indexOf('--minutes') + 1]) || 10;
const content = await loadContent(async (p) => JSON.parse(await readFile(join(root, 'data', p), 'utf8')));

let failed = 0;
for (const map of content.maps.values()) {
  const t0 = performance.now();
  const r = soakMap(buildMapWorld(map, content.props), { seconds: minutes * 60 });
  const ms = performance.now() - t0;
  console.log(`${map.id}: ${minutes} simulated min in ${(ms / 1000).toFixed(1)} s | walked ${r.distance} m, ${r.targetsReached} targets, ${r.retargets} retargets, ${r.jumps} jumps, ${r.rescues} rescues, ${r.failures.length} failures`);
  for (const f of r.failures) console.log('  FAIL', JSON.stringify(f));
  for (const f of r.rescueLog) console.log('  rescue', JSON.stringify(f));
  if (r.failures.length) failed++;
}
process.exit(failed ? 1 : 0);
