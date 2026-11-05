// node tools/screenshots.mjs [outDir] [--quality high]
// Captures review shots of the map and hero from fixed viewpoints (software rendering, headless).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'docs/screenshots';
const quality = args.includes('--quality') ? args[args.indexOf('--quality') + 1] : 'high';
mkdirSync(out, { recursive: true });

const PORT = 5198;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const shots = [
  { name: 'hero-orbit', hero: [-4, -2], view: [Math.PI + 1.5708 + 0.6, 0.35], cam: 'orbit', dist: 8 },
  { name: 'hero-front', hero: [-4, -2], view: [1.5708 + 0.2, 0.15], cam: 'orbit', dist: 4.5 },
  { name: 'keep', hero: [34, -4], view: [-Math.PI / 2 + 0.35, 0.28], cam: 'orbit', dist: 14 },
  { name: 'portal', hero: [-40, -22], view: [Math.PI / 2 - 0.5, 0.25], cam: 'orbit', dist: 12 },
  { name: 'magic-grove', hero: [-40, 4], view: [Math.PI / 2 + 0.3, 0.3], cam: 'orbit', dist: 12 },
  { name: 'war-outpost', hero: [28, 10], view: [-Math.PI / 2 + 0.6, 0.3], cam: 'orbit', dist: 13 },
  { name: 'first-person', hero: [-20, 0], view: [Math.PI / 2, 0.05], cam: 'first' },
  { name: 'overview', hero: [0, 0], cam: 'top' },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${PORT}/?quality=${quality}`);
  await page.waitForFunction(() => window.TDS?.ready && window.TDS.stats.fps > 0, null, { timeout: 90_000 });
  await page.evaluate(() => { document.querySelector('.controls-card')?.setAttribute('hidden', ''); });
  for (const s of shots) {
    await page.evaluate((s) => {
      window.TDS.setCamera('orbit');
      window.TDS.teleport(s.hero[0], s.hero[1]);
      if (s.view) window.TDS.setView(s.view[0], s.view[1]);
      if (s.dist) window.TDS.setDistance?.(s.dist);
      window.TDS.setCamera(s.cam);
      if (s.view) window.TDS.setView(s.view[0], s.view[1]);
    }, s);
    // let the camera smoothing settle (sim time, not wall time)
    const t0 = await page.evaluate(() => window.TDS.simTime);
    await page.waitForFunction((t) => window.TDS.simTime > t + 1.5, t0, { timeout: 120_000 });
    await page.screenshot({ path: `${out}/${s.name}.png` });
    console.log(`saved ${out}/${s.name}.png`);
  }
  const stats = await page.evaluate(() => window.TDS.stats);
  console.log('stats', JSON.stringify(stats));
} finally {
  await browser.close();
  server.kill();
}
