// node tools/ui-shots.mjs <tag> [--sizes desktop,tablet,phone] [--only hub,match,...]
// UI/GFX review: hub tabs, map picker, matches on 6 themes, a boss fight, summon, shop, Index,
// victory and defeat, at phone / tablet / desktop sizes. Writes docs/screenshots/ui-update/<tag>/
// and perf.json (load bytes per resource type, frame time stats). Software WebGL, headless.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith('--')) || 'after';
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const out = `docs/screenshots/ui-update/${tag}`;
mkdirSync(out, { recursive: true });
const SIZES = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 820, height: 1180, hasTouch: true, isMobile: true },
  phone: { width: 390, height: 844, hasTouch: true, isMobile: true },
};
const sizes = opt('sizes', 'desktop,tablet,phone').split(',');
const only = opt('only', '') ? opt('only', '').split(',') : null;
const want = (k) => !only || only.includes(k);
const THEMES = [['riftline', 'verdant'], ['glacier_gate', 'frost'], ['mirrormire', 'toxic'], ['gen_ember_1', 'ember'], ['gen_dunes_1', 'dunes'], ['starfall_sanctum', 'starfall']];

const PORT = 5197;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const perf = { tag, date: new Date().toISOString(), loads: [], frames: [] };
const settle = (page, s = 1.2) => page.evaluate((s) => new Promise((r) => { const t0 = window.TDS.simTime; const i = setInterval(() => { if (window.TDS.simTime > t0 + s) { clearInterval(i); r(); } }, 50); }), s);

