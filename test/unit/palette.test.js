import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../helpers.js';
import { family, remapColor, remapPixels, hexRgb } from '../../src/core/palette.js';

const C = await content();
const S = C.palettes.schemes;

test('palette schemes: every family has a ramp of valid colours; every pack model uses a known scheme', () => {
  for (const [id, sc] of Object.entries(S)) {
    for (const f of C.palettes.families) {
      assert.ok(Array.isArray(sc[f]) && sc[f].length >= 1, `${id}.${f}`);
      for (const c of sc[f]) assert.match(c, /^#[0-9A-F]{6}$/i);
    }
  }
  for (const [id, m] of C.models) if (m.palette) assert.ok(S[m.palette], `${id} palette ${m.palette}`);
});

test('recolour: families by hue, outputs come from the scheme, only bright saturated texels glow', () => {
  assert.equal(family(128, 128, 128), 'neutral');
  assert.equal(family(220, 30, 30), 'red');
  assert.equal(family(40, 200, 60), 'green');
  assert.equal(family(40, 60, 220), 'blue');
  const all = new Set(Object.values(S.blight).flat().filter((x) => typeof x === 'string' && x.startsWith('#')).map((h) => hexRgb(h).join()));
  for (const rgb of [[230, 40, 40], [120, 20, 20], [200, 200, 200], [30, 160, 60]]) assert.ok(all.has(remapColor(...rgb, S.blight).rgb.join()));
  assert.equal(remapColor(240, 40, 40, S.blight).glow, true, 'bright red glows in Blight');
  assert.equal(remapColor(110, 25, 25, S.blight).glow, false, 'dark red does not');
  assert.equal(remapColor(240, 40, 40, S.war).glow, false, 'War models never glow');
  const px = new Uint8ClampedArray([240, 40, 40, 255, 90, 90, 90, 255, 0, 0, 0, 0]);
  const glow = remapPixels(px, S.blight);
  assert.ok(glow && glow[3] === 255 && glow[0] > 0 && glow[4] === 0, 'emissive map only where it glows');
  assert.equal(px[11], 0, 'transparent texels untouched');
});
