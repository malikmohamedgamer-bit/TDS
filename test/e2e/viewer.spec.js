// Asset viewer: every GLB loads in the engine with its animations, views switch.
import { test, expect } from '@playwright/test';

test('asset viewer loads every GLB (Blender and recoloured packs); animated ones play their clips', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./viewer.html?quality=low');
  await page.waitForFunction(() => window.VIEWER?.ready, null, { timeout: 60_000 });
  const ids = await page.evaluate(() => window.VIEWER.assets.filter((a) => a.startsWith('glb:')));
  expect(ids.length).toBeGreaterThanOrEqual(6);
  const manifest = (await (await page.request.get('./data/models.json')).json()).models;
  for (const id of ids) {
    const info = await page.evaluate((id) => window.VIEWER.select(id), id);
    expect(info.tris).toBeGreaterThan(50);
    expect(Math.max(...info.size)).toBeGreaterThan(0.5);
    const m = manifest[id.slice(4)];
    if (m.clips) {
      // every mapped clip exists in the file
      for (const c of Object.values(m.clips)) expect(info.clips).toContain(c);
      expect(await page.evaluate((c) => window.VIEWER.play(c), info.clips[info.clips.length - 1])).toBe(true);
    } else expect(m.motion || m.kind === 'tower').toBeTruthy();
  }
  for (const v of ['front', 'back', 'right', 'top']) await page.getByRole('button', { name: v, exact: true }).click();
  await expect(page.getByRole('button', { name: 'top', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
