// Cold-start time: fresh browser contexts (empty cache, no service worker) until window.TDS.ready.
//   node tools/dev/coldload.mjs <url>
import { chromium } from '@playwright/test';
const url = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (let i = 0; i < 2; i++) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let n = 0; page.on('request', () => n++);
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.TDS?.ready, null, { timeout: 180000 });
  console.log(`cold load ${i + 1}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${n} requests`);
  await ctx.close();
}
await browser.close();
