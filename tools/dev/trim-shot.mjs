// node tools/dev/trim-shot.mjs <outDir>: faction material trims in a real match (Riftline): GLB towers of both
// factions placed on open ground plus Blight enemies, three camera angles.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'docs/screenshots/identity/trim';
mkdirSync(out, { recursive: true });
const PORT = 5199;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/?quality=medium`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 90_000 });
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  const info = await page.evaluate(() => {
    const m = window.TDS.match;
    m.cash = 99999;
    m.loadout = [...m.content.towers.keys()];
    const glbTowers = [...m.content.towers.values()].filter((d) => d.model?.glb);
    const pick = (f) => glbTowers.filter((d) => d.faction === f).slice(0, 4).map((d) => d.id);
    const ids = [...pick('war'), ...pick('magic')];
    const hero = window.TDS.hero || { x: 0, z: 0 };
    const placed = [];
    let k = 0;
    for (let r = 4; r < 30 && placed.length < ids.length; r += 1.5) for (let a = 0; a < 12 && placed.length < ids.length; a++) {
      const x = hero.x + Math.cos(a * 0.52 + r) * r; const z = hero.z + Math.sin(a * 0.52 + r) * r;
      const res = m.command({ type: 'place', tower: ids[placed.length], x, z });
      if (res.ok) placed.push({ id: ids[placed.length], x, z }); k++;
    }
    ['mite', 'husk', 'skitter'].forEach((id, i) => { if (m.content.enemies.has(id)) m.spawnEnemy(id, { d: 6 + i * 3, hpMul: 50 }); });
    m.step();
    return { placed, tried: k };
  });
  console.log(JSON.stringify(info));
  if (info.placed.length) await page.evaluate(([x, z]) => window.TDS.teleport(x + 7, z + 7), [info.placed[0].x, info.placed[0].z]);
  for (const [i, [yaw, pitch, dist]] of [[0.8, 0.5, 20], [2.4, 0.35, 16], [4.0, 0.6, 26]].entries()) {
    await page.evaluate(([y, p, d]) => { window.TDS.setView(y, p); window.TDS.setDistance(d); }, [yaw, pitch, dist]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/trim-${i + 1}.png` });
  }
  console.log(`page errors: ${errors.length ? errors.slice(0, 5).join(' | ') : 'none'}`);
} finally { await browser.close(); server.kill(); }
