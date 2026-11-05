// Milestone 7: second map picked from the hub, legendary towers and the second boss render.
import { test, expect } from '@playwright/test';

test('Frostmere unlocks at level 3, the hub travels there, its two roads and new content work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('kept')) { localStorage.removeItem('tds.save'); localStorage.removeItem('tds.save.backup'); } } catch { /* ignore */ } });
  await page.goto('./?quality=low');
  const lobby = page.getByTestId('lobby');
  await expect(lobby).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('map-frostmere')).toBeDisabled();
  await page.evaluate(() => { window.TDS.save.profile.level = 3; window.TDS.ctrl.persist(); sessionStorage.setItem('kept', '1'); window.TDS.ctrl.hub.render(); });
  await expect(page.getByTestId('map-frostmere')).toBeEnabled();
  await Promise.all([page.waitForURL(/map=frostmere/), page.getByTestId('map-frostmere').check({ force: true })]);
  await page.waitForFunction(() => window.TDS?.ready, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.TDS.map.id)).toBe('frostmere');
  await expect(lobby).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('map-frostmere')).toBeChecked();
  // the Daily Challenge is measured on Riftline and stays there
  await expect(page.getByTestId('mode-daily')).toBeDisabled();
  await expect(lobby).toContainText('Played on Riftline Valley');
  // Sandbox on Frostmere: both legendary towers and the Thornmother render without errors
  await page.getByTestId('mode-sandbox').check({ force: true });
  for (const id of ['titan_railgun', 'starfall_oracle']) await page.locator(`[data-tower="${id}"]`).click();
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match?.mode.id === 'sandbox' && window.TDS.ctrl.view, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.TDS.match.paths.length)).toBe(2);
  const placed = await page.evaluate(() => {
    const m = window.TDS.match;
    const out = [];
    for (const id of ['titan_railgun', 'starfall_oracle']) {
      let done = false;
      for (let x = 0; x <= 30 && !done; x += 2) for (let z = -16; z <= 16 && !done; z += 2) if (m.canPlace(id, x, z).ok) { out.push(window.TDS.ctrl.command({ type: 'place', tower: id, x, z }).ok); done = true; }
    }
    return out;
  });
  expect(placed).toEqual([true, true]);
  await page.evaluate(() => { const m = window.TDS.match; const b = m.spawnEnemy('thornmother', { pathIdx: 1, d: 120 }); b.baseSpeed = 0.3; m.command({ type: 'skip' }); });
  // enemies come down both roads
  await page.evaluate(() => window.TDS.debug.fastForward(12));
  const roads = await page.evaluate(() => new Set(window.TDS.match.enemies.filter((e) => e.alive).map((e) => window.TDS.match.paths.indexOf(e.path))).size);
  expect(roads).toBe(2);
  await page.evaluate(() => window.TDS.debug.fastForward(10));
  const dmg = await page.evaluate(() => window.TDS.match.stats.damage);
  expect(dmg).toBeGreaterThan(0);
  // a few rendered frames with everything on screen
  const t0 = await page.evaluate(() => window.TDS.simTime);
  await page.waitForFunction((t) => window.TDS.simTime > t + 1, t0, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
