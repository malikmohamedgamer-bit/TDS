// Small pure math helpers shared by simulation and view.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

export const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

/** Closest point on segment AB to P in the XZ plane. Returns {x, z, t, d2}. */
export function closestOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + abx * t;
  const z = az + abz * t;
  return { x, z, t, d2: dist2(px, pz, x, z) };
}

/** Closest point on a polyline [{x,z},...]. Returns {x, z, d, seg, t, along}. */
export function closestOnPolyline(px, pz, pts) {
  let best = null;
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const c = closestOnSegment(px, pz, a.x, a.z, b.x, b.z);
    const segLen = Math.sqrt(dist2(a.x, a.z, b.x, b.z));
    if (!best || c.d2 < best.d2) best = { ...c, seg: i, along: along + segLen * c.t };
    along += segLen;
  }
  if (!best) return { x: px, z: pz, d: Infinity, seg: -1, t: 0, along: 0 };
  best.d = Math.sqrt(best.d2);
  return best;
}
