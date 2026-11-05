// Milestone 6: game modes started from the real hub Play tab. Debug hooks only fast-forward the
// simulation (headless software rendering runs at a few fps).
import { test, expect } from '@playwright/test';

async function openHub(page, setup) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.removeItem('tds.save'); localStorage.removeItem('tds.save.backup'); } catch { /* ignore */ } });
  await page.goto('./?quality=low');
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 60_000 });
  if (setup) await page.evaluate(setup);
  await page.evaluate(() => window.TDS.ctrl.hub.render());
  return errors;
}

async function startMode(page, mode) {
  await page.getByTestId(`mode-${mode}`).check({ force: true });
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction((id) => window.TDS.match?.mode.id === id && window.TDS.ctrl.view, mode, { timeout: 60_000 });
}

const win = (page) => page.evaluate(() => { const d = window.TDS.debug; d.killAll(); d.jumpToWave(window.TDS.match.waveCount()); d.fastForward(1); d.killAll(); d.fastForward(2); });

test('locked modes show their unlock level; Endless runs past wave 20 and records the best run', async ({ page }) => {
  const errors = await openHub(page);
  await expect(page.getByTestId('mode-endless')).toBeDisabled();
  await expect(page.getByTestId('mode-boss_rush')).toBeDisabled();
  await page.evaluate(() => { window.TDS.save.profile.level = 4; window.TDS.ctrl.hub.render(); });
  await expect(page.getByTestId('mode-endless')).toBeEnabled();
  await startMode(page, 'endless');
  await expect(page.getByTestId('wave')).toContainText('∞', { timeout: 30_000 });
  await page.evaluate(() => { window.TDS.debug.jumpToWave(30); window.TDS.debug.fastForward(1); });
  const w = await page.evaluate(() => ({ wave: window.TDS.match.wave, boss: window.TDS.match.enemies.some((e) => e.alive && e.def.boss) || window.TDS.match.spawnQueue.some((q) => window.TDS.content.enemies.get(q.enemy)?.boss) }));
  expect(w.wave).toBe(30);
  expect(w.boss).toBe(true);
  await page.evaluate(() => { window.TDS.debug.setBaseHp(1); window.TDS.debug.fastForward(120); });
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('end')).toContainText('Endless: you survived');
  expect(await page.evaluate(() => window.TDS.save.progress.bestEndless.riftline)).toBeGreaterThanOrEqual(29);
  expect(errors).toEqual([]);
});

test('Sandbox: every tower, free building, Next wave any time, no rewards', async ({ page }) => {
  const errors = await openHub(page);
  await page.getByTestId('mode-sandbox').check({ force: true });
  // every tower is usable in Sandbox, even ones the save does not own
  const gs = page.locator('[data-tower="gunship"]');
  await expect(gs).not.toHaveAttribute('aria-disabled', 'true');
  await gs.click();
  await expect(gs).toHaveAttribute('aria-pressed', 'true');
  await startMode(page, 'sandbox');
  await expect(page.getByTestId('slot-gunship')).toBeVisible();
  const cash0 = await page.evaluate(() => window.TDS.match.cash);
  const placed = await page.evaluate(() => {
    const m = window.TDS.match;
    for (let x = -20; x <= 20; x += 2) for (let z = -20; z <= 20; z += 2) if (m.canPlace('gunship', x, z).ok) return window.TDS.ctrl.command({ type: 'place', tower: 'gunship', x, z });
    return { ok: false, reason: 'no spot' };
  });
  expect(placed.ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.TDS.match.towers.length)).toBe(1);
  expect(await page.evaluate(() => window.TDS.match.cash)).toBe(cash0);
  await page.getByTestId('skip').click();
  await expect.poll(() => page.evaluate(() => window.TDS.match.wave)).toBe(1);
  await page.getByTestId('skip').click();
  await expect.poll(() => page.evaluate(() => window.TDS.match.wave)).toBe(2);
  const crowns = await page.evaluate(() => window.TDS.save.wallet.crowns);
  await win(page);
  await expect(page.getByTestId('end')).toContainText('Victory', { timeout: 30_000 });
  await expect(page.getByTestId('rewards')).toContainText('Sandbox: no rewards');
  expect(await page.evaluate(() => window.TDS.save.wallet.crowns)).toBe(crowns);
  expect(await page.evaluate(() => window.TDS.save.stats.wins || 0)).toBe(0);
  expect(errors).toEqual([]);
});

