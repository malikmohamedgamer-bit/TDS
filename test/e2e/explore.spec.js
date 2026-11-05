// Milestone 1: load, walk, sprint, jump, collision, bounds, camera modes.
import { test, expect } from '@playwright/test';
import { openGame, hero, camera, holdUntil, YAW_PLUS_X } from './util.js';

test.describe('exploration', () => {
  test('loads the map without errors and shows the HUD', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('#scene')).toBeVisible();
    await expect(page.getByTestId('map-name')).toHaveText('Riftline Valley');
    await expect(page.getByTestId('camera-mode')).toContainText('Third person');
    const info = await page.evaluate(() => ({ map: window.TDS.map, stats: window.TDS.stats }));
    expect(info.map.props).toBeGreaterThan(150);
    expect(info.stats.calls).toBeGreaterThan(10);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/m1-load.png' });
  });

  test('walks, sprints faster than walking, and jumps', async ({ page }) => {
    await openGame(page, '?quality=low');
    await page.evaluate((y) => { window.TDS.teleport(-4, -2); window.TDS.setView(y, 0.4); }, YAW_PLUS_X);
    await page.locator('#scene').focus();
    const a = await hero(page);
    const b = await holdUntil(page, ['KeyW'], (x0) => window.TDS.hero.x > x0 + 3, { arg: a.x });
    const walkSpeed = b.hSpeed;
    expect(Math.abs(b.z - a.z)).toBeLessThan(0.5);
    expect(walkSpeed).toBeGreaterThan(5);

    await page.evaluate(() => window.TDS.teleport(-4, -2));
    const sprint = await holdUntil(page, ['ShiftLeft', 'KeyW'], () => window.TDS.hero.x > -4 + 3);
    expect(sprint.sprinting).toBe(true);
    expect(sprint.hSpeed).toBeGreaterThan(walkSpeed * 1.3);

    const before = await hero(page);
    await holdUntil(page, ['Space'], (y0) => window.TDS.hero.y > y0 + 0.6, { arg: before.y });
    await page.waitForFunction(() => window.TDS.hero.grounded && window.TDS.hero.vy === 0, null, { timeout: 20_000 });
    expect((await hero(page)).jumps).toBeGreaterThanOrEqual(1);
  });

  test('never walks through solid props (watchtower, crate stack, keep)', async ({ page }) => {
    await openGame(page, '?quality=low');
    // record any overlap on every animation frame while walking straight at each obstacle
    await page.evaluate(() => {
      window.__overlaps = 0;
      const tick = () => { if (window.TDS.insideSolid()) window.__overlaps++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const runs = [
      { from: [31, 9], kind: 'watchtower' },
      { from: [14, 8], kind: 'crate_stack' },
      { from: [40, -4], kind: 'base_keep' },
    ];
    for (const r of runs) {
      await page.evaluate(([x, z, y]) => { window.TDS.teleport(x, z); window.TDS.setView(y, 0.4); }, [...r.from, YAW_PLUS_X]);
      const t0 = await page.evaluate(() => window.TDS.simTime);
      await holdUntil(page, ['KeyW'], (t) => window.TDS.simTime > t + 3, { arg: t0, timeout: 60_000 });
    }
    expect(await page.evaluate(() => window.__overlaps)).toBe(0);
    const h = await hero(page);
    expect(h.rescues).toBe(0);
    // walking up the road into the keep gate must stop at its wall (x = 50.5 - 3.4)
    expect(h.x).toBeLessThan(47.1 - 0.4);
  });

  test('cannot leave the map', async ({ page }) => {
    await openGame(page, '?quality=low');
    const bounds = await page.evaluate(() => window.TDS.map.bounds);
    await page.evaluate((y) => { window.TDS.teleport(30, -16); window.TDS.setView(y, 0.4); }, YAW_PLUS_X);
    // keep pushing against the edge until the hero has been stopped there
    await holdUntil(page, ['ShiftLeft', 'KeyW'], (mx) => window.TDS.hero.x > mx - 1 && window.TDS.hero.hSpeed < 0.5, { arg: bounds.maxX, timeout: 40_000 });
    const h = await hero(page);
    expect(h.x).toBeLessThanOrEqual(bounds.maxX);
    expect(h.y).toBeGreaterThan(-1);
    const ground = await page.evaluate(([x, z]) => window.TDS.groundAt(x, z), [h.x, h.z]);
    expect(h.y).toBeGreaterThanOrEqual(ground - 0.05);
  });

  test('camera modes: first person, free fly, overview, back to character', async ({ page }) => {
    await openGame(page, '?quality=low');
    await page.locator('#scene').focus();
    await page.keyboard.press('KeyV');
    await expect.poll(async () => (await camera(page)).mode).toBe('first');
    const h = await hero(page);
    const cf = await camera(page);
    expect(Math.hypot(cf.x - h.x, cf.z - h.z)).toBeLessThan(0.2);
    await page.screenshot({ path: 'test-results/m1-first-person.png' });

    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await camera(page)).mode).toBe('free');
    const f0 = await camera(page);
    await holdUntil(page, ['KeyE'], (y0) => window.TDS.camera.y > y0 + 2, { arg: f0.y });
    const f1 = await camera(page);
    await holdUntil(page, ['KeyW'], (p) => Math.hypot(window.TDS.camera.x - p.x, window.TDS.camera.z - p.z) > 2, { arg: { x: f1.x, z: f1.z } });
    const heroStill = await hero(page);
    expect(Math.hypot(heroStill.x - h.x, heroStill.z - h.z)).toBeLessThan(0.3);

    await page.keyboard.press('KeyT');
    await expect.poll(async () => (await camera(page)).mode).toBe('top');
    await page.waitForFunction(() => window.TDS.camera.y > 50, null, { timeout: 20_000 });
    const top = await camera(page);
    expect(top.y).toBeGreaterThan(50);
    await page.screenshot({ path: 'test-results/m1-overview.png' });

    await page.keyboard.press('KeyC');
    await expect.poll(async () => (await camera(page)).mode).toBe('orbit');
    await page.waitForTimeout(2500);
    const o = await camera(page);
    const h2 = await hero(page);
    expect(Math.hypot(o.x - h2.x, o.z - h2.z)).toBeLessThan(14);
  });

  test('settings dialog opens, changes quality and persists', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const dlg = page.getByTestId('settings');
    await expect(dlg).toBeVisible();
    await dlg.getByText('High', { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    expect(await page.evaluate(() => window.TDS.settings.quality)).toBe('high');
    await page.reload();
    await page.waitForFunction(() => window.TDS && window.TDS.ready);
    expect(await page.evaluate(() => window.TDS.settings.quality)).toBe('high');
  });
});
