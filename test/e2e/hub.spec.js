// Milestone 5: lobby hub (meta progression) through the real UI.
import { test, expect } from '@playwright/test';

async function openHub(page, setup) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('kept')) { localStorage.removeItem('tds.save'); localStorage.removeItem('tds.save.backup'); } } catch { /* ignore */ } });
  await page.goto('./?quality=low');
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 60_000 });
  if (setup) await page.evaluate(setup);
  await page.evaluate(() => window.TDS.ctrl.hub.render());
  return errors;
}

test('locked towers cannot join the loadout; shop unlocks one; permanent level up evolves', async ({ page }) => {
  const errors = await openHub(page, () => { window.TDS.save.wallet.crowns = 50000; });
  await expect(page.getByTestId('crowns')).toContainText('50,000');
  const locked = page.locator('[data-tower="gunship"]');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await locked.click({ force: true });
  await expect(locked).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('tab-shop').click();
  await page.getByTestId('buy-gunship').click();
  expect(await page.evaluate(() => !!window.TDS.save.towers.owned.gunship)).toBe(true);
  await page.getByTestId('tab-towers').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('levelup-rifleman').click();
  expect(await page.evaluate(() => window.TDS.save.towers.owned.rifleman.level)).toBe(5);
  await expect(page.getByTestId('trow-rifleman')).toContainText('Veteran Rifleman');
  // persisted
  await page.evaluate(() => sessionStorage.setItem('kept', '1'));
  await page.reload();
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.TDS.save.towers.owned.rifleman.level)).toBe(5);
  expect(errors).toEqual([]);
});

test('slot-machine summon: spends sigils, can be skipped, unlocks or refunds; results saved', async ({ page }) => {
  await openHub(page, () => { window.TDS.save.wallet.sigils = 2000; });
  await page.getByTestId('tab-summon').click();
  await expect(page.getByTestId('slot-machine')).toBeVisible();
  const owned0 = await page.evaluate(() => Object.keys(window.TDS.save.towers.owned).length);
  await page.getByTestId('pull-10').click();
  await page.getByTestId('skip-anim').click();
  const reveal = page.getByTestId('reveal');
  // epic+ results show a reveal; continue through any of them
  for (let i = 0; i < 10 && await reveal.isVisible().catch(() => false); i++) await reveal.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('pull-results')).toContainText('Results', { timeout: 30_000 });
  const s = await page.evaluate(() => ({ sigils: window.TDS.save.wallet.sigils, pulls: window.TDS.save.summon.pulls, owned: Object.keys(window.TDS.save.towers.owned).length }));
  expect(s.sigils).toBe(2000 - 900);
  expect(s.pulls).toBe(10);
  expect(s.owned).toBeGreaterThanOrEqual(owned0);
});

test('daily reward and quests claim once; speed 2x is locked at level 1', async ({ page }) => {
  await openHub(page);
  await page.getByTestId('tab-daily').click();
  const sig0 = await page.evaluate(() => window.TDS.save.wallet.sigils + window.TDS.save.wallet.crowns);
  await page.getByTestId('claim-daily').click();
  await expect(page.getByTestId('claim-daily')).toBeDisabled();
  expect(await page.evaluate(() => window.TDS.save.wallet.sigils + window.TDS.save.wallet.crowns)).toBeGreaterThan(sig0);
  await page.evaluate(() => { window.TDS.save.stats.summons = 10; window.TDS.ctrl.hub.render(); });
  await page.getByTestId('tab-quests').click();
  const q = page.getByTestId('quest-s_summon_10');
  await q.getByRole('button', { name: 'Claim' }).click();
  await expect(q).toContainText('Claimed');
  // speed: only slow speeds before level 3
  await page.getByTestId('tab-play').click();
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  const seen = [];
  for (let i = 0; i < 4; i++) { await page.getByTestId('speed').click(); seen.push(await page.evaluate(() => window.TDS.ctrl.speed)); }
  expect(Math.max(...seen)).toBeLessThan(2);
});
