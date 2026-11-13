// Two fresh browsers on the live site: one creates a co-op room, the other joins by code over
// Supabase; both must list two players. node tools/dev/live-coop-check.mjs [url]
import { chromium } from '@playwright/test';
const url = process.argv[2] || 'https://malikmohamedgamer-bit.github.io/TDS/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const open = async (name) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${url}?quality=low`);
  await p.waitForFunction(() => window.TDS?.ready && window.TDS.ctrl.hub?.el.open, null, { timeout: 120000 });
  await p.evaluate(() => document.querySelector('[data-testid="tab-online"]').click());
  await p.waitForSelector('[data-testid="online-name"]', { timeout: 60000 });
  await p.getByTestId('online-name').fill(name);
  return p;
};
try {
  const A = await open('LiveA');
  const B = await open('LiveB');
  console.log('title:', await A.title());
  await A.evaluate(() => document.querySelector('[data-testid="online-create"]').click());
  const code = (await A.getByTestId('room-code').textContent({ timeout: 60000 })).trim();
  await B.getByTestId('online-code').fill(code);
  await B.evaluate(() => document.querySelector('[data-testid="online-join"]').click());
  for (const p of [A, B]) await p.waitForFunction(() => document.querySelectorAll('[data-testid="online-player"]').length === 2, null, { timeout: 60000 });
  console.log(`room ${code}: both players see 2 members (separate browsers: only the network can connect them)`);
} catch (err) {
  console.log('FAILED:', err.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await browser.close();
}
