// Co-op over the same-browser transport (?net=local): two tabs, the real lobby UI, a match through
// the lockstep session. Both tabs must end on the same tick with the same state hash and towers from
// both players (docs/multiplayer.md). The longer version with screenshots: tools/dev/coop-check.mjs.
import { test, expect } from '@playwright/test';

// two tabs share one window: the background tab must keep running (Chrome stops its frames)
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } });

// DOM click: runs the real UI handler; simulated mouse input starves when two tabs software-render
const tap = (p, id) => p.evaluate((id) => {
  const b = document.querySelector(`[data-testid="${id}"]`);
  if (!b) throw new Error(`no ${id}`);
  if (b.disabled) throw new Error(`${id} is disabled`);
  b.click();
}, id);

async function openOnline(context, name, errors) {
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await p.goto('./?net=local&quality=low');
  await p.waitForFunction(() => window.TDS?.ready && window.TDS.ctrl.hub?.el.open, null, { timeout: 120_000 });
  await tap(p, 'tab-online');
  await p.waitForSelector('[data-testid="online-name"]', { timeout: 60_000 });
  await p.getByTestId('online-name').fill(name);
  return p;
}

test('co-op: create and join a room, start, build from both tabs, stay in lockstep', async ({ context }) => {
  test.setTimeout(600_000);
  const errors = [];
  const A = await openOnline(context, 'Alice', errors);
  const B = await openOnline(context, 'Bob', errors);
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
    for (let d = pid === 'p1' ? 10 : 16; d < path.length; d += 7) {
      const pt = path.pointAt(d, {});
      for (const off of [5, -5, 7, -7]) {
        const x = pt.x + off * pt.dz;
        const z = pt.z - off * pt.dx;
        if (m.validate({ type: 'place', tower, x, z, pid }).ok) return c.command({ type: 'place', tower, x, z }).ok;
      }
    }
    return false;
  }, tower);
  expect(await build(A, 'rifleman')).toBe(true);
  expect(await build(B, 'ember_adept')).toBe(true);
  await A.evaluate(() => window.TDS.ctrl.command({ type: 'skip' }));
  for (const p of [A, B]) await p.waitForFunction(() => window.TDS.ctrl.match.tick > 900, null, { timeout: 300_000 });

  // pause on the host, then both tabs settle on the same tick
  await A.evaluate(() => window.TDS.ctrl.online.session.setPaused(true));
  const state = (p) => p.evaluate(() => {
    const m = window.TDS.ctrl.match;
    return { tick: m.tick, hash: m.hash(), towers: m.towers.map((t) => `${t.uid}:${t.owner}:${t.defId}`).sort() };
  });
  let a;
  let b;
  await expect.poll(async () => { a = await state(A); b = await state(B); return a.tick === b.tick; }, { timeout: 60_000 }).toBe(true);
  expect(b.hash).toBe(a.hash);
  expect(b.towers).toEqual(a.towers);
  expect(a.towers.some((t) => t.includes(':p1:'))).toBe(true);
  expect(a.towers.some((t) => t.includes(':p2:'))).toBe(true);
  expect(errors).toEqual([]);
});
