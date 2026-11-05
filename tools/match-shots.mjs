// node tools/match-shots.mjs [outDir]: plays a scripted match headlessly and captures screenshots
// (lobby, build phase, combat, boss). Used for milestone reviews; software rendering only.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'docs/screenshots/m4';
mkdirSync(out, { recursive: true });
const PORT = 5196;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?quality=medium`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/01-lobby.png` });
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  const frames = async (n) => { const f0 = await page.evaluate(() => window.TDS.stats.fps); await page.waitForTimeout(400 * n); return f0; };
  // build a defence through the same commands the UI uses
  await page.evaluate(() => {
    const c = window.TDS.ctrl;
    window.TDS.debug.setCash(6000);
    const spots = [[-10, -12, 'rifleman'], [-10, 0, 'ember_adept'], [-24, -6, 'rocket_battery'], [0, -12, 'frost_weaver'], [-4, 6, 'storm_caller'], [-28, 4, 'marksman']];
    for (const [x, z, t] of spots) c.command({ type: 'place', tower: t, x, z });
  });
  await page.evaluate(() => { window.TDS.teleport(-6, -4); window.TDS.setView(Math.PI / 2 + 0.9, 0.5); window.TDS.setDistance(16); });
  await frames(6);
  await page.screenshot({ path: `${out}/02-build.png` });
  await page.evaluate(() => { const t = window.TDS.match.towers[0]; window.TDS.ctrl.select(t.uid); });
  await frames(3);
  await page.screenshot({ path: `${out}/03-tower-panel.png` });
  await page.evaluate(() => { window.TDS.ctrl.select(null); window.TDS.ctrl.command({ type: 'skip' }); window.TDS.debug.fastForward(14); });
  await frames(5);
  await page.screenshot({ path: `${out}/04-combat.png` });
  await page.evaluate(() => { window.TDS.debug.jumpToWave(10); window.TDS.debug.fastForward(30); window.TDS.teleport(-30, -10); window.TDS.setView(Math.PI / 2 + 0.2, 0.35); window.TDS.setDistance(20); });
  await frames(6);
  await page.screenshot({ path: `${out}/05-boss.png` });
  const state = await page.evaluate(() => { const m = window.TDS.match; return { wave: m.wave, phase: m.phase, enemies: m.enemies.length, towers: m.towers.length, cash: m.cash, kills: m.stats.kills, stats: window.TDS.stats }; });
  console.log(JSON.stringify(state));
} finally {
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
  server.kill();
}
