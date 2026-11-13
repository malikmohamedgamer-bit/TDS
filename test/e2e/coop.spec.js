// Co-op over the same-browser transport (?net=local): two tabs, the real lobby UI, a match through
// the lockstep session. Both tabs must end on the same tick with the same state hash and towers from
// both players (docs/multiplayer.md). The longer version with screenshots: tools/dev/coop-check.mjs.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

// two tabs share one window: the background tab must keep running (Chrome stops its frames)
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } });

// DOM click: runs the real UI handler; simulated mouse input starves when two tabs software-render
const tap = (p, id) => p.evaluate((id) => {
  const b = document.querySelector(`[data-testid="${id}"]`);
  if (!b) throw new Error(`no ${id}`);
  if (b.disabled) throw new Error(`${id} is disabled`);
  b.click();
}, id);

async function openOnline(context, name, errors, net = 'net=local') {
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await p.goto(`./?${net}&quality=low`);
  await p.waitForFunction(() => window.TDS?.ready && window.TDS.ctrl.hub?.el.open, null, { timeout: 120_000 });
  await tap(p, 'tab-online');
  await p.waitForSelector('[data-testid="online-name"]', { timeout: 60_000 });
  await p.getByTestId('online-name').fill(name);
  return p;
}

async function coopRun(context, net) {
  const errors = [];
  const A = await openOnline(context, 'Alice', errors, net);
  const B = await openOnline(context, 'Bob', errors, net);
  await tap(A, 'online-create');
  const code = (await A.getByTestId('room-code').textContent({ timeout: 60_000 })).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await B.getByTestId('online-code').fill(code);
  await tap(B, 'online-join');
  for (const p of [A, B]) await expect(p.getByTestId('online-player')).toHaveCount(2, { timeout: 60_000 });
  // names travel as text, never as markup
  await expect(B.getByTestId('online-player').first()).toContainText('Alice');
  await tap(B, 'online-ready');
  await A.waitForFunction(() => { const b = document.querySelector('[data-testid="online-start"]'); return b && !b.disabled; }, null, { timeout: 60_000 });
  await tap(A, 'online-start');
  for (const p of [A, B]) await p.waitForFunction(() => window.TDS.ctrl.online && window.TDS.ctrl.ready, null, { timeout: 180_000 });

  // each player builds one tower through the normal command path; the host starts the wave
  const build = (p, tower) => p.evaluate((tower) => {
    const c = window.TDS.ctrl;
    const m = c.match;
    const pid = c.online.localPid;
    const path = m.paths[0];
    for (let d = pid === 'p1' ? 10 : 45; d < path.length; d += 7) {
      const pt = path.pointAt(d, {});
      for (const off of [5, -5, 7, -7]) {
        const x = pt.x + off * pt.dz;
        const z = pt.z - off * pt.dx;
        if (m.validate({ type: 'place', tower, x, z, pid }).ok) return c.command({ type: 'place', tower, x, z }).ok;
      }
    }
    return false;
  }, tower);
  // both tabs record their state hash and tower list as they pass fixed ticks (a member may run a
  // few ticks ahead of the host inside the confirmed window, so "same tick now" is not a test)
  for (const p of [A, B]) {
    await p.evaluate(() => {
      const sim = window.TDS.ctrl.online.sim;
      window.__rec = {};
      const step = sim.step.bind(sim);
      sim.step = () => {
        const r = step();
        const m = sim.match;
        if (m.tick % 300 === 0) window.__rec[m.tick] = { hash: m.hash(), towers: m.towers.map((t) => `${t.uid}:${t.owner}:${t.defId}`).sort() };
        return r;
      };
    });
  }
  expect(await build(A, 'rifleman')).toBe(true);
  expect(await build(B, 'ember_adept')).toBe(true);
  await A.evaluate(() => window.TDS.ctrl.command({ type: 'skip' }));
  for (const p of [A, B]) await p.waitForFunction(() => window.TDS.ctrl.match.tick > 1600, null, { timeout: 400_000 });

  const recA = await A.evaluate(() => window.__rec);
  const recB = await B.evaluate(() => window.__rec);
  const common = Object.keys(recA).filter((t) => recB[t]).map(Number).sort((x, y) => x - y);
  expect(common.length).toBeGreaterThanOrEqual(2);
  for (const t of common) expect(recB[t], `tick ${t}`).toEqual(recA[t]);
  const last = recA[common.at(-1)];
  const a = { hash: last.hash };
  expect(last.towers.some((t) => t.includes(':p1:'))).toBe(true);
  expect(last.towers.some((t) => t.includes(':p2:'))).toBe(true);
  // no desync ever (a state mismatch would be a lockstep bug). A tab that the machine starves for
  // more than snapTimeoutMs may get one catch-up snapshot for the gap (BUGS 64): allowed once.
  const hostTrace = await A.evaluate(() => window.TDS.ctrl.online.session.trace);
  expect(hostTrace.filter((e) => e.includes('snap?') && e.includes('desync')), hostTrace.join(' | ')).toEqual([]);
  expect(await B.evaluate(() => window.TDS.ctrl.online.session.stats.resyncs), hostTrace.join(' | ')).toBeLessThanOrEqual(1);

  // rematch: the host quits (pause menu), both tabs return to the same room, ready, start again
  await A.evaluate(() => window.TDS.ctrl.backToOnlineLobby('You left the match'));
  for (const p of [A, B]) {
    await p.waitForFunction(() => !window.TDS.ctrl.online && document.querySelector('[data-testid="online-lobby"]'), null, { timeout: 60_000 });
  }
  expect((await B.getByTestId('room-code').textContent()).trim()).toBe(code);
  await B.waitForSelector('[data-testid="online-ready"]', { timeout: 30_000 });
  await tap(B, 'online-ready');
  await A.waitForFunction(() => { const b = document.querySelector('[data-testid="online-start"]'); return b && !b.disabled; }, null, { timeout: 60_000 });
  await tap(A, 'online-start');
  for (const p of [A, B]) await p.waitForFunction(() => window.TDS.ctrl.online && window.TDS.ctrl.ready && window.TDS.ctrl.match.tick > 60, null, { timeout: 180_000 });
  const firstSeed = a.hash;
  expect(await A.evaluate(() => window.TDS.ctrl.match.towers.length)).toBe(0); // a fresh match
  expect(firstSeed).toBeTruthy();
  expect(errors).toEqual([]);
}

test('co-op (same-browser transport): lobby, lockstep, rematch', async ({ context }) => {
  test.setTimeout(600_000);
  await coopRun(context, 'net=local');
});

test('co-op over the real relay server (server/relay.mjs)', async ({ context }) => {
  test.setTimeout(600_000);
  const port = 8800 + Math.floor(Math.random() * 100);
  const relay = spawn(process.execPath, ['server/relay.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    await expect.poll(async () => (await fetch(`http://localhost:${port}/health`).catch(() => null))?.ok ?? false, { timeout: 20_000 }).toBe(true);
    await coopRun(context, `net=relay&relay=${encodeURIComponent(`ws://localhost:${port}`)}`);
  } finally {
    relay.kill();
  }
});
