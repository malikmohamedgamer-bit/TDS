// Milestone 4: the playable match. Real mouse clicks for placing / selecting; debug hooks only to
// fast-forward time (headless software rendering runs at a few fps).
import { test, expect } from '@playwright/test';

async function startMatch(page, { tutorial = false, difficulty = 'normal', clearSave = true } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (clearSave) await page.addInitScript(() => { try { if (!sessionStorage.getItem('kept')) { localStorage.removeItem('tds.save'); localStorage.removeItem('tds.save.backup'); } } catch { /* ignore */ } });
  await page.goto('./?quality=low');
  const lobby = page.getByTestId('lobby');
  await expect(lobby).toBeVisible({ timeout: 60_000 });
  await lobby.locator(`input[name="diff"][value="${difficulty}"]`).check({ force: true });
  const tut = lobby.locator('[name="tutorial"]');
  if (tutorial) await tut.check(); else await tut.uncheck();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.TDS.match && window.TDS.ctrl.view, null, { timeout: 60_000 });
  return errors;
}
const towers = (page) => page.evaluate(() => window.TDS.match.towers.length);
/** Wait until the camera stops easing (projection must not change between measure and click). */
async function cameraStill(page) {
  await page.waitForFunction(() => {
    const c = window.TDS.camera;
    const prev = window.__camPrev;
    window.__camPrev = c;
    return prev && Math.hypot(c.x - prev.x, c.y - prev.y, c.z - prev.z) < 0.01;
  }, null, { timeout: 30_000, polling: 150 });
}
async function clickGround(page, x, z) {
  await cameraStill(page);
  const p = await page.evaluate(([x, z]) => window.TDS.toScreen(x, window.TDS.groundAt(x, z), z), [x, z]);
  expect(p.visible).toBe(true);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}
const settle = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

test('place towers by clicking from three camera angles; they attack, earn cash, clear a wave', async ({ page }) => {
  const errors = await startMatch(page);
  await page.evaluate(() => window.TDS.debug.setCash(5000));
  // 1) third-person orbit
  await page.evaluate(() => { window.TDS.teleport(-4, 2); window.TDS.setDistance(14); window.TDS.lookAt(-10, -12, 0.6); });
  await settle(page, 4);
  await page.keyboard.press('Digit1');
  await clickGround(page, -10, -12);
  await expect.poll(() => towers(page)).toBe(1);
  // 2) overview (top-down)
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => window.TDS.camera.mode === 'top' && window.TDS.camera.y > 50, null, { timeout: 30_000 });
  await page.keyboard.press('Digit2');
  await clickGround(page, -10, 0);
  await expect.poll(() => towers(page)).toBe(2);
  // 3) first person: the click goes through the crosshair (screen centre)
  await page.keyboard.press('KeyC');
  await page.evaluate(() => { window.TDS.teleport(0, -6); window.TDS.setCamera('first'); window.TDS.lookAt(-4, -6, 0.6); });
  await settle(page, 4);
  await page.keyboard.press('Digit1');
  await settle(page, 2);
  const box = await page.locator('#scene').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => towers(page)).toBe(3);
  await page.evaluate(() => window.TDS.setCamera('orbit'));
  // invalid placement on the road is refused with a reason
  await page.keyboard.press('Digit1');
  await page.evaluate(() => { window.TDS.teleport(-4, 2); window.TDS.lookAt(-14, -4, 0.6); });
  await settle(page, 4);
  const road = await page.evaluate(() => window.TDS.toScreen(-14, window.TDS.groundAt(-14, -4), -4));
  await page.mouse.move(road.x, road.y);
  await settle(page, 3);
  await expect(page.getByTestId('place-hint')).toContainText('road');
  await page.mouse.click(road.x, road.y);
  expect(await towers(page)).toBe(3);
  await page.keyboard.press('Escape');

  // start the wave; towers attack; kills earn cash; the wave clears and its bonus is paid
  const cash0 = await page.evaluate(() => window.TDS.match.cash);
  await page.getByTestId('skip').click();
  await page.evaluate(() => window.TDS.debug.fastForward(45));
  const st = await page.evaluate(() => { const m = window.TDS.match; return { kills: m.stats.kills, damage: m.stats.damage, cash: m.cash, paid: m.paidWaves, wave: m.wave }; });
  expect(st.damage).toBeGreaterThan(0);
  expect(st.kills).toBeGreaterThan(0);
  expect(st.cash).toBeGreaterThan(cash0);
  await page.evaluate(() => window.TDS.debug.fastForward(30));
  expect(await page.evaluate(() => window.TDS.match.paidWaves)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('select a tower by clicking it, upgrade, choose a branch and evolve it', async ({ page }) => {
  await startMatch(page);
  await page.evaluate(() => { window.TDS.debug.setCash(20000); window.TDS.ctrl.command({ type: 'place', tower: 'rifleman', x: -10, z: -12 }); });
  await page.evaluate(() => { window.TDS.teleport(-4, -6); window.TDS.setDistance(12); window.TDS.lookAt(-10, -12, 0.55); });
  await expect.poll(() => towers(page)).toBe(1);
  await settle(page, 5);
  const p = await page.evaluate(() => { const t = window.TDS.match.towers[0]; return window.TDS.toScreen(t.x, t.y + 1.2, t.z); });
  await page.mouse.click(p.x, p.y);
  const panel = page.getByTestId('tower-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('tower-name')).toHaveText('Rifleman');
  await page.getByTestId('upgrade').click();
  await expect.poll(() => page.evaluate(() => window.TDS.match.towers[0].up.linear)).toBe(1);
  await page.keyboard.press('KeyU');
  await expect.poll(() => page.evaluate(() => window.TDS.match.towers[0].up.linear)).toBe(2);
  await page.getByTestId('branch-A').click();
  await expect.poll(() => page.evaluate(() => window.TDS.match.towers[0].up.branch)).toBe('A');
  await page.getByTestId('upgrade').click();
  await expect(page.getByTestId('tower-name')).toHaveText('Commando');
  expect(await page.evaluate(() => window.TDS.match.towers[0].evolved)).toBe(true);
  // targeting mode
  await panel.getByRole('radio', { name: 'Strongest' }).click();
  await expect.poll(() => page.evaluate(() => window.TDS.match.towers[0].targeting)).toBe('strongest');
  // sell needs a confirm click
  await page.getByTestId('sell').click();
  await page.getByTestId('sell').click();
  await expect.poll(() => towers(page)).toBe(0);
});

test('boss wave shows the boss bar; abilities fire; victory grants rewards once and survives reload', async ({ page }) => {
  await startMatch(page);
  await page.evaluate(() => window.TDS.debug.setCash(20000));
  await page.evaluate(() => window.TDS.debug.jumpToWave(10));
  await page.evaluate(() => window.TDS.debug.fastForward(2));
  await expect(page.getByTestId('bossbar')).toBeVisible();
  await expect(page.getByTestId('bossbar')).toContainText('Gravemaw');
  // airstrike through the UI: aim mode, then click the ground
  await page.evaluate(() => { window.TDS.teleport(-24, -10); window.TDS.setDistance(12); window.TDS.lookAt(-30, -18, 0.75); });
  await settle(page, 4);
  await page.keyboard.press('KeyX');
  await clickGround(page, -30, -18);
  await expect.poll(() => page.evaluate(() => window.TDS.match.abilities.find((a) => a.id === 'airstrike').ready > window.TDS.match.time)).toBe(true);
  // jump to the final wave and win
  await page.evaluate(() => { window.TDS.debug.killAll(); window.TDS.debug.jumpToWave(20); window.TDS.debug.fastForward(1); window.TDS.debug.killAll(); window.TDS.debug.fastForward(2); });
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('end')).toContainText('Victory');
  await expect(page.getByTestId('rewards')).toContainText('Crowns');
  const crowns = await page.evaluate(() => window.TDS.save.wallet.crowns);
  expect(crowns).toBeGreaterThan(0);
  await page.evaluate(() => sessionStorage.setItem('kept', '1'));
  await page.reload();
  await page.waitForFunction(() => window.TDS?.ready);
  expect(await page.evaluate(() => window.TDS.save.wallet.crowns)).toBe(crowns);
  expect(await page.evaluate(() => window.TDS.save.stats.wins)).toBe(1);
});

test('losing: the keep falls and the defeat screen appears', async ({ page }) => {
  await startMatch(page, { difficulty: 'hard' });
  await page.evaluate(() => { window.TDS.debug.setBaseHp(2); window.TDS.ctrl.command({ type: 'skip' }); window.TDS.debug.fastForward(80); });
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('end')).toContainText('Defeat');
});

