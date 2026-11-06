// node tools/dev/kit-match-shot.mjs <outDir>: kit bosses on the road in a real match (Riftline), two camera angles.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const START = Number(process.argv[3] || 1);
const out = process.argv[2] || 'docs/screenshots/identity/kit-b1';
mkdirSync(out, { recursive: true });
const PORT = 5198;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?quality=medium`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 90_000 });
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  const ids = await page.evaluate((start) => {
    const m = window.TDS.match;
    const ids = Array.from({ length: 8 }, (_, i) => 'boss_mech_' + String(start + i).padStart(2, '0'));
    ids.forEach((id, i) => m.spawnEnemy(id, { d: 8 + i * 5.5, hpMul: 50 }));
    m.step();
    const e = m.enemies[m.enemies.length - 5];
    window.TDS.teleport(e.x + 6, e.z + 6);
    return ids;
  }, START);
  for (const [i, [yaw, pitch, dist]] of [[0.8, 0.45, 18], [2.6, 0.3, 14]].entries()) {
    await page.evaluate(([y, p, d]) => { window.TDS.setView(y, p); window.TDS.setDistance(d); }, [yaw, pitch, dist]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/match-${i + 1}.png` });
  }
  console.log(`spawned ${ids.length} kit bosses; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
} finally { await browser.close(); server.kill(); }
