// node tools/leak-check.mjs [--cycles 5] [--map riftline]
// Memory leak check (ROADMAP Chunk 8): plays the same short match several times in one page
// (start, place towers, run a wave, back to the lobby) and records GPU geometries / textures and
// the JS heap after each cycle. Counts that keep growing every cycle point at a leak.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const CYCLES = Number(opt('cycles', 5));
const MAP = opt('map', 'riftline');
const PORT = 5199;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?map=${MAP}&quality=low&nolobby`);
  await page.waitForFunction(() => window.TDS?.ready, null, { timeout: 120_000 });
  const snap = async (label) => {
    const s = await page.evaluate(async () => {
      if (window.gc) window.gc();
      await new Promise((r) => setTimeout(r, 300));
      const st = window.TDS.stats;
      return { geometries: st.geometries, textures: st.textures, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), nodes: document.getElementsByTagName('*').length };
    });
    rows.push({ label, ...s });
    console.log(`${label.padEnd(10)} geometries ${s.geometries} textures ${s.textures} heap ${s.heapMB} MB dom ${s.nodes}`);
  };
  await snap('start');
  for (let c = 1; c <= CYCLES; c++) {
    await page.evaluate(async () => {
      const T = window.TDS;
      await T.ctrl.start({ difficulty: 'easy', mode: 'sandbox', modifiers: [], loadout: ['rifleman', 'ember_adept', 'frost_weaver', 'rocket_battery', 'storm_caller', 'gunner'], tutorial: false });
      const m = T.match;
      T.debug.setCash(1e6);
      const p = m.paths[0];
      let placed = 0;
      for (let d = 8; d < p.length && placed < 10; d += 7) {
        const pt = p.pointAt(d, {});
        for (const off of [5, -5, 7, -7]) { if (m.command({ type: 'place', tower: m.loadout[placed % m.loadout.length], x: pt.x + off * pt.dz, z: pt.z - off * pt.dx }).ok) { placed++; break; } }
      }
      T.debug.jumpToWave(10);
    });
    await page.evaluate(() => new Promise((r) => { const t0 = window.TDS.simTime; const i = setInterval(() => { if (window.TDS.simTime > t0 + 6) { clearInterval(i); r(); } }, 100); }));
    await page.evaluate(() => { window.TDS.ctrl.toLobby(); });
    await page.waitForTimeout(800);
    await snap(`cycle ${c}`);
  }
  if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  const g = rows.slice(1).map((r) => r.geometries);
  const growth = g.length > 2 ? (g.at(-1) - g[1]) / (g.length - 2) : 0;
  console.log(`geometry growth per cycle after the first: ${growth.toFixed(1)}`);
} finally {
  await browser.close();
  server.kill();
}
