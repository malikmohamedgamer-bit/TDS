// Shared e2e helpers.
export async function openGame(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`./${query}`);
  await page.waitForFunction(() => window.TDS && window.TDS.ready, null, { timeout: 60_000 });
  // let a few frames render
  await page.waitForFunction(() => window.TDS.stats.fps > 0, null, { timeout: 30_000 });
  return errors;
}

export const hero = (page) => page.evaluate(() => window.TDS.hero);
export const camera = (page) => page.evaluate(() => window.TDS.camera);

/** Hold keys for ms of real time. */
export async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** Camera yaw that makes "W" walk along +X. */
export const YAW_PLUS_X = -Math.PI / 2;

/**
 * Hold keys until predicate(page state) is true or timeout. Software-rendered headless Chromium
 * runs at a few fps, so tests wait for outcomes instead of assuming real-time speeds.
 */
export async function holdUntil(page, keys, predicate, { timeout = 20_000, arg } = {}) {
  for (const k of keys) await page.keyboard.down(k);
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 50 });
    // snapshot while the keys are still held
    return await page.evaluate(() => window.TDS.hero);
  } finally {
    for (const k of keys) await page.keyboard.up(k);
  }
}
