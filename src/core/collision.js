// XZ-plane collision world with heights: circles and rotated boxes in a uniform spatial hash.
// Pure (no DOM / Three.js). Used by the character controller, tower placement and tests.
import { clamp } from './math.js';

let nextId = 1;

export class CollisionWorld {
  /**
   * @param {object} opts
   * @param {object} opts.terrain   result of createTerrain()
   * @param {object} opts.bounds    {minX,maxX,minZ,maxZ} walkable area
   * @param {number} [opts.cell]    spatial hash cell size
   */
  constructor({ terrain, bounds, cell = 4 }) {
    this.terrain = terrain;
    this.bounds = bounds;
    this.cell = cell;
    this.grid = new Map();
    this.colliders = new Map();
  }

  _key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  _cells(c) {
    const ext = c.shape === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
    const x0 = Math.floor((c.x - ext) / this.cell);
    const x1 = Math.floor((c.x + ext) / this.cell);
    const z0 = Math.floor((c.z - ext) / this.cell);
    const z1 = Math.floor((c.z + ext) / this.cell);
    const out = [];
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) out.push(this._key(ix, iz));
    return out;
  }

  /**
   * Add a collider. shape 'circle' {x,z,r} or 'box' {x,z,hw,hd,rot}. Vertical extent: y0 (bottom)
   * and top (absolute). If y0 is omitted it is the terrain height at its centre.
   * tag: free-form ('tower', 'prop', ...). blocksPlacement defaults to true.
   */
  add(spec) {
    const c = {
      id: spec.id ?? nextId++,
      shape: spec.shape,
      x: spec.x,
      z: spec.z,
      r: spec.r ?? 0,
      hw: spec.hw ?? 0,
      hd: spec.hd ?? 0,
      rot: spec.rot ?? 0,
      tag: spec.tag ?? 'prop',
      solid: spec.solid ?? true,
      blocksPlacement: spec.blocksPlacement ?? true,
      ref: spec.ref ?? null,
    };
    const ground = this.terrain ? this.terrain.height(c.x, c.z) : 0;
    c.y0 = spec.y0 ?? ground - 0.5;
    c.top = spec.top ?? ground + (spec.h ?? 2);
    // Rotation follows Three.js (about +Y): local->world x' = x cos + z sin, z' = -x sin + z cos
    c.cos = Math.cos(c.rot);
    c.sin = Math.sin(c.rot);
    c.keys = this._cells(c);
    for (const k of c.keys) {
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(c);
    }
    this.colliders.set(c.id, c);
    return c;
  }

  remove(id) {
    const c = this.colliders.get(id);
    if (!c) return false;
    for (const k of c.keys) {
      const list = this.grid.get(k);
      if (!list) continue;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.grid.delete(k);
    }
    this.colliders.delete(id);
    return true;
  }

  /** Colliders whose cells touch the circle (x,z,r). */
  query(x, z, r) {
    const out = new Set();
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell);
    const z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.grid.get(this._key(ix, iz));
        if (list) for (const c of list) out.add(c);
      }
    }
    return out;
  }

  /**
   * Penetration of circle (x,z,r) into collider c. Returns null when separated, else
   * {nx, nz, depth}: push the circle by depth along (nx,nz) to separate.
   */
  penetration(c, x, z, r) {
    if (c.shape === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = r + c.r;
      if (d >= min) return null;
      if (d < 1e-6) return { nx: 1, nz: 0, depth: min };
      return { nx: dx / d, nz: dz / d, depth: min - d };
    }
    // rotated box: move point into box space (inverse rotation)
    const lx0 = x - c.x;
    const lz0 = z - c.z;
    const lx = lx0 * c.cos - lz0 * c.sin;
    const lz = lx0 * c.sin + lz0 * c.cos;
    const cx = clamp(lx, -c.hw, c.hw);
    const cz = clamp(lz, -c.hd, c.hd);
    let nx;
    let nz;
    let depth;
    if (cx === lx && cz === lz) {
      // centre inside: push out along the shallowest face
      const px = c.hw - Math.abs(lx);
      const pz = c.hd - Math.abs(lz);
      if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; depth = px + r; }
      else { nx = 0; nz = Math.sign(lz) || 1; depth = pz + r; }
    } else {
      const dx = lx - cx;
      const dz = lz - cz;
      const d = Math.hypot(dx, dz);
      if (d >= r) return null;
      nx = dx / d;
      nz = dz / d;
      depth = r - d;
    }
    // back to world space (forward rotation)
    return { nx: nx * c.cos + nz * c.sin, nz: -nx * c.sin + nz * c.cos, depth };
  }

  /** Highest walkable surface under the circle for feet at feetY (step-up allowed). */
  groundHeight(x, z, r, feetY = Infinity, stepUp = 0.5) {
    let g = this.terrain ? this.terrain.height(x, z) : 0;
    for (const c of this.query(x, z, r)) {
      if (!c.solid || c.top <= g) continue;
      if (feetY < c.top - stepUp) continue; // that is a wall, not a floor
      if (this.penetration(c, x, z, r * 0.92)) g = c.top; // same footprint as the wall test: no gap to fall into
    }
    return g;
  }

  /** Push the circle out of walls. Returns {x, z, hits}. */
  resolve(x, z, r, feetY, height = 1.8, stepUp = 0.5, iterations = 4) {
    let hits = 0;
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (const c of this.query(x, z, r)) {
        if (!c.solid) continue;
        if (feetY >= c.top - stepUp) continue; // standing on or stepping over it
        if (feetY + height <= c.y0) continue; // passing underneath
        const p = this.penetration(c, x, z, r);
        if (!p) continue;
        x += p.nx * (p.depth + 1e-4);
        z += p.nz * (p.depth + 1e-4);
        hits++;
        moved = true;
      }
      const cl = this.clampToBounds(x, z, r);
      x = cl.x;
      z = cl.z;
      if (!moved) break;
    }
    return { x, z, hits };
  }

  clampToBounds(x, z, r = 0) {
    const b = this.bounds;
    return { x: clamp(x, b.minX + r, b.maxX - r), z: clamp(z, b.minZ + r, b.maxZ - r) };
  }

  /** True if a circle at (x,z) overlaps any solid wall for feet at feetY. */
  overlapsWall(x, z, r, feetY, height = 1.8, stepUp = 0.5) {
    for (const c of this.query(x, z, r)) {
      if (!c.solid || feetY >= c.top - stepUp || feetY + height <= c.y0) continue;
      if (this.penetration(c, x, z, r)) return true;
    }
    return false;
  }

  /** Any placement-blocking collider overlapping circle (x,z,r)? Returns it or null. */
  placementBlocker(x, z, r) {
    for (const c of this.query(x, z, r)) {
      if (c.blocksPlacement && this.penetration(c, x, z, r)) return c;
    }
    return null;
  }

  /** Spiral search for the nearest free spot (used to un-stick the character). */
  findFreeSpot(x, z, r, height = 1.8) {
    for (let ring = 0; ring < 40; ring++) {
      const rad = ring * 0.5;
      const steps = Math.max(1, ring * 8);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const p = this.clampToBounds(x + Math.cos(a) * rad, z + Math.sin(a) * rad, r);
        const g = this.terrain ? this.terrain.height(p.x, p.z) : 0;
        if (!this.overlapsWall(p.x, p.z, r, g, height)) return { x: p.x, z: p.z, y: this.groundHeight(p.x, p.z, r, g + 0.01) };
      }
    }
    return null;
  }
}
