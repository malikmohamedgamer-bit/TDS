// Store page screenshots (docs/STORE.md): stages each scene through the game's own API and saves a
// PNG. Software rendering (headless), so take the final ones on a real GPU if you can; this gets the
// framing and content right. Co-op is left out (tools/dev/coop-check.mjs captures two-tab shots).
//   node tools/store-shots.mjs [outDir=docs/screenshots/store]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'docs/screenshots/store';
mkdirSync(out, { recursive: true });
const PORT = 5197;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) break; } catch { /* starting */ } await wait(200); }

async function open(query, viewport = { width: 1280, height: 720 }, quality = 'high') {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(120_000);
  await page.goto(`${base}?quality=${quality}&${query}`);
  await page.waitForFunction(() => window.TDS?.ready && window.TDS.ctrl.hub?.el.open, null, { timeout: 120_000 });
  return page;
}

/** Start a match from the hub (sandbox: free building), tutorial off, with these towers owned and
 *  in the loadout (at most 6). */
async function match(page, loadout, mode = 'sandbox') {
  await page.evaluate(({ mode, loadout }) => {
    const c = window.TDS.ctrl;
    for (const id of loadout) c.save.towers.owned[id] ||= { level: 8 };
    const h = c.hub;
    h.cfg.mode = mode;
    h.cfg.tutorial = false;
    h.cfg.loadout = loadout.slice(0, 6);
    document.querySelector('[data-act="start"]').click();
  }, { mode, loadout });
  await page.waitForFunction(() => window.TDS.ctrl.ready && window.TDS.ctrl.match, null, { timeout: 180_000 });
}

/** Build towers along every road (sandbox: any tower, free), upgrade each `ups` times. */
async function build(page, towers, ups = 4) {
  await page.evaluate(({ towers, ups }) => {
    const c = window.TDS.ctrl;
    const m = c.match;
    let k = 0;
    for (const path of m.paths) {
      for (let d = 14; d < path.length - 10 && k < towers.length * 2; d += 11) {
        const pt = path.pointAt(d, {});
        for (const off of [5.5, -5.5]) {
          const tower = towers[k % towers.length];
          const x = pt.x + off * pt.dz;
          const z = pt.z - off * pt.dx;
          if (m.validate({ type: 'place', tower, x, z }).ok && c.command({ type: 'place', tower, x, z }).ok) { k++; break; }
        }
      }
    }
    for (const t of m.towers) {
      for (let i = 0; i < ups; i++) {
        const r = m.validate({ type: 'upgrade', uid: t.uid });
        const branch = r.options?.[0]?.branch ?? r.options?.[0]?.id ?? 0;
        if (r.ok) c.command({ type: 'upgrade', uid: t.uid });
        else if (r.code === 'branch') c.command({ type: 'upgrade', uid: t.uid, branch });
      }
    }
  }, { towers, ups });
}

async function waves(page, n, settle = 9000) {
  await page.evaluate((n) => { for (let i = 0; i < n; i++) window.TDS.ctrl.command({ type: 'skip' }); }, n);
  await wait(settle);
}