test('tutorial advances on real actions and can be skipped', async ({ page }) => {
  await startMatch(page, { tutorial: true });
  const tut = page.getByTestId('tutorial');
  await expect(tut).toBeVisible();
  await expect(tut).toHaveAttribute('data-step', 'walk');
  await page.keyboard.down('KeyW');
  await expect(tut).toHaveAttribute('data-step', 'look', { timeout: 30_000 });
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.TDS.setView(window.TDS.camera.yaw + 1));
  await expect(tut).toHaveAttribute('data-step', 'pick', { timeout: 30_000 });
  // the control each step talks about glows
  await expect(page.locator('[data-testid="hotbar"] .slot').first()).toHaveClass(/tut-glow/);
  await page.keyboard.press('Digit1');
  await expect(tut).toHaveAttribute('data-step', 'place', { timeout: 30_000 });
  await expect(page.locator('[data-testid="hotbar"] .slot').first()).not.toHaveClass(/tut-glow/);
  await page.evaluate(() => window.TDS.ctrl.command({ type: 'place', tower: window.TDS.match.loadout[0], x: -10, z: -12 }));
  await expect(tut).toHaveAttribute('data-step', 'wave', { timeout: 30_000 });
  await expect(page.getByTestId('skip')).toHaveClass(/tut-glow/);
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(tut).toBeHidden();
  expect(await page.evaluate(() => window.TDS.save.progress.tutorialDone)).toBe(true);
});

test('tuning preset and assists from settings: skip-wave button, flagged results', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('tds.save');
      localStorage.setItem('tds.settings.v1', JSON.stringify({ tuningPreset: 'relaxed', assistSkipWave: true, assistExtraCash: true }));
    } catch { /* ignore */ }
  });
  await startMatch(page, { clearSave: false });
  const info = await page.evaluate(() => ({ preset: window.TDS.match.tune.id, cash: window.TDS.match.cash, assisted: window.TDS.match.tune.assisted }));
  expect(info.preset).toBe('relaxed');
  expect(info.assisted).toBe(true);
  expect(info.cash).toBeGreaterThan(1000);
  await page.getByTestId('skip').click();
  await expect(page.getByTestId('assist-skip')).toBeVisible();
  await page.getByTestId('assist-skip').click();
  await expect.poll(() => page.evaluate(() => window.TDS.match.wave)).toBe(2);
  await page.evaluate(() => { window.TDS.debug.killAll(); window.TDS.debug.jumpToWave(20); window.TDS.debug.fastForward(1); window.TDS.debug.killAll(); window.TDS.debug.fastForward(2); });
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('assisted')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.TDS.save.progress.best).length)).toBe(0);
});
