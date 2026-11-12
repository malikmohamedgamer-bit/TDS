// Fixed enemy path: polyline with arc-length lookup. Pure.

export class Path {
  constructor(id, points) {
    this.id = id;
    this.points = points.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));
    this.segs = [];
    let start = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.segs.push({ ax: a.x, az: a.z, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, len, start });
      start += len;
    }
    this.length = start;
  }

  _seg(d) {
    // binary search: segments are few, but bosses and long maps call this a lot
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segs[mid].start <= d) lo = mid;
      else hi = mid - 1;
    }
    return this.segs[lo];
  }

  /** Distance along this path of a point that lies on it (within eps metres), or -1. Used where two
   *  roads share a stretch (fork trunks, diamond lanes): a point on the shared part has a d on both. */
  dAt(x, z, eps = 0.05) {
    for (const g of this.segs) {
      const t = (x - g.ax) * g.dx + (z - g.az) * g.dz;
      if (t < -eps || t > g.len + eps) continue;
      if (Math.abs((x - g.ax) * g.dz - (z - g.az) * g.dx) <= eps) return g.start + Math.max(0, Math.min(g.len, t));
    }
    return -1;
  }

  /** Position and heading at distance d (clamped to the path). */
  pointAt(d, out = {}) {
    const dd = d < 0 ? 0 : d > this.length ? this.length : d;
    const s = this._seg(dd);
    const t = dd - s.start;
    out.x = s.ax + s.dx * t;
    out.z = s.az + s.dz * t;
    out.dx = s.dx;
    out.dz = s.dz;
    return out;
  }

  /** Distances along the path (step m apart) whose points lie within r of (x, z). */
  samplesWithin(x, z, r, step = 0.5) {
    const out = [];
    const p = {};
    for (let d = 0; d <= this.length; d += step) {
      this.pointAt(d, p);
      if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r * r) out.push(d);
    }
    return out;
  }
}
