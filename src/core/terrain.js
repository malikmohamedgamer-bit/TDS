// Terrain height field defined entirely by map data (hills, rim, path corridors). Pure.
import { clamp, smoothstep, lerp, closestOnPolyline } from './math.js';

export function pathPoints(path) {
  return path.points.map(([x, z]) => ({ x, z }));
}

export function createTerrain(map) {
  const W = map.size.w;
  const D = map.size.d;
  const t = map.terrain || {};
  const base = t.baseHeight ?? 0;
  const hills = t.hills || [];
  const flats = t.flats || []; // [{x, z, r, height, blend}] level ground under landmarks
  const rim = t.rim || { height: 0, width: 1 };
  const pathBlend = t.pathBlend ?? 3;
  const paths = (map.paths || []).map((p) => ({
    id: p.id,
    half: (p.width ?? 5) / 2,
    height: p.height ?? 0,
    pts: pathPoints(p),
  }));

  function rawHeight(x, z) {
    let h = base;
    for (const hl of hills) {
      const dx = x - hl.x;
      const dz = z - hl.z;
      h += hl.h * Math.exp(-(dx * dx + dz * dz) / (hl.r * hl.r));
    }
    const edge = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
    h += rim.height * (1 - smoothstep(0, rim.width, edge));
    // gentle procedural undulation so open ground never looks perfectly flat
    h += 0.18 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4);
    for (const f of flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      h = lerp(f.height ?? 0, h, smoothstep(f.r, f.r + (f.blend ?? 4), d));
    }
    return h;
  }

  /** Distance to the nearest path centre line and that path's info. */
  function pathInfo(x, z) {
    let best = { d: Infinity, path: null, along: 0 };
    for (const p of paths) {
      const c = closestOnPolyline(x, z, p.pts);
      if (c.d < best.d) best = { d: c.d, path: p, along: c.along, x: c.x, z: c.z };
    }
    return best;
  }

  function height(x, z) {
    const h = rawHeight(x, z);
    if (!paths.length) return h;
    const pi = pathInfo(x, z);
    const k = smoothstep(pi.path.half, pi.path.half + pathBlend, pi.d);
    return lerp(pi.path.height, h, k);
  }

  function normal(x, z, e = 0.35) {
    const hx = height(x + e, z) - height(x - e, z);
    const hz = height(x, z + e) - height(x, z - e);
    const nx = -hx;
    const ny = 2 * e;
    const nz = -hz;
    const len = Math.hypot(nx, ny, nz);
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /** Slope in degrees. */
  function slope(x, z) {
    return (Math.acos(clamp(normal(x, z).y, -1, 1)) * 180) / Math.PI;
  }

  /** 0 = on the path, 1 = fully off the path (used for terrain colouring). */
  function pathMask(x, z) {
    if (!paths.length) return 1;
    const pi = pathInfo(x, z);
    return smoothstep(pi.path.half - 0.6, pi.path.half + 0.4, pi.d);
  }

  return {
    width: W,
    depth: D,
    paths,
    height,
    normal,
    slope,
    pathInfo,
    pathMask,
    bounds: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 },
  };
}
