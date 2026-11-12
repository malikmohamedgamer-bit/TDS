// node tools/perf-report.mjs [--maps a,b] [--qualities low,medium,high,ultra]
// Performance budgets (ROADMAP Chunk 7): for each quality preset and map, starts a match, places
// towers, jumps to a busy wave and samples renderer stats during play: draw calls, triangles,
// geometries, textures, JS heap, frame time. Also records the download size of a cold load by file
// type. Writes docs/perf.json. Headless Chromium uses software WebGL (SwiftShader), so frame times
// here are far slower than a real GPU: compare them between presets, not with a 60 fps budget.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const MAPS = opt('maps', 'riftline,gen_frost_9,gen_ember_9,starfall_sanctum').split(',');
const QUALITIES = opt('qualities', 'low,medium,high,ultra').split(',');
const PORT = 5198;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const out = { date: new Date().toISOString(), note: 'software WebGL (SwiftShader), 1280x720; frame times are relative only', loads: [], runs: [], errors: [] };

async function measure(map, quality) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`${map}/${quality}: ${e.message}`));
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?map=${map}&quality=${quality}&nolobby`);
  await page.waitForFunction(() => window.TDS?.ready, null, { timeout: 120_000 });
  const loadMs = Date.now() - t0;
  if (quality === QUALITIES[0]) {
    out.loads.push({ map, ms: loadMs, ...(await page.evaluate(() => {
      const by = {};
      for (const r of performance.getEntriesByType('resource')) { const ext = (r.name.split('?')[0].match(/\.(\w+)$/) || [, 'other'])[1]; by[ext] = (by[ext] || 0) + (r.encodedBodySize || r.transferSize || 0); }
      const nav = performance.getEntriesByType('navigation')[0];
      return { bytes: Object.values(by).reduce((a, x) => a + x, 0) + (nav?.encodedBodySize || 0), byType: by, requests: performance.getEntriesByType('resource').length };
    })) });
  }
  // a busy scene: 6 core towers along the first road, wave 10 (a boss wave) under way
  await page.evaluate(async () => {
    const T = window.TDS;
    await T.ctrl.start({ difficulty: 'easy', mode: 'sandbox', modifiers: [], loadout: ['rifleman', 'ember_adept', 'frost_weaver', 'rocket_battery', 'storm_caller', 'gunner'], tutorial: false });
    const m = T.match;
    T.debug.setCash(1e6);
    const p = m.paths[0];
    let placed = 0;
    for (let d = 8; d < p.length && placed < 12; d += 7) {
      const pt = p.pointAt(d, {});
      for (const off of [5, -5, 7, -7]) {
        const r = m.command({ type: 'place', tower: m.loadout[placed % m.loadout.length], x: pt.x + off * pt.dz, z: pt.z - off * pt.dx });
        if (r.ok) { placed++; break; }
      }
    }
    T.debug.jumpToWave(10);
    T.setCamera('top');
  });
  // let the wave spread out, then sample
  await page.evaluate(() => new Promise((r) => { const t0 = window.TDS.simTime; const i = setInterval(() => { if (window.TDS.simTime > t0 + 8) { clearInterval(i); r(); } }, 100); }));
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    samples.push(await page.evaluate(() => ({ ...window.TDS.stats, heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, enemies: window.TDS.match.enemies.filter((e) => e.alive).length, towers: window.TDS.match.towers.length })));
  }
  const mx = (k) => Math.max(...samples.map((s) => s[k] ?? 0));
  const med = (k) => { const v = samples.map((s) => s[k]).filter((x) => x != null).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const run = { map, quality, loadMs, calls: mx('calls'), triangles: mx('triangles'), geometries: mx('geometries'), textures: mx('textures'), heapMB: +(mx('heapMB') || 0).toFixed(1), frameMsP50: +(med('p50') ?? 0).toFixed(1), frameMsP95: +(med('p95') ?? 0).toFixed(1), enemies: mx('enemies'), towers: mx('towers') };
  out.runs.push(run);
  console.log(`${map.padEnd(18)} ${quality.padEnd(7)} calls ${run.calls} tris ${run.triangles} geo ${run.geometries} tex ${run.textures} heap ${run.heapMB} MB frame p50 ${run.frameMsP50} p95 ${run.frameMsP95} ms (enemies ${run.enemies}, towers ${run.towers})`);
  await ctx.close();
}

try {
  for (const map of MAPS) for (const q of QUALITIES) await measure(map, q);
} finally {
  await browser.close();
  server.kill();
}
writeFileSync('docs/perf.json', `${JSON.stringify(out, null, 1)}\n`);
for (const l of out.loads) console.log(`load ${l.map}: ${(l.bytes / 1048576).toFixed(2)} MB in ${l.requests} requests, ${l.ms} ms`);
if (out.errors.length) { console.log(`page errors: ${out.errors.length}`); for (const e of out.errors.slice(0, 5)) console.log(`  ${e}`); }