const shots = [
  ['01-crossover-battle', async () => {
    const p = await open('map=gen_toxic_8');
    await match(p, ['rifleman', 'ember_adept', 'storm_caller', 'rocket_battery', 'frost_weaver', 'gunner']);
    await build(p, ['rifleman', 'ember_adept', 'storm_caller', 'rocket_battery', 'frost_weaver', 'gunner'], 6);
    await waves(p, 6, 12000);
    await p.evaluate(() => window.TDS.setCamera('top'));
    await wait(2500);
    return p;
  }],
  ['02-boss', async () => {
    const p = await open('map=riftline');
    await match(p, ['marksman', 'storm_caller', 'rocket_battery', 'ember_adept']);
    await build(p, ['marksman', 'storm_caller', 'rocket_battery', 'ember_adept'], 5);
    // jump to the first boss wave and follow the boss
    await p.evaluate(() => {
      const c = window.TDS.ctrl;
      for (let w = 1; w <= c.match.waveCount() && !c.match.waveDef(w + 1)?.boss; w++) c.command({ type: 'skip' });
      c.command({ type: 'skip' });
    });
    await p.waitForFunction(() => window.TDS.ctrl.match.enemies.some((e) => e.boss && e.alive), null, { timeout: 240_000 }).catch(() => {});
    await wait(4000);
    await p.evaluate(() => { const b = window.TDS.ctrl.match.enemies.find((e) => e.boss && e.alive); if (b) { window.TDS.teleport(b.x - 9, b.z - 9); window.TDS.lookAt(b.x, b.z, 0.3); } });
    await wait(1500);
    return p;
  }],
  ['03-air-route', async () => {
    const p = await open('map=frostbite_hairpin');
    await match(p, ['gunship', 'marksman', 'frost_weaver']);
    await build(p, ['gunship', 'marksman', 'frost_weaver'], 3);
    await p.evaluate(() => {
      const m = window.TDS.ctrl.match;
      const f = [...m.content.enemies.values()].find((e) => e.flying && !e.boss && !e.summonOnly && !e.split);
      for (let i = 0; i < 7; i++) { const e = m.spawnEnemy(f.id); e.d = i * 7; }
    });
    await wait(4000);
    await p.evaluate(() => { const ap = window.TDS.ctrl.match.airPaths[0]; const a = ap.pointAt(ap.length * 0.3, {}); const b = ap.pointAt(ap.length * 0.6, {}); window.TDS.teleport(a.x - 12 * a.dz, a.z + 12 * a.dx); window.TDS.lookAt(b.x, b.z, 0.12); });
    await wait(1500);
    return p;
  }],
  ['04-hub', async () => open('map=crimson_crossing', undefined, 'low')],
  ['05-tower-panel', async () => {
    const p = await open('map=mirrormire');
    await match(p, ['ember_adept', 'rifleman']);
    await build(p, ['ember_adept', 'rifleman'], 2);
    await p.evaluate(() => { const c = window.TDS.ctrl; const t = c.match.towers[0]; c.select(t.uid); window.TDS.teleport(t.x - 7, t.z - 7); window.TDS.lookAt(t.x, t.z, 0.35); });
    await wait(2500);
    return p;
  }],
  ['07-index', async () => {
    const p = await open('map=riftline', undefined, 'low');
    await p.evaluate(() => {
      const c = window.TDS.ctrl;
      const all = [...c.content.enemies.values()];
      c.save.index.enemies = all.filter((e, i) => i % 3 !== 2).map((e) => e.id);
      document.querySelector('[data-testid="tab-index"]').click();
    });
    await wait(1500);
    await p.evaluate(() => document.querySelector('[data-testid="ix-boss-count"]')?.scrollIntoView({ block: 'start' }));
    await wait(8000); // thumbnails render lazily once on screen
    return p;
  }],
  ['08-summon', async () => {
    const p = await open('map=riftline', undefined, 'low');
    await p.evaluate(() => { const c = window.TDS.ctrl; c.save.wallet.sigils = 2000; document.querySelector('[data-testid="tab-summon"]').click(); });
    await wait(1000);
    await p.evaluate(() => document.querySelector('[data-testid="pull-10"]')?.click());
    await wait(3000);
    await p.evaluate(() => document.querySelector('[data-testid="skip-anim"]')?.click());
    await wait(4000);
    return p;
  }],
  ['09-void-night', async () => {
    const p = await open('map=void_convergence');
    await match(p, ['spirit_summoner', 'storm_caller', 'rune_totem', 'ember_adept', 'frost_weaver']);
    await build(p, ['spirit_summoner', 'storm_caller', 'rune_totem', 'ember_adept', 'frost_weaver'], 6);
    await waves(p, 8, 12000);
    await p.evaluate(() => window.TDS.setCamera('top'));
    await wait(2500);
    return p;
  }],
  ['10-phone', async () => {
    const p = await open('map=gen_verdant_2', { width: 390, height: 844 });
    await match(p, ['rifleman', 'ember_adept', 'gunner']);
    await build(p, ['rifleman', 'ember_adept', 'gunner'], 3);
    await waves(p, 3, 9000);
    return p;
  }],
];

const only = process.argv[3]?.split(',');
for (const [name, stage] of shots) {
  if (only && !only.some((o) => name.startsWith(o))) continue;
  let page;
  try {
    page = await stage();
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 120_000 });
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}: ${String(err.message).split('\n')[0]}`);
  } finally {
    await page?.close();
  }
}
await browser.close();
server.kill();
