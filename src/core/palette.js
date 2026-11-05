// Pure colour remapping for imported pack models (data/palettes.json). No DOM: the engine applies
// remapPixels() to a texture's pixels; unit tests call it directly.

export function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGB 0-255 -> [h 0-360, s 0-1, l 0-1]. */
export function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/** Colour family of a texel: 'neutral' for low saturation, else by hue. */
export function family(r, g, b) {
  const [h, s, l] = rgbHsl(r, g, b);
  if (s < 0.18 || l < 0.08 || l > 0.95) return 'neutral';
  if (h < 15 || h >= 335) return 'red';
  if (h < 42) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 200) return 'cyan';
  if (h < 255) return 'blue';
  return 'purple';
}

/** Replacement for one texel: {rgb:[r,g,b], glow:boolean}. The ramp entry follows the lightness. */
export function remapColor(r, g, b, scheme) {
  const fam = family(r, g, b);
  const ramp = scheme[fam] || scheme.neutral;
  const l = rgbHsl(r, g, b)[2];
  const i = Math.min(ramp.length - 1, Math.floor(l * ramp.length));
  const [, sat] = rgbHsl(r, g, b);
  // only bright, saturated texels glow (eyes, gems); big darker areas of the same hue stay matte
  return { rgb: hexRgb(ramp[i]), glow: (scheme.glow || []).includes(fam) && l >= 0.42 && sat >= 0.45 };
}

/**
 * Remap RGBA pixels in place. Returns a same-size RGBA array holding only glowing texels (for an
 * emissive map; black elsewhere), or null when nothing glows.
 */
export function remapPixels(data, scheme) {
  const glow = new Uint8ClampedArray(data.length);
  let any = false;
  const memo = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let m = memo.get(key);
    if (!m) { m = remapColor(data[i], data[i + 1], data[i + 2], scheme); memo.set(key, m); }
    [data[i], data[i + 1], data[i + 2]] = m.rgb;
    if (m.glow) { glow[i] = m.rgb[0]; glow[i + 1] = m.rgb[1]; glow[i + 2] = m.rgb[2]; any = true; }
    glow[i + 3] = 255;
  }
  return any ? glow : null;
}
