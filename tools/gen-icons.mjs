// node tools/gen-icons.mjs: renders the code-made SVG icons in assets/icons to the PNG sizes the
// web app manifest and iOS need (Playwright Chromium, no image libraries).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = [
  ['icon.svg', 192, 'icon-192.png'],
  ['icon.svg', 512, 'icon-512.png'],
  ['icon-maskable.svg', 512, 'icon-maskable-512.png'],
  ['icon-maskable.svg', 180, 'apple-touch-icon.png'],
];
const browser = await chromium.launch();
for (const [src, size, out] of OUT) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(`assets/icons/${src}`, 'utf8');
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  writeFileSync(`assets/icons/${out}`, await page.screenshot({ omitBackground: true }));
  await page.close();
  console.log(`assets/icons/${out} ${size}px`);
}
await browser.close();
