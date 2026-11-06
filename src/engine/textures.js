// Pixel-style textures generated in code (no image files needed).
import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { smoothstep } from '../core/math.js';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixelTexture(canvas, { repeat = true, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Neutral 32x32 grain multiplied over vertex colours: gives every prop a pixel-texture feel. */
export function grainTexture(seed = 'grain') {
  const size = 32;
  const cv = makeCanvas(size, size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rng = new Rng(seed);
  const levels = [255, 246, 236, 226, 214];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // clustered noise: 2x2 blocks with occasional single texels, palette-limited
      const block = new Rng(`${seed}:${x >> 1}:${y >> 1}`).next();
      let lv = levels[Math.min(levels.length - 1, Math.floor(block * block * levels.length * 1.2))];
      if (rng.chance(0.08)) lv = levels[rng.int(1, 4)];
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = lv;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return pixelTexture(cv);
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Value noise in [0,1) for terrain colouring. */
function valueNoise(seed) {
  const cache = new Map();
  const h = (ix, iz) => {
    const k = `${ix},${iz}`;
    let v = cache.get(k);
    if (v === undefined) { v = new Rng(`${seed}:${k}`).next(); cache.set(k, v); }
    return v;
  };
  return (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
    const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
    return a + (b - a) * sz;
  };
}

/**
 * Bakes the whole map's ground into one pixel texture: grass / path / rim rock,
 * with faction tint (Magic west = cooler, War east = drier). 8 texels per metre.
 */
export function terrainTexture(map, terrain, texelsPerMetre = 8, { detail = null, emissive = null } = {}) {
  const W = map.size.w;
  const D = map.size.d;
  const tw = Math.round(W * texelsPerMetre);
  const th = Math.round(D * texelsPerMetre);
  const cv = makeCanvas(tw, th);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(tw, th);
  const grass = map.ground.grass.map(hexToRgb);
  const path = map.ground.path.map(hexToRgb);
  const rimC = map.ground.rim.map(hexToRgb);
  const n1 = valueNoise(`${map.seed}:g1`);
  // theme detail layers: emissive (lava / ooze / runes) and roughness (ice) maps, same texel grid
  const emC = emissive ? hexToRgb(emissive) : null;
  const em = emC ? new Uint8ClampedArray(tw * th * 4) : null;
  const rough = detail === 'ice' ? new Uint8ClampedArray(tw * th * 4) : null;
  const n3 = valueNoise(`${map.seed}:g3`);
  const runeHash = (ix, iz) => { let h = (ix * 73856093) ^ (iz * 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const n2 = valueNoise(`${map.seed}:g2`);
  const rng = new Rng(`${map.seed}:tex`);
  // path mask is expensive: sample on a coarse grid and interpolate
  const step = 2; // texels
  const gw = Math.ceil(tw / step) + 1;
  const gh = Math.ceil(th / step) + 1;
  const mask = new Float32Array(gw * gh);
  const slope = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = -W / 2 + ((gx * step) / tw) * W;
      const z = -D / 2 + ((gy * step) / th) * D;
      mask[gy * gw + gx] = terrain.pathMask(x, z);
      slope[gy * gw + gx] = terrain.slope(x, z);
    }
  }
  const sample = (arr, px, py) => {
    const gx = px / step;
    const gy = py / step;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const i = y0 * gw + x0;
    const a = arr[i] + (arr[i + 1] - arr[i]) * fx;
    const b = arr[i + gw] + (arr[i + gw + 1] - arr[i + gw]) * fx;
    return a + (b - a) * fy;
  };
  for (let py = 0; py < th; py++) {
    for (let px = 0; px < tw; px++) {
      const x = -W / 2 + ((px + 0.5) / tw) * W;
      const z = -D / 2 + ((py + 0.5) / th) * D;
      const m = sample(mask, px, py);
      const sl = sample(slope, px, py);
      const dither = (rng.next() - 0.5) * 0.18;
      let c;
      let glow = 0;
      let rg = 0.95;
      if (m < 0.5 + dither * 0.6) {
        // path: pebbly dirt, wheel ruts, a crisp edge line and sparse footprints
        const v = n2(x * 0.9, z * 0.9) + dither;
        c = path[v < 0.3 ? 3 : v < 0.55 ? 1 : v < 0.85 ? 0 : 2];
        if (m > 0.4) c = path[3]; // edge line
        else if (m > 0.32 && rng.chance(0.35)) c = path[3]; // edge shadow band
        else if (Math.abs(m - 0.17) < 0.022 && detail !== 'runes') c = [path[3][0] * 0.9, path[3][1] * 0.9, path[3][2] * 0.9]; // ruts
        else if (m < 0.28 && rng.chance(0.012)) c = path[3]; // footprints / pebbles
        if (detail === 'runes' && m < 0.3) {
          const ix = Math.floor(x / 3.2);
          const iz = Math.floor(z / 3.2);
          if (runeHash(ix, iz) < 0.22) {
            const u = x / 3.2 - ix - 0.5;
            const w = z / 3.2 - iz - 0.5;
            const r = Math.abs(u) + Math.abs(w);
            if (Math.abs(r - 0.28) < 0.045 || (Math.abs(u) < 0.03 && Math.abs(w) < 0.2) || (Math.abs(w) < 0.03 && Math.abs(u) < 0.2)) { c = [70, 52, 120]; glow = 1; }
          }
        }
        if (detail === 'ice') rg = 0.7;
      } else {
        const v = n1(x * 0.35, z * 0.35) * 0.7 + n2(x * 1.3, z * 1.3) * 0.3 + dither;
        c = grass[v < 0.33 ? 3 : v < 0.5 ? 1 : v < 0.78 ? 0 : 2];
        if (detail === 'ripples') {
          const sv = Math.sin(x * 1.5 + z * 0.45 + n3(x * 0.2, z * 0.2) * 6);
          if (sv > 0.72) c = grass[2]; else if (sv < -0.8) c = grass[3];
        } else if (detail !== 'ice' && detail !== 'lava' && detail !== 'ooze') {
          if (rng.chance(0.006)) c = [244, 232, 120]; // tiny flowers
          else if (rng.chance(0.004)) c = [232, 160, 220];
        }
        if (detail === 'ice') {
          const iv = n3(x * 0.11, z * 0.11);
          if (iv > 0.62) {
            const crack = Math.abs(n2(x * 1.4, z * 1.4) - 0.5) < 0.025;
            c = crack ? [122, 160, 192] : iv > 0.7 ? [206, 230, 244] : [176, 210, 232];
            rg = crack ? 0.8 : 0.22;
          }
        } else if (detail === 'lava') {
          const fv = Math.abs(n3(x * 0.16, z * 0.16) - 0.5);
          if (fv < 0.03) { c = [58, 26, 18]; glow = 1 - fv / 0.03; } else if (fv < 0.065) c = [72, 44, 36];
        } else if (detail === 'ooze') {
          const ov = n3(x * 0.1 + 3.7, z * 0.1);
          if (ov > 0.76) { c = [44, 74, 34]; glow = rng.chance(0.05) ? 0.9 : 0.12; } else if (ov > 0.735) { c = [96, 150, 60]; glow = 0.45; }
        }
        const rock = smoothstep(31, 44, sl + dither * 14);
        if (rock > 0.5) {
          // horizontal rock strata by height, broken up slightly by noise
          const hgt = terrain.height(x, z) + n2(x * 0.7, z * 0.7) * 0.6;
          const band = Math.floor(hgt * 1.6) % 3;
          c = band === 0 ? rimC[1] : band === 1 ? [128, 128, 140] : [104, 104, 116];
          if (rock < 0.75 && rng.chance(0.5)) c = rimC[0]; // grassy lip
        }
      }
      // faction tint: west cooler/teal, east warmer/khaki
      const t = smoothstep(-30, 30, x);
      const r = c[0] * (0.96 + 0.08 * t);
      const g = c[1] * (1.0 - 0.02 * t);
      const b = c[2] * (1.06 - 0.12 * t);
      const i = (py * tw + px) * 4;
      img.data[i] = Math.min(255, r);
      img.data[i + 1] = Math.min(255, g);
      img.data[i + 2] = Math.min(255, b);
      img.data[i + 3] = 255;
      if (em && glow > 0) { em[i] = emC[0] * glow; em[i + 1] = emC[1] * glow; em[i + 2] = emC[2] * glow; }
      if (em) em[i + 3] = 255;
      if (rough) { rough[i] = rough[i + 1] = rough[i + 2] = rg * 255; rough[i + 3] = 255; }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = pixelTexture(cv, { repeat: false });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const extra = (data, srgb) => {
    const c2 = makeCanvas(tw, th);
    c2.getContext('2d').putImageData(new ImageData(data, tw, th), 0, 0);
    const t = pixelTexture(c2, { repeat: false, srgb });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  if (em) tex.userData.emissiveMap = extra(em, true);
  if (rough) tex.userData.roughnessMap = extra(rough, false);
  return tex;
}
