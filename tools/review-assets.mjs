// node tools/review-assets.mjs [outDir] [--only id,id]
// Opens viewer.html headlessly and writes one contact sheet per asset: front, back, side, top,
// three-quarter, plus a mid-animation frame. Software rendering (SwiftShader): looks, not speed.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'docs/screenshots/assets';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
mkdirSync(out, { recursive: true });
const PORT = 5197;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEWS = ['front', 'back', 'right', 'top', 'three_quarter'];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/viewer.html`);
  await page.waitForFunction(() => window.VIEWER?.ready, null, { timeout: 90_000 });
  await page.addStyleTag({ content: '.v-list,.v-info,.v-views{display:none!important}' });
  let ids = await page.evaluate(() => window.VIEWER.assets.filter((a) => a.startsWith('glb:') || a.startsWith('hero:')));
  if (only) ids = ids.filter((id) => only.some((o) => id.endsWith(o)));
  const sheet = await browser.newPage({ viewport: { width: 1290, height: 690 } });
  for (const id of ids) {
    const info = await page.evaluate((id) => window.VIEWER.select(id), id);
    const shots = [];
    const settle = async () => { const f = await page.evaluate(() => window.VIEWER.frames); await page.waitForFunction((f) => window.VIEWER.frames > f + 3, f); };
    for (const v of VIEWS) {
      await page.evaluate((v) => window.VIEWER.setView(v), v);
      await settle();
      shots.push({ label: v.replace('_', ' '), data: (await page.screenshot({ type: 'png' })).toString('base64') });
    }
    const move = info.clips.find((c) => /walk|fly/i.test(c)) || info.clips.find((c) => /attack/i.test(c));
    if (move) {
      await page.evaluate(([v, c]) => { window.VIEWER.setView(v); window.VIEWER.play(c); }, ['three_quarter', move]);
      await page.waitForTimeout(450);
      await settle();
      shots.push({ label: `anim: ${move}`, data: (await page.screenshot({ type: 'png' })).toString('base64') });
    }
    const html = `<body style="margin:0;background:#12141c;font:600 15px Segoe UI,sans-serif;color:#f4f6fb">
      <div style="padding:8px 12px">${id} - ${info.tris} triangles - ${info.size.map((n) => n.toFixed(2)).join(' x ')} m - clips: ${info.clips.join(', ') || 'none'}</div>
      <div style="display:grid;grid-template-columns:repeat(3,428px);gap:2px">${shots.map((s) => `<figure style="margin:0;position:relative"><img src="data:image/png;base64,${s.data}" style="width:428px;display:block"><figcaption style="position:absolute;left:6px;top:4px;background:#000a;padding:2px 6px;border-radius:4px">${s.label}</figcaption></figure>`).join('')}</div></body>`;
    await sheet.setContent(html);
    const file = `${out}/${id.replace(/[:]/g, '-')}.png`;
    await sheet.screenshot({ path: file, fullPage: true });
    console.log(`saved ${file} (${info.tris} tris, clips ${info.clips.join('/') || '-'})`);
  }
} finally {
  await browser.close();
  server.kill();
}
