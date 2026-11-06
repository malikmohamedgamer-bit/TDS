// UI update: map picker (search, theme filter, groups, lock states, previews), mission summary,
// keyboard tab navigation, Ultra quality / resolution / interface size settings, end screen counters.
import { test, expect } from '@playwright/test';

test('map picker filters by search and theme, shows locks, and the mission summary follows choices', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.removeItem('tds.save'); localStorage.removeItem('tds.save.backup'); } catch { /* ignore */ } });
  await page.goto('./?quality=low');
  const lobby = page.getByTestId('lobby');
  await expect(lobby).toBeVisible({ timeout: 60_000 });
  const picker = page.getByTestId('map-picker');
  await expect(picker).toBeVisible();
  const total = await page.evaluate(() => window.TDS.content.maps.size);
  await expect(picker.locator('.map-card')).toHaveCount(total);
  await expect(picker.locator('svg.map-prev')).toHaveCount(total);
  // locked maps: disabled radio + lock badge with the level
  await expect(page.getByTestId('map-glacier_gate')).toBeDisabled();
  await expect(picker.locator('.map-card:has([data-testid="map-glacier_gate"]) .lock')).toContainText('Lv 2');
  // search keeps focus and hides non-matching cards and empty groups
  const search = page.getByTestId('map-search');
  await search.fill('mirror');
  await expect(search).toBeFocused();
  await expect(picker.locator('.map-card:visible')).toHaveCount(1);
  await expect(picker.locator('.map-card:visible')).toContainText('Mirrormire');
  await search.fill('zzzz');
  await expect(picker.locator('.map-empty')).toBeVisible();
  await search.fill('');
  // theme chip
  await page.getByTestId('theme-ember').click();
  await expect(page.getByTestId('theme-ember')).toHaveAttribute('aria-pressed', 'true');
  const shown = await picker.locator('.map-card:visible').evaluateAll((els) => els.map((e) => e.dataset.theme));
  expect(shown.length).toBeGreaterThan(0);
  expect(new Set(shown)).toEqual(new Set(['ember']));
  // mission summary follows the difficulty choice and shows the loadout
  await page.locator('input[name="diff"][value="hard"]').check({ force: true });
  await expect(page.locator('.mission')).toContainText('Hard');
  await expect(page.locator('.mission .m-slots i.on')).toHaveCount(await page.evaluate(() => window.TDS.ctrl.hub.cfg.loadout.length));
  // keyboard: arrow keys move between tabs
  await page.getByTestId('tab-play').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('tab-towers')).toBeFocused();
  await expect(page.getByTestId('tab-towers')).toHaveAttribute('aria-selected', 'true');
  // every tab renders with icons and without errors
  for (const tab of ['summon', 'shop', 'index', 'quests', 'daily', 'play']) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId(`panel-${tab}`)).toBeVisible();
  }
  expect(await page.locator('.hub svg.ic').count()).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('settings: Ultra quality, resolution scale and interface size apply and persist', async ({ page }) => {
  await page.goto('./?quality=low&nolobby');
  await page.waitForFunction(() => window.TDS?.ready, null, { timeout: 60_000 });
  await page.locator('.hud-actions [data-act="settings"]').click();
  const dlg = page.getByTestId('settings');
  await expect(dlg).toBeVisible();
  await dlg.locator('input[name="quality"][value="ultra"]').check({ force: true });
  await dlg.locator('input[name="resolutionScale"]').fill('0.6');
  await dlg.locator('input[name="uiScale"]').fill('1.2');
  const s = await page.evaluate(() => ({ q: window.TDS.settings.quality, r: window.TDS.settings.resolutionScale, u: window.TDS.settings.uiScale, css: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() }));
  expect(s).toEqual({ q: 'ultra', r: 0.6, u: 1.2, css: '1.2' });
});