test('Daily Challenge: fixed difficulty, modifiers and loaners; reward once per day', async ({ page }) => {
  const errors = await openHub(page);
  await page.getByTestId('mode-daily').check({ force: true });
  const card = page.getByTestId('daily-challenge');
  await expect(card).toContainText('Easy (fixed)');
  const dc = await page.evaluate(() => { const h = window.TDS.ctrl.hub; return window.TDS.dailyChallenge(h.date()); });
  for (const id of dc.modifiers) await expect(card).toContainText(await page.evaluate((m) => window.TDS.content.modifiers.get(m).name, id));
  await expect(page.locator('input[name="diff"][value="normal"]')).toBeDisabled();
  expect(await page.evaluate(() => window.TDS.ctrl.hub.cfg.loadout)).toEqual(dc.loadout);
  // the loadout cannot be edited
  const other = await page.evaluate((lo) => [...window.TDS.content.towers.keys()].find((id) => !lo.includes(id)), dc.loadout);
  await page.locator(`[data-tower="${other}"]`).click();
  expect(await page.evaluate(() => window.TDS.ctrl.hub.cfg.loadout)).toEqual(dc.loadout);
  await page.locator('[name="tutorial"]').uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match?.mode.id === 'daily' && window.TDS.ctrl.view, null, { timeout: 60_000 });
  const m = await page.evaluate(() => { const x = window.TDS.match; return { diff: x.difficulty.id, mods: x.modifiers.map((o) => o.id), levels: x.loadout.map((id) => x.levels[id]) }; });
  expect(m.diff).toBe('easy');
  expect(m.mods).toEqual(dc.modifiers);
  expect(new Set(m.levels)).toEqual(new Set(Object.values(dc.levels)));
  await win(page);
  await expect(page.getByTestId('rewards')).toContainText('Daily challenge complete!', { timeout: 30_000 });
  await page.getByTestId('again').click();
  await page.waitForFunction(() => window.TDS.match?.phase !== 'won' && window.TDS.ctrl.view, null, { timeout: 60_000 });
  await win(page);
  await expect(page.getByTestId('end')).toContainText('Victory', { timeout: 30_000 });
  await expect(page.getByTestId('rewards')).not.toContainText('Daily challenge complete!');
  expect(errors).toEqual([]);
});

test('Boss Rush, Time Attack and Challenge start from the hub with their rules', async ({ page }) => {
  const errors = await openHub(page, () => { window.TDS.save.profile.level = 4; });
  // Challenge: picking modifiers raises the shown reward multiplier and applies to the match
  await page.getByTestId('mode-challenge').check({ force: true });
  await page.locator('[name="mod"][value="tough"]').check();
  await page.locator('[name="mod"][value="horde"]').check();
  await expect(page.getByTestId('lobby')).toContainText('reward x1.76');
  await startMode(page, 'challenge');
  expect(await page.evaluate(() => window.TDS.match.modifiers.map((o) => o.id).sort())).toEqual(['horde', 'tough']);
  await page.evaluate(() => { window.TDS.ctrl.toLobby(); });
  // Boss Rush: every wave has a boss, bigger starting cash
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 30_000 });
  await startMode(page, 'boss_rush');
  const br = await page.evaluate(() => { const m = window.TDS.match; return { cash: m.cash, boss: m.waveDef(1).groups.some((g) => window.TDS.content.enemies.get(g.enemy).boss) }; });
  expect(br.boss).toBe(true);
  expect(br.cash).toBeGreaterThan(1000);
  await page.evaluate(() => { window.TDS.ctrl.toLobby(); });
  // Time Attack: the timer shows elapsed time during a wave
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 30_000 });
  await startMode(page, 'time_attack');
  await page.getByTestId('skip').click();
  await expect(page.getByTestId('timer')).toContainText('⏱', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
