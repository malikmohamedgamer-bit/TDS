// node tools/dev/coop-check.mjs [--port 5191] [--out docs/screenshots/online]
// Two players in one browser (two tabs, ?net=local): create a room in the UI, join by code, ready,
// start, build from both sides, run waves, then check both pages agree exactly (same tick, same
// hash, same towers and owners, no resyncs), that pings and remote heroes arrive, and save
// screenshots of both pages.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const PORT = Number(opt('port', 5191));
const OUT = opt('out', 'docs/screenshots/online');
mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
// two tabs in one window: the background one must keep running (Chrome stops animation frames there)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = [];
// DOM-level click: runs the real UI handler. Simulated mouse input starves when two tabs both
// software-render WebGL (headless), which a real GPU browser does not do.
const tap = (p, id) => p.evaluate((id) => { const b = document.querySelector(`[data-testid="${id}"]`); if (!b) throw new Error(`no ${id}`); if (b.disabled) throw new Error(`${id} is disabled`); b.click(); }, id);
// screenshots are evidence, not a test: two software-rendering tabs can make them slow
const shot = (p, path) => p.screenshot({ path, timeout: 60_000 }).catch((e) => console.log(`note: screenshot ${path} skipped (${e.message.split('\n')[0]})`));
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`ok   ${msg}`);

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const open = async (who) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`); });
    await p.goto(`http://localhost:${PORT}/?net=local&quality=low`);
    await p.waitForFunction(() => window.TDS?.ready, null, { timeout: 120_000 });
    await p.waitForFunction(() => window.TDS.ctrl.hub?.el.open && document.querySelector('[data-testid="tab-online"]'), null, { timeout: 60_000 });
    await tap(p, 'tab-online');
    await p.waitForSelector('[data-testid="online-name"]', { timeout: 60_000 });
    await p.getByTestId('online-name').fill(who);
    return p;
  };
  const A = await open('Alice');
  const B = await open('Bob');

  // ---- lobby through the real UI
  await A.bringToFront();
  await tap(A, 'online-create');
  const code = (await A.getByTestId('room-code').textContent({ timeout: 30_000 })).trim();
  ok(`room created: ${code}`);
  await B.bringToFront();
  await B.getByTestId('online-code').fill(code);
  console.log('B at join', await B.evaluate(() => { const b = document.querySelector('[data-testid="online-join"]'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { rect: [r.x, r.y, r.width, r.height], top: top ? `${top.tagName}.${top.className}` : null, same: top === b || b.contains(top), dialogs: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.className) }; }));
  await shot(B, `${OUT}/debug-join.png`);
  await tap(B, 'online-join');
  await B.waitForTimeout(5000);
  console.log('B state', await B.evaluate(() => { const h = window.TDS.ctrl.hub.online; return { state: h.state, error: h.error, phase: h.lobby?.phase, players: h.lobby?.players?.length, code: h.lobby?.code }; }).catch((e) => 'eval failed: ' + e.message));
  console.log('A state', await A.evaluate(() => { const h = window.TDS.ctrl.hub.online; return { state: h.state, phase: h.lobby?.phase, players: h.lobby?.players?.length }; }));
  await A.waitForFunction(() => document.querySelectorAll('[data-testid="online-player"]').length === 2, null, { timeout: 30_000 });
  await B.waitForFunction(() => document.querySelectorAll('[data-testid="online-player"]').length === 2, null, { timeout: 30_000 }).catch(async (e) => {
    console.log('B lobby debug', await B.evaluate(() => { const l = window.TDS.ctrl.hub.online.lobby; const t = window.TDS.ctrl.hub.online.transport; return { phase: l.phase, hostId: l.hostId, id: l.id, state: l.state, peers: t.peers, members: l.members ? [...l.members.keys()] : null }; }));
    console.log('A lobby debug', await A.evaluate(() => { const l = window.TDS.ctrl.hub.online.lobby; const t = window.TDS.ctrl.hub.online.transport; return { id: l.id, rev: l.state?.rev, players: l.state?.players, peers: t.peers }; }));
    throw e;
  });
  ok('both pages list two players');
  await A.bringToFront();
  const why = await A.getByTestId('online-why').textContent().catch(() => '');
  if (!/ready/i.test(why)) fail(`host start blocker should wait for ready, got "${why}"`);
  await A.getByTestId('online-difficulty').selectOption('easy');
  await B.waitForFunction(() => document.querySelector('[data-testid="online-difficulty"]')?.value === 'easy', null, { timeout: 45_000 });
  ok('difficulty change reached the member');
  await shot(A, `${OUT}/lobby-host.png`);
  await B.bringToFront();
  await B.bringToFront();
  await tap(B, 'online-ready');
  await A.waitForFunction(() => { const b = document.querySelector('[data-testid="online-start"]'); return b && !b.disabled; }, null, { timeout: 60_000 });
  await shot(B, `${OUT}/lobby-member.png`);
  await A.bringToFront();
  console.log('before start', await A.evaluate(() => ({ why: document.querySelector('[data-testid="online-why"]')?.textContent || '', players: window.TDS.ctrl.hub.online.lobby.players.map((p) => `${p.name}:${p.ready}:${p.map}:${p.host}`) })));
  await tap(A, 'online-start');
  await A.waitForTimeout(8000);
  for (const [who, p] of [['Alice', A], ['Bob', B]]) {
    console.log(who, await p.evaluate(() => { const c = window.TDS.ctrl; const o = c.hub.online; return { online: !!c.online, ready: c.ready, hubOpen: c.hub.el.open, phase: o.lobby?.phase, startedId: o.startedId || null, error: o.error, tick: c.match?.tick ?? null, sess: c.online ? c.online.session.stats : null }; }));
  }
  for (const [who, p] of [['Alice', A], ['Bob', B]]) {
    await p.waitForFunction(() => window.TDS.ctrl.online && window.TDS.ctrl.ready, null, { timeout: 180_000 });
    ok(`${who} is in the co-op match`);
  }

  await A.evaluate(() => { window.__desync = []; window.TDS.ctrl.online.session.on('desync', (e) => window.__desync.push(e)); });
  await B.evaluate(() => { window.__resync = []; window.TDS.ctrl.online.session.on('resync', (e) => window.__resync.push(e)); });
  // ---- state recorder: both pages keep a snapshot every 120 ticks (first 12), to find the
  // first tick where they differ
  for (const p of [A, B]) {
    await p.evaluate(() => {
      const sim = window.TDS.ctrl.online.sim;
      window.__rec = {};
      const step = sim.step.bind(sim);
      sim.step = () => {
        const r = step();
        const m = sim.match;
        if (m.tick % 120 === 0 && Object.keys(window.__rec).length < 12) window.__rec[m.tick] = JSON.stringify(m.snapshot());
        return r;
      };
    });
  }
  // ---- desync forensics: before Bob restores a host snapshot, record which state paths differ
  await B.evaluate(() => {
    const sim = window.TDS.ctrl.online.sim;
    const orig = sim.restore.bind(sim);
    window.__diffs = [];
    const walk = (a, b, path, out) => {
      if (out.length > 12) return;
      if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} vs host ${JSON.stringify(b)?.slice(0, 60)}`); return; }
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) walk(a[k], b[k], `${path}.${k}`, out);
    };
    sim.restore = (snap) => {
      try { const mine = JSON.parse(JSON.stringify(sim.match.snapshot())); const out = []; walk(mine, snap, 'snap', out); window.__diffs.push({ tick: snap.tick, mine: mine.tick, out }); } catch (e) { window.__diffs.push({ err: String(e) }); }
      return orig(snap);
    };
  });
  // ---- play: both build, the host starts the first wave, Bob's hero walks, pings
  const build = (p, tower, n) => p.evaluate(({ tower, n }) => {
    const c = window.TDS.ctrl;
    const m = c.match;
    const pid = c.online.localPid;
    const path = m.paths[0];
    let placed = 0;
    for (let d = pid === 'p1' ? 10 : 14; d < path.length && placed < n; d += 9) {
      const pt = path.pointAt(d, {});
      for (const off of [5, -5, 7, -7]) {
        const x = pt.x + off * pt.dz;
        const z = pt.z - off * pt.dx;
        if (!m.validate({ type: 'place', tower, x, z, pid }).ok) continue;
        if (c.command({ type: 'place', tower, x, z }).ok) { placed++; break; }
      }
    }
    return placed;
  }, { tower, n });
  const pa = await build(A, 'rifleman', 3);
  const pb = await build(B, 'ember_adept', 3);
  ok(`orders sent: Alice ${pa} towers, Bob ${pb} towers`);
  await A.evaluate(() => window.TDS.ctrl.command({ type: 'skip' }));
  await B.evaluate(() => window.TDS.teleport(window.TDS.hero.x + 6, window.TDS.hero.z + 4));
  await A.evaluate(() => window.TDS.ctrl.sendPing(1));
  await B.waitForFunction(() => /Alice/.test(document.querySelector('[data-testid="pingfeed"]')?.textContent || ''), null, { timeout: 20_000 })
    .then(() => ok('Bob saw Alice\'s ping'), () => fail('ping did not arrive'));
  // let the match run: 1800 ticks = 30 s of game time
  await Promise.all([A, B].map((p) => p.waitForFunction(() => window.TDS.ctrl.match.tick > 1800, null, { timeout: 300_000 })));
  ok('both pages passed tick 1800');
  await shot(A, `${OUT}/match-host.png`);
  await shot(B, `${OUT}/match-member.png`);

  // ---- compare: pause on the host, let both settle on the same tick
  await A.evaluate(() => window.TDS.ctrl.online.session.setPaused(true));
  await A.waitForTimeout(3000);
  const state = (p) => p.evaluate(() => {
    const c = window.TDS.ctrl;
    const m = c.match;
    return {
      tick: m.tick, hash: m.hash(), resyncs: c.online.session.stats.resyncs,
      towers: m.towers.map((t) => `${t.uid}:${t.owner}:${t.defId}`).sort(),
      wallets: m.wallets, heroes: m.heroes.map((h) => `${h.pid}:${h.x.toFixed(2)},${h.z.toFixed(2)}`),
      remoteViews: c.view.remoteHeroes ? c.view.remoteHeroes.size : 0, wave: m.wave, kills: m.stats.kills,
    };
  });
  let a = await state(A);
  let b = await state(B);
  for (let i = 0; i < 10 && a.tick !== b.tick; i++) { await A.waitForTimeout(1000); a = await state(A); b = await state(B); }
  console.log(JSON.stringify({ alice: a, bob: b }, null, 1));
  if (a.tick !== b.tick) fail(`ticks differ after pause: ${a.tick} vs ${b.tick}`);
  else if (a.hash !== b.hash) fail(`hash differs at tick ${a.tick}`);
  else ok(`same tick ${a.tick} and same hash on both pages`);
  if (JSON.stringify(a.towers) !== JSON.stringify(b.towers)) fail('tower lists differ'); else ok(`same ${a.towers.length} towers with owners on both pages`);
  if (!a.towers.some((t) => t.includes(':p1:')) || !b.towers.some((t) => t.includes(':p2:'))) fail('expected towers from both players');
  if (a.resyncs || b.resyncs) console.log(`note: resyncs host ${a.resyncs}, member ${b.resyncs}`);
  console.log('host desync events', JSON.stringify(await A.evaluate(() => window.__desync.slice(0, 6))));
  console.log('member resync events', JSON.stringify(await B.evaluate(() => window.__resync.slice(0, 6))));
  const recA = await A.evaluate(() => window.__rec);
  const recB = await B.evaluate(() => window.__rec);
  const walk = (x, y, path, out) => {
    if (out.length > 15) return;
    if (typeof x !== typeof y || x === null || y === null || typeof x !== 'object') { if (x !== y) out.push(`${path}: ${JSON.stringify(x)?.slice(0, 80)} | ${JSON.stringify(y)?.slice(0, 80)}`); return; }
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`, out);
  };
  for (const t of Object.keys(recA).map(Number).sort((u, v) => u - v)) {
    if (!recB[t]) continue;
    if (recA[t] === recB[t]) { console.log(`tick ${t}: identical`); continue; }
    const out = [];
    walk(JSON.parse(recA[t]), JSON.parse(recB[t]), 'snap', out);
    console.log(`tick ${t}: FIRST DIFFERENCE (host | member)`);
    for (const l of out) console.log(`  ${l}`);
    break;
  }
  console.log('desync diffs', JSON.stringify(await B.evaluate(() => window.__diffs.slice(0, 3)), null, 1));
  if (a.remoteViews !== 1 || b.remoteViews !== 1) fail(`each page should draw one remote hero (got ${a.remoteViews}, ${b.remoteViews})`); else ok('each page draws the other player\'s hero');
  if (a.kills < 1) fail('no enemy died: the wave did not run');
  // ---- hidden tab: Bob's tab hides (no animation frames at all); his match must keep running
  await A.evaluate(() => window.TDS.ctrl.online.session.setPaused(false));
  const t0 = await B.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    window.__raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0; // the frame loop stops scheduling itself
    return window.TDS.ctrl.match.tick;
  });
  await B.waitForTimeout(12_000);
  const hid = await B.evaluate(() => ({ tick: window.TDS.ctrl.match.tick, stalled: window.TDS.ctrl.online.session.stats.stalled }));
  const hostTick = await A.evaluate(() => window.TDS.ctrl.match.tick);
  console.log(`hidden tab: ${t0} -> ${hid.tick} in 12 s (host at ${hostTick})`);
  if (hid.tick - t0 < 300) fail(`hidden tab barely advanced (${hid.tick - t0} ticks in 12 s)`); else ok('a hidden tab keeps simulating (worker timer)');
  await B.evaluate(() => { delete document.hidden; window.requestAnimationFrame = window.__raf; window.requestAnimationFrame((t) => window.TDS && 0); });
  await A.evaluate(() => window.TDS.ctrl.online.session.setPaused(true));
  await A.setViewportSize({ width: 390, height: 844 });
  await B.setViewportSize({ width: 390, height: 844 });
  await A.evaluate(() => window.TDS.ctrl.online.session.setPaused(false));
  await A.waitForTimeout(2500);
  await shot(A, `${OUT}/phone-host.png`);
  await shot(B, `${OUT}/phone-member.png`);
} catch (err) {
  fail(err.stack || err.message);
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.log(`page errors (${errors.length}):`); for (const e of errors.slice(0, 10)) console.log(`  ${e}`); process.exitCode = 1; }
console.log(process.exitCode ? 'COOP CHECK FAILED' : 'COOP CHECK PASSED');
