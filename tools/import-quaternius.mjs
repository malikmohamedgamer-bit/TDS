// node tools/import-quaternius.mjs: registers the curated Quaternius CC0 models in data/models.json
// (id "q_<name>", palette, scale to the docs/art-style.md height, clip mapping).
//
// The list lives in tools/quaternius-models.json. The GLBs in assets/models/quaternius/<pack>/ are
// made in Blender from the raw packs in assets/packs/quaternius-<pack>/ (links in docs/credits.md) by
// tools/blender/convert_quaternius.py (decimated to budget, glow faces marked). That step writes
// assets/packs/quaternius-convert.json (rest-pose size in Blender Z-up metres, triangles, clips),
// which this script reads for a first scale. --fit then opens viewer.html headlessly, measures each
// model's height in its idle pose in the engine and corrects the scale to the target (the Blender
// size is the T-pose rest pose). Re-run both after changing the list (README "Adding art").
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CFG = JSON.parse(readFileSync('tools/quaternius-models.json', 'utf8'));
const clipsOf = (c) => (typeof c === 'string' ? CFG.clipSets[c] : c);
// [pack, file, kind, palette, target height m, source file in the pack, extra]
const LIST = CFG.models.map((m) => [m.pack, m.file, m.kind, m.palette, m.height,
  m.keepWeapon ? `${m.src} (${m.keepWeapon} only)` : m.src,
  { clips: clipsOf(m.clips), motion: m.motion, yaw: m.yaw, basePlate: m.basePlate }]);
const PAGES = {
  'ultimate-monsters': 'quaternius.com/packs/ultimatemonsters.html',
  'animated-tanks': 'quaternius.com/packs/animatedtanks.html',
  'animated-mech': 'quaternius.com/packs/animatedmech.html',
  'toon-shooter-kit': 'quaternius.com/packs/toonshootergamekit.html',
  'animated-zombie': 'quaternius.com/packs/animatedzombie.html',
  'ultimate-fantasy-rts': 'quaternius.com/packs/ultimatefantasyrts.html',
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
    url, kind, palette, scale: +(target / height).toFixed(3), ...(extra.yaw ? { yaw: extra.yaw } : {}), ...(palette.startsWith('blight') ? { glow: false } : {}),
    ...(extra.basePlate ? { basePlate: extra.basePlate } : {}),
    ...(extra.clips ? { clips: extra.clips } : {}), ...(extra.motion ? { motion: extra.motion } : {}),
    source: `pack: Quaternius ${pack} (CC0, ${PAGES[pack]}), file ${src}, decimated to ${m.tris} triangles${m.glow_faces ? `, ${m.glow_faces} glow faces (eyes / accents)` : ''}`,
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