async function open(size, map, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: SIZES[size].width, height: SIZES[size].height }, hasTouch: !!SIZES[size].hasTouch, isMobile: !!SIZES[size].isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${size} ${map}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${size} ${map}: console ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?quality=${size === 'desktop' ? 'high' : 'low'}&map=${map}${extra}`);
  await page.waitForSelector('[data-testid="lobby"][open]', { timeout: 120_000 });
  // same mid-progress profile for every capture (before and after)
  await page.evaluate(() => {
    const s = window.TDS.save;
    s.profile.level = 10; s.profile.xp = Math.max(s.profile.xp, 4000); s.wallet.crowns = 5200; s.wallet.sigils = 640;
    s.progress.tutorialDone = true;
    for (const id of ['frost_weaver', 'ember_adept', 'marksman', 'gunner', 'storm_caller']) if (window.TDS.content.towers.has(id) && !s.towers.owned[id]) s.towers.owned[id] = { level: 3 };
    for (const e of [...window.TDS.content.enemies.keys()].slice(0, 14)) if (!s.index.enemies.includes(e)) s.index.enemies.push(e);
    window.TDS.ctrl.hub.cfg.tutorial = false;
    window.TDS.ctrl.hub.render();
  });
  return { ctx, page };
}

const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(`saved ${out}/${name}.png`); };

async function startMatch(page) {
  await page.evaluate(() => { const t = document.querySelector('[name="tutorial"]'); if (t?.checked) t.click(); });
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view && window.TDS.ctrl.ready !== false, null, { timeout: 120_000 });
  await page.evaluate(() => document.querySelector('.controls-card')?.setAttribute('hidden', ''));
}

/** Places the loadout along road 0 (perpendicular offsets, invalid spots are skipped). */
async function buildDefence(page, waves = 3) {
  await page.evaluate((waves) => {
    const T = window.TDS; const m = T.match;
    T.debug.setCash(1e6);
    const p = m.paths[0]; let k = 0;
    for (let f = 0.15; f < 0.9 && k < 9; f += 0.09) {
      const q = p.pointAt(p.length * f);
      let done = false;
      for (const off of [5, 6.5, 8]) for (const side of [1, -1]) {
        if (done) break;
        const r = m.command({ type: 'place', tower: m.loadout[k % m.loadout.length], x: q.x - q.dz * off * side, z: q.z + q.dx * off * side });
        if (r?.ok) { k++; done = true; }
      }
    }
    T.debug.setCash(400);
    for (let i = 0; i < waves; i++) { m.command({ type: 'skip' }); T.debug.fastForward(4); }
    T.debug.fastForward(8);
  }, waves);
}

async function aimAtRoad(page, f = 0.45, dist = 18, pitch = 0.42) {
  await page.evaluate(({ f, dist, pitch }) => {
    const T = window.TDS; const p = T.match.paths[0]; const q = p.pointAt(p.length * f);
    T.setCamera('orbit'); T.teleport(q.x - q.dz * 3, q.z + q.dx * 3); T.setDistance(dist);
    T.setView(Math.atan2(q.dx, q.dz) + Math.PI / 2 + 0.5, pitch);
  }, { f, dist, pitch });
  await settle(page, 1.5);
}

try {
  for (const size of sizes) {
    // ---- hub tabs + map picker + perf of a cold load
    if (want('hub')) {
      const t0 = Date.now();
      const { ctx, page } = await open(size, 'riftline');
      const load = await page.evaluate(() => {
        const by = {};
        for (const r of performance.getEntriesByType('resource')) { const ext = (r.name.split('?')[0].match(/\.(\w+)$/) || [, 'other'])[1]; by[ext] = (by[ext] || 0) + (r.encodedBodySize || r.transferSize || 0); }
        const nav = performance.getEntriesByType('navigation')[0];
        return { bytes: Object.values(by).reduce((a, x) => a + x, 0) + (nav?.encodedBodySize || 0), byType: by, requests: performance.getEntriesByType('resource').length };
      });
      perf.loads.push({ size, ms: Date.now() - t0, ...load });
      await page.waitForTimeout(1500);
      await shot(page, `${size}-01-hub`);
      await page.evaluate(() => document.querySelector('[data-testid="map-picker"], .maps')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(500);
      await shot(page, `${size}-02-map-picker`);
      for (const [tab, n] of [['summon', '07-summon'], ['shop', '08-shop'], ['index', '09-index'], ['quests', '10-quests'], ['towers', '11-towers']]) {
        await page.getByTestId(`tab-${tab}`).click();
        await page.waitForTimeout(tab === 'summon' ? 1500 : 900);
        await shot(page, `${size}-${n}`);
      }
      await ctx.close();
    }
    // ---- matches on six themes
    if (want('match')) {
      for (const [map, theme] of THEMES) {
        const { ctx, page } = await open(size, map);
        await startMatch(page);
        await buildDefence(page, 3);
        await aimAtRoad(page, 0.4);
        await shot(page, `${size}-03-match-${theme}`);
        if (map === 'riftline' && size === 'desktop') {
          // frame time: 6 s of real rendering with a busy wave
          await page.evaluate(() => { window.TDS.settings.showFps = true; });
          await page.waitForTimeout(6000);
          perf.frames.push({ map, size, ...(await page.evaluate(() => window.TDS.stats)) });
        }
        await ctx.close();
      }
    }
    // ---- boss fight, victory and defeat (Riftline)
    if (want('end')) {
      const { ctx, page } = await open(size, 'riftline');
      await startMatch(page);
      await buildDefence(page, 1);
      await page.evaluate(() => { const T = window.TDS; T.debug.setCash(5000); T.debug.jumpToWave(T.match.waveCount()); T.debug.fastForward(9); });
      await page.evaluate(() => {
        const T = window.TDS; const b = T.match.enemies.find((e) => e.alive && e.def.boss) || T.match.enemies.find((e) => e.alive);
        if (b) { T.setCamera('orbit'); T.teleport(b.x + 6, b.z + 6); T.lookAt(b.x, b.z, 0.32); T.setDistance(16); }
      });
      await settle(page, 1.2);
      await shot(page, `${size}-04-boss`);
      await page.evaluate(() => { const T = window.TDS; const m = T.match; const dmg = m.stats.damage; T.debug.setBaseHp(1e6); T.debug.killAll(); m.stats.damage = dmg; T.debug.setBaseHp(m.baseMax); T.debug.fastForward(30); });
      await page.waitForSelector('[data-testid="end"][open]', { timeout: 60_000 });
      await page.waitForTimeout(2500);
      await shot(page, `${size}-05-victory`);
      await ctx.close();
      const b = await open(size, 'riftline');
      await startMatch(b.page);
      await b.page.evaluate(() => { const T = window.TDS; T.debug.setBaseHp(1); T.match.command({ type: 'skip' }); T.debug.fastForward(120); });
      await b.page.waitForSelector('[data-testid="end"][open]', { timeout: 60_000 });
      await b.page.waitForTimeout(2500);
      await shot(b.page, `${size}-06-defeat`);
      await b.ctx.close();
    }
  }
} finally {
  perf.errors = errors;
  writeFileSync(`${out}/perf.json`, JSON.stringify(perf, null, 1));
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
  server.kill();
}
