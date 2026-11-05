// Touch controls on an emulated phone: joystick walks, buttons jump and switch cameras.
import { test, expect } from '@playwright/test';
import { openGame, hero, camera } from './util.js';

test('virtual joystick, jump button and camera buttons work on a phone', async ({ page }) => {
  await openGame(page, '?quality=low');
  const joy = page.getByTestId('joystick');
  await expect(joy).toBeVisible();
  const box = await joy.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);

  const cdp = await page.context().newCDPSession(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const a = await hero(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - 60, id: 1 }] });
  await page.waitForFunction((p) => Math.hypot(window.TDS.hero.x - p.x, window.TDS.hero.z - p.z) > 2.5, { x: a.x, z: a.z }, { timeout: 20_000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const b = await hero(page);
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(2.5);

  // every on-screen button is a 44px+ target
  const sizes = await page.$$eval('.touch-ui.on button', (els) => els.filter((e) => e.offsetParent).map((e) => [e.offsetWidth, e.offsetHeight]));
  expect(sizes.length).toBeGreaterThan(3);
  for (const [w, h] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }

  const y0 = (await hero(page)).y;
  await page.getByRole('button', { name: 'Jump' }).tap();
  await page.waitForFunction((y) => window.TDS.hero.y > y + 0.4, y0, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Overview' }).tap();
  await expect.poll(async () => (await camera(page)).mode).toBe('top');
  await page.getByRole('button', { name: 'Return to character' }).tap();
  await expect.poll(async () => (await camera(page)).mode).toBe('orbit');

  // drag on the scene to look around
  const yaw0 = (await camera(page)).yaw;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 2 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 20, y: 300, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction((y) => Math.abs(window.TDS.camera.yaw - y) > 0.1, yaw0, { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/m1-phone.png' });
});
