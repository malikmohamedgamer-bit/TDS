// node tools/content-shots.mjs [outDir]: milestone 7 review shots (Frostmere Crossing, legendary
// towers, Thornmother). Software rendering, headless.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'docs/screenshots/m7';
mkdirSync(out, { recursive: true });
const PORT = 5194;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const settle = (page, s = 1.5) => page.evaluate((s) => new Promise((r) => { const t0 = window.TDS.simTime; const i = setInterval(() => { if (window.TDS.simTime > t0 + s) { clearInterval(i); r(); } }, 50); }), s);
const shot = async (page, name, setup, s) => { await page.evaluate(setup); await settle(page, s); await page.screenshot({ path: `${out}/${name}.png` }); console.log(`saved ${name}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?quality=high&map=frostmere`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 90_000 });
  await page.evaluate(() => { window.TDS.save.profile.level = 3; window.TDS.ctrl.hub.render(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/01-hub-maps.png` });
  await page.getByTestId('mode-sandbox').check({ force: true });
  for (const id of ['titan_railgun', 'starfall_oracle']) await page.locator(`[data-tower="${id}"]`).click();
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  await page.evaluate(() => {
    document.querySelector('.controls-card')?.setAttribute('hidden', '');
    const c = window.TDS.ctrl;
    const m = window.TDS.match;
    const near = (id, x0, z0) => { for (let r = 0; r < 12; r += 1) for (let a = 0; a < 12; a++) { const x = x0 + Math.cos(a / 12 * 6.283) * r; const z = z0 + Math.sin(a / 12 * 6.283) * r; if (m.canPlace(id, x, z).ok) return c.command({ type: 'place', tower: id, x, z }); } return null; };
    near('titan_railgun', 14, -2);
    near('starfall_oracle', 12, 10);
    near('rifleman', 28, 7);
  });
  await shot(page, '02-frostmere-overview', () => { window.TDS.teleport(0, 0); window.TDS.setCamera('top'); });
  await shot(page, '03-frostmere-west', () => { window.TDS.setCamera('orbit'); window.TDS.teleport(-28, -1); window.TDS.setView(Math.PI / 2 + 0.25, 0.32); window.TDS.setDistance(18); });
  await shot(page, '04-legendaries', () => { const [a, b] = window.TDS.match.towers; const cx = (a.x + b.x) / 2; const cz = (a.z + b.z) / 2; window.TDS.teleport(cx + 7, cz + 5); window.TDS.setDistance(6); window.TDS.lookAt(cx, cz, 0.32); });
  await shot(page, '05-thornmother', () => {
    const m = window.TDS.match;
    const b = m.spawnEnemy('thornmother', { pathIdx: 0, d: 60 });
    b.baseSpeed = 0;
    const p = b.path.pointAt(60, {});
    window.TDS.teleport(p.x + 7, p.z - 6); window.TDS.setCamera('first'); window.TDS.lookAt(p.x, p.z, -0.05);
  }, 2);
  await page.evaluate(() => window.TDS.setCamera('orbit'));
  await shot(page, '06-combat-two-roads', () => { window.TDS.ctrl.command({ type: 'skip' }); window.TDS.debug.fastForward(16); window.TDS.teleport(10, 0); window.TDS.setView(Math.PI / 2 + 0.6, 0.55); window.TDS.setDistance(26); }, 2);
  console.log(JSON.stringify(await page.evaluate(() => window.TDS.stats)));
} finally {
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
  server.kill();
}
