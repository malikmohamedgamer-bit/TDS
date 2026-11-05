// node tools/import-kenney.mjs: imports the curated Kenney CC0 models below from assets/packs/
// (downloaded with tools/fetch-kenney.mjs) into assets/models/kenney/<pack>/, measures each model
// and writes/updates its entry in data/models.json (id "k_<name>", palette, scale to the target
// height from docs/art-style.md, clips or code motion). Re-run after changing the list.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHAR_CLIPS = { idle: 'idle', move: 'walk', attack: 'attack-melee-right', death: 'die' };
// [pack, file, kind, palette, target height m, extra]
const LIST = [
  // towers (static; towers animate by code: aim / recoil)
  ['tower-defense-kit', 'weapon-ballista', 'tower', 'magic', 2.2],
  ['tower-defense-kit', 'weapon-cannon', 'tower', 'war', 2.0],
  ['tower-defense-kit', 'weapon-catapult', 'tower', 'war', 2.2],
  ['tower-defense-kit', 'weapon-turret', 'tower', 'war', 2.0],
  ['castle-kit', 'siege-ballista', 'tower', 'war', 2.4],
  ['castle-kit', 'siege-catapult', 'tower', 'magic', 2.4],
  ['castle-kit', 'siege-trebuchet', 'tower', 'war', 3.4],
  ['tower-defense-kit', 'tower-round-build-c', 'tower', 'magic', 3.4],
  ['tower-defense-kit', 'tower-square-build-c', 'tower', 'war', 3.4],
  // enemies: Blight-corrupted undead (animated) and scrap constructs / craft (code motion)
  ['graveyard-kit', 'character-zombie', 'enemy', 'blight', 1.7, { clips: CHAR_CLIPS }],
  ['graveyard-kit', 'character-skeleton', 'enemy', 'blight', 1.7, { clips: CHAR_CLIPS }],
  ['graveyard-kit', 'character-ghost', 'enemy', 'blight', 1.6, { clips: CHAR_CLIPS }],
  ['graveyard-kit', 'character-vampire', 'enemy', 'blight', 1.8, { clips: CHAR_CLIPS }],
  ['graveyard-kit', 'character-keeper', 'enemy', 'blight', 1.8, { clips: CHAR_CLIPS }],
  ['tower-defense-kit', 'enemy-ufo-a', 'enemy', 'blight', 1.0, { motion: 'hover' }],
  ['tower-defense-kit', 'enemy-ufo-b', 'enemy', 'blight', 1.0, { motion: 'hover' }],
  ['tower-defense-kit', 'enemy-ufo-c', 'enemy', 'blight', 1.0, { motion: 'hover' }],
  ['tower-defense-kit', 'enemy-ufo-d', 'enemy', 'blight', 1.0, { motion: 'hover' }],
  ['car-kit', 'truck', 'boss', 'blight', 4.5, { motion: 'roll' }],
  ['car-kit', 'tractor-shovel', 'boss', 'blight', 4.5, { motion: 'roll' }],
  ['car-kit', 'garbage-truck', 'boss', 'blight', 5.0, { motion: 'roll' }],
  // bosses (scaled up further by the enemy's size in data); the trucks are over the enemy triangle budget
  ['castle-kit', 'siege-tower', 'boss', 'blight', 6.5, { motion: 'roll' }],
  ['castle-kit', 'siege-ram', 'boss', 'blight', 4.5, { motion: 'roll' }],
];

/** Height of a GLB from accessor bounds and node translation / scale (rotations ignored). */
function measure(file) {
  const buf = readFileSync(file);
  const len = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  let lo = Infinity;
  let hi = -Infinity;
  const visit = (ni, ty, sy) => {
    const n = j.nodes[ni];
    const y = ty + (n.translation?.[1] || 0) * sy;
    const s = sy * (n.scale?.[1] || 1);
    if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION];
      lo = Math.min(lo, y + a.min[1] * s);
      hi = Math.max(hi, y + a.max[1] * s);
    }
    for (const c of n.children || []) visit(c, y, s);
  };
  for (const r of j.scenes[j.scene || 0].nodes) visit(r, 0, 1);
  return { height: hi - lo, tris: (j.meshes || []).reduce((t, m) => t + m.primitives.reduce((u, p) => u + j.accessors[p.indices].count / 3, 0), 0), clips: (j.animations || []).map((a) => a.name) };
}

const manifestPath = 'data/models.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let n = 0;
for (const [pack, file, kind, palette, target, extra = {}] of LIST) {
  const srcDir = join('assets/packs', `kenney-${pack}`, 'Models', 'GLB format');
  const src = join(srcDir, `${file}.glb`);
  if (!existsSync(src)) { console.log(`missing ${src} (run tools/fetch-kenney.mjs ${pack})`); continue; }
  const dstDir = join('assets/models/kenney', pack);
  mkdirSync(join(dstDir, 'Textures'), { recursive: true });
  copyFileSync(src, join(dstDir, `${file}.glb`));
  for (const t of readdirSync(join(srcDir, 'Textures'))) copyFileSync(join(srcDir, 'Textures', t), join(dstDir, 'Textures', t));
  const m = measure(src);
  if (extra.clips) for (const c of Object.values(extra.clips)) if (!m.clips.includes(c)) throw new Error(`${file}: no clip ${c}`);
  const id = `k_${file.replace(/-/g, '_')}`;
  manifest.models[id] = {
    url: `assets/models/kenney/${pack}/${file}.glb`, kind, palette, scale: +(target / m.height).toFixed(3),
    ...(extra.clips ? { clips: extra.clips } : {}), ...(extra.motion ? { motion: extra.motion } : {}),
    source: `pack: Kenney ${pack} (CC0, kenney.nl/assets/${pack}), file ${file}.glb`,
  };
  console.log(`${id.padEnd(26)} ${kind.padEnd(6)} h ${m.height.toFixed(2)} -> ${target} (x${manifest.models[id].scale}) tris ${m.tris}${m.clips.length ? ` clips ${m.clips.length}` : ''}`);
  n++;
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${n} models imported into assets/models/kenney and data/models.json`);
