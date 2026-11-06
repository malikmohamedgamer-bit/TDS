// node tools/batch-shots.mjs [outDir] [--map id]: in-match check of content batch quaternius_b1
// (+ the Lancer Mech) in a real sandbox match: places the new towers, spawns every new enemy and a new
// boss on the road, takes screenshots, fast-forwards combat and reports damage, kills and page
// errors. Software rendering, headless.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'docs/screenshots/batch-q1';
const mapId = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'starfall_sanctum';
mkdirSync(out, { recursive: true });
const read = (p) => JSON.parse(readFileSync(`data/${p}`, 'utf8'));
const towers = ['lancer_mech', ...read('towers/quaternius_b1.json').towers.map((t) => t.id)];
const enemies = read('enemies/quaternius_b1.json').enemies.map((e) => e.id);
const bosses = read('bosses/quaternius_b1.json').enemies.map((e) => e.id);

const PORT = 5193;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const settle = (page, s = 1.5) => page.evaluate((s) => new Promise((r) => { const t0 = window.TDS.simTime; const i = setInterval(() => { if (window.TDS.simTime > t0 + s) { clearInterval(i); r(); } }, 50); }), s);
const shot = async (page, name, setup, s) => { await page.evaluate(setup); await settle(page, s); await page.screenshot({ path: `${out}/${name}.png` }); console.log(`saved ${name}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180_000); // software rendering under load is slow
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?quality=high&map=${mapId}`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 90_000 });
  await page.evaluate(() => { window.TDS.save.profile.level = 50; window.TDS.ctrl.hub.render(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/01-hub-play.png` });
  await page.getByTestId('mode-sandbox').check({ force: true });
  // the loadout holds 6 towers: start empty, then add the new ones
  await page.evaluate(() => { window.TDS.ctrl.hub.cfg.loadout = []; window.TDS.ctrl.hub.render(); });
  for (const id of towers) await page.locator(`[data-tower="${id}"]`).click();
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  const placed = await page.evaluate((ids) => {
    document.querySelector('.controls-card')?.setAttribute('hidden', '');
    const c = window.TDS.ctrl;
    const m = window.TDS.match;
    const p0 = m.paths[0].pointAt(m.paths[0].length * 0.55, {});
    const res = [];
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      let ok = null;
      for (let r = 6; r < 18 && !ok; r += 1) {
        const x = p0.x + Math.cos(a) * r;
        const z = p0.z + Math.sin(a) * r;
        if (m.canPlace(id, x, z).ok) ok = c.command({ type: 'place', tower: id, x, z });
      }
      res.push(`${id}:${ok?.ok ? 'placed' : `NOT placed (${m.loadout.includes(id) ? m.canPlace(id, p0.x + 8, p0.z + 8).reason : 'not in loadout'})`}`);
    });
    window.__p0 = p0;
    return res;
  }, towers);
  console.log(placed.join(' '));
  await shot(page, '02-new-towers', () => { const p = window.__p0; window.TDS.teleport(p.x + 9, p.z + 9); window.TDS.setCamera('orbit'); window.TDS.setDistance(16); window.TDS.lookAt(p.x, p.z, 0.45); });
  await page.evaluate((ids) => { window.__enemies = ids; }, enemies);
  // every new enemy frozen in a row on the road
  await shot(page, '03-new-enemies', () => {
    const m = window.TDS.match;
    const ids = window.__enemies;
    ids.forEach((id, i) => { const e = m.spawnEnemy(id, { pathIdx: 0, d: 20 + i * 5 }); e.baseSpeed = 0; });
    const p = m.paths[0].pointAt(20 + ids.length * 2.5, {});
    window.TDS.teleport(p.x + 6, p.z + 6); window.TDS.setDistance(14); window.TDS.lookAt(p.x, p.z, 0.3);
  }, 2);
  await page.evaluate((ids) => { window.__bosses = ids; }, bosses);
  await shot(page, '04-new-boss', () => {
    const m = window.TDS.match;
    const b = m.spawnEnemy(window.__bosses[0], { pathIdx: 0, d: 70 });
    b.baseSpeed = 0;
    const p = b.path.pointAt(70, {});
    window.TDS.teleport(p.x + 9, p.z - 7); window.TDS.setDistance(16); window.TDS.lookAt(p.x, p.z, 0.2);
  }, 2);
  const stats = await page.evaluate(() => {
    const m = window.TDS.match;
    for (const e of m.enemies) e.baseSpeed = e.def.speed;
    window.TDS.debug.fastForward(40);
    return { towers: m.towers.map((t) => `${t.defId}:${Math.round(t.damage)}`), kills: m.stats.kills, damage: Math.round(m.stats.damage), alive: m.enemies.filter((e) => e.alive).map((e) => e.defId) };
  });
  console.log(JSON.stringify(stats));
  await shot(page, '05-combat', () => { const p = window.__p0; window.TDS.teleport(p.x + 4, p.z + 12); window.TDS.setDistance(24); window.TDS.lookAt(p.x, p.z, 0.6); }, 1);
} finally {
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
  server.kill();
}
