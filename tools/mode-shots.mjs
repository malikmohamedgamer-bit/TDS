// node tools/mode-shots.mjs [outDir]: milestone 6 review shots (Play tab modes, Daily Challenge,
// tutorial glow, Endless and Sandbox HUDs). Software rendering, headless.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'docs/screenshots/m6';
mkdirSync(out, { recursive: true });
const PORT = 5195;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const settle = (page, s = 1.2) => page.evaluate((s) => new Promise((r) => { const t0 = window.TDS.simTime; const i = setInterval(() => { if (window.TDS.simTime > t0 + s) { clearInterval(i); r(); } }, 50); }), s);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?quality=medium`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 90_000 });
  await page.evaluate(() => { window.TDS.save.profile.level = 4; window.TDS.ctrl.hub.render(); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/01-play-modes.png` });
  await page.getByTestId('mode-daily').check({ force: true });
  await page.getByTestId('daily-challenge').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-daily.png` });
  await page.getByTestId('mode-challenge').check({ force: true });
  await page.locator('[name="mod"][value="tough"]').check();
  await page.locator('[name="mod"][value="swift"]').check();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/03-challenge.png` });
  // tutorial: campaign, glow on the hotbar then on Next wave
  await page.getByTestId('mode-campaign').check({ force: true });
  await page.locator('[name="tutorial"]').check();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  await page.evaluate(() => { document.querySelector('.controls-card')?.setAttribute('hidden', ''); window.TDS.teleport(-6, -4); });
  await settle(page, 0.5);
  await page.evaluate(() => { window.TDS.setView(Math.PI / 2 + 0.9, 0.5); window.TDS.setDistance(16); Object.assign(window.TDS.ctrl.tutorialStats, { heroMoved: 10, cameraTurned: 1 }); });
  await page.waitForFunction(() => document.querySelector('[data-testid="tutorial"]').dataset.step === 'pick', null, { timeout: 60_000 });
  await settle(page);
  await page.screenshot({ path: `${out}/04-tutorial-pick.png` });
  await page.evaluate(() => window.TDS.ctrl.command({ type: 'place', tower: window.TDS.match.loadout[0], x: -10, z: -12 }));
  await page.waitForFunction(() => document.querySelector('[data-testid="tutorial"]').dataset.step === 'wave', null, { timeout: 60_000 });
  await settle(page);
  await page.screenshot({ path: `${out}/05-tutorial-wave.png` });
  // endless at wave 30 (boss)
  await page.evaluate(() => { window.TDS.ctrl.tutorial.finish(true); window.TDS.ctrl.toLobby(); });
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 30_000 });
  await page.getByTestId('mode-endless').check({ force: true });
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match?.mode.id === 'endless' && window.TDS.ctrl.view, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const c = window.TDS.ctrl;
    window.TDS.debug.setCash(20000);
    for (const [x, z, t] of [[-10, -12, 'rifleman'], [-10, 0, 'ember_adept'], [0, -12, 'frost_weaver'], [-28, 4, 'marksman'], [-24, -6, 'gunner']]) c.command({ type: 'place', tower: t, x, z });
    window.TDS.debug.jumpToWave(30); window.TDS.debug.fastForward(25);
    window.TDS.teleport(-30, -10); window.TDS.setView(Math.PI / 2 + 0.2, 0.35); window.TDS.setDistance(20);
  });
  await settle(page, 2);
  await page.screenshot({ path: `${out}/06-endless-wave30.png` });
  const state = await page.evaluate(() => { const m = window.TDS.match; return { mode: m.mode.id, wave: m.wave, phase: m.phase, enemies: m.enemies.filter((e) => e.alive).length, stats: window.TDS.stats }; });
  console.log(JSON.stringify(state));
} finally {
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
  server.kill();
}
