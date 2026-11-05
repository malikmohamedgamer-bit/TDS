// node tools/import-quaternius.mjs: registers the curated Quaternius CC0 models in data/models.json
// (id "q_<name>", palette, scale to the docs/art-style.md height, clip mapping).
//
// The GLBs in assets/models/quaternius/<pack>/ are made in Blender from the raw packs in
// assets/packs/quaternius-<pack>/ (glTF / FBX; links in docs/credits.md) with
// tools/blender/convert_fbx.py, decimated to the art-style triangle budget. That step writes
// assets/packs/quaternius-convert.json (rest-pose size in Blender Z-up metres, triangles, clips),
// which this script reads for a first scale. --fit then opens viewer.html headlessly, measures each
// model's height in its idle pose in the engine and corrects the scale to the target (the Blender
// size is the T-pose rest pose). Re-run both after changing the list (README "Adding art").
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BIG = { idle: 'Idle', move: 'Walk', attack: 'Punch', death: 'Death' };
const BLOB = { idle: 'Idle', move: 'Walk', attack: 'Bite_Front', death: 'Death' };
const FLY = { idle: 'Flying_Idle', move: 'Fast_Flying', attack: 'Headbutt', death: 'Death' };
const SHOOTER = { idle: 'Idle', move: 'Walk', attack: 'Punch', death: 'Death' };
const MECH = { idle: 'Idle', move: 'Walk', attack: 'Punch', death: 'Death' };
// [pack, file (no .glb), kind, palette, target height m, source file in the pack, extra]
const LIST = [
  // enemies (Blight): normal size, 1,500-triangle budget
  ['ultimate-monsters', 'blob-orc', 'enemy', 'blight', 1.8, 'Blob/glTF/Orc.gltf', { clips: BLOB }],
  ['ultimate-monsters', 'blob-mushnub-evolved', 'enemy', 'blight', 1.6, 'Blob/glTF/Mushnub_Evolved.gltf', { clips: BLOB }],
  ['ultimate-monsters', 'blob-green-spiky-blob', 'enemy', 'blight', 1.5, 'Blob/glTF/GreenSpikyBlob.gltf', { clips: BLOB }],
  ['ultimate-monsters', 'blob-ninja', 'enemy', 'blight', 1.6, 'Blob/glTF/Ninja.gltf', { clips: BLOB }],
  ['ultimate-monsters', 'flying-ghost-skull', 'enemy', 'blight', 1.4, 'Flying/glTF/Ghost_Skull.gltf', { clips: FLY }],
  ['ultimate-monsters', 'flying-dragon', 'enemy', 'blight', 1.8, 'Flying/glTF/Dragon.gltf', { clips: FLY }],
  ['toon-shooter-kit', 'character-enemy', 'enemy', 'blight', 1.9, 'Characters/glTF/Character_Enemy.gltf (SMG only)', { clips: SHOOTER }],
  // bosses (scaled up further by the boss's size in data), 8,000-triangle budget
  ['ultimate-monsters', 'big-orc-skull', 'boss', 'blight', 5.5, 'Big/glTF/Orc_Skull.gltf', { clips: BIG }],
  ['ultimate-monsters', 'big-demon', 'boss', 'blight', 5.5, 'Big/glTF/Demon.gltf', { clips: BIG }],
  ['ultimate-monsters', 'big-mushroom-king', 'boss', 'blight', 5.5, 'Big/glTF/MushroomKing.gltf', { clips: BIG }],
  // tank: drive clips only; code motion supplies idle / attack / death
  ['animated-tanks', 'tank3', 'boss', 'blight', 4.0, 'FBX/Tank3.fbx', { clips: { move: 'Tank_Forward' }, motion: 'roll', yaw: Math.PI / 2 }],
  ['animated-mech', 'stan', 'boss', 'blight', 6.0, 'Flat Colors/glTF/Stan.gltf', { clips: MECH }],
  // towers (Modern War), 3,000-triangle budget; towers play idle and attack
  ['animated-mech', 'leela', 'tower', 'war', 3.2, 'Flat Colors/glTF/Leela.gltf', { clips: { idle: 'Idle', attack: 'Shoot' } }],
  ['toon-shooter-kit', 'character-soldier', 'tower', 'war', 2.0, 'Characters/glTF/Character_Soldier.gltf (AK only)', { clips: { idle: 'Idle', attack: 'Idle_Shoot' } }],
];
const PAGES = {
  'ultimate-monsters': 'quaternius.com/packs/ultimatemonsters.html',
  'animated-tanks': 'quaternius.com/packs/animatedtanks.html',
  'animated-mech': 'quaternius.com/packs/animatedmech.html',
  'toon-shooter-kit': 'quaternius.com/packs/toonshootergamekit.html',
};

const info = JSON.parse(readFileSync('assets/packs/quaternius-convert.json', 'utf8'));
const manifestPath = 'data/models.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let n = 0;
for (const [pack, file, kind, palette, target, src, extra] of LIST) {
  const rel = `${pack}/${file}.glb`;
  const url = `assets/models/quaternius/${rel}`;
  const m = info[rel];
  if (!existsSync(url) || !m || m.error) { console.log(`missing ${url} (convert it in Blender first)`); continue; }
  for (const c of Object.values(extra.clips || {})) if (!m.clips.includes(c)) throw new Error(`${file}: no clip ${c} (has ${m.clips.join(', ')})`);
  const height = m.size_zup[2];
  const id = `q_${file.replace(/-/g, '_')}`;
  manifest.models[id] = {
    url, kind, palette, scale: +(target / height).toFixed(3), ...(extra.yaw ? { yaw: +extra.yaw.toFixed(4) } : {}), ...(palette === 'blight' ? { glow: false } : {}),
    ...(extra.clips ? { clips: extra.clips } : {}), ...(extra.motion ? { motion: extra.motion } : {}),
    source: `pack: Quaternius ${pack} (CC0, ${PAGES[pack]}), file ${src}, decimated to ${m.tris} triangles`,
  };
  console.log(`${id.padEnd(26)} ${kind.padEnd(6)} h ${height.toFixed(2)} -> ${target} (x${manifest.models[id].scale}) tris ${m.tris} clips ${m.clips.length}`);
  n++;
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${n} Quaternius models registered in data/models.json`);

if (process.argv.includes('--fit')) {
  const { chromium } = await import('@playwright/test');
  const PORT = 5198;
  const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    await page.goto(`http://localhost:${PORT}/viewer.html?quality=low`);
    await page.waitForFunction(() => window.VIEWER?.ready, null, { timeout: 90_000 });
    for (const [, file, , , target] of LIST) {
      const id = `q_${file.replace(/-/g, '_')}`;
      if (!manifest.models[id]) continue;
      const { size } = await page.evaluate((a) => window.VIEWER.select(a), `glb:${id}`);
      const k = target / size[1];
      if (Math.abs(k - 1) > 0.02) manifest.models[id].scale = +(manifest.models[id].scale * k).toFixed(3);
      console.log(`fit ${id.padEnd(26)} engine h ${size[1].toFixed(2)} -> ${target} (scale ${manifest.models[id].scale})`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
