// Low-poly model builder: combine primitives with flat colours into one merged geometry per
// material (body = lit, glow = emissive/bloom). Keeps draw calls low and works with instancing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEXELS_PER_METRE = 16;
const TEXTURE_SIZE = 32;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class ModelBuilder {
  constructor() {
    this.parts = { body: [], glow: [] };
  }

  /**
   * Add a geometry. opts: pos [x,y,z], rot [x,y,z] (radians), scale [x,y,z] or number,
   * glow (bool, emissive bloom part), smooth (keep smooth normals), uvScale (metres covered).
   */
  add(geometry, color, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const sc = opts.scale ?? 1;
    _s.set(...(Array.isArray(sc) ? sc : [sc, sc, sc]));
    _p.set(...(opts.pos ?? [0, 0, 0]));
    _q.setFromEuler(_e.set(...(opts.rot ?? [0, 0, 0])));
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    if (!opts.smooth) g.computeVertexNormals();
    // colour attribute
    _c.set(color);
    if (opts.glow) _c.multiplyScalar(opts.intensity ?? 2.4);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // consistent pixel texel density
    if (g.attributes.uv) {
      const size = opts.uvScale ?? Math.max(_s.x, _s.y, _s.z) * (opts.uvBase ?? 1);
      const k = (size * TEXELS_PER_METRE) / TEXTURE_SIZE;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
    } else {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    }
    this.parts[opts.glow ? 'glow' : 'body'].push(g);
    return this;
  }

  box(w, h, d, color, opts = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, { uvScale: Math.max(w, h, d), ...opts });
  }

  /** Cylinder standing on y=0 (pos is its base centre unless centered:true). */
  cyl(rTop, rBot, h, seg, color, opts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
    if (!opts.centered) g.translate(0, h / 2, 0);
    return this.add(g, color, { uvScale: Math.max(h, rBot * 2), ...opts });
  }

  cone(r, h, seg, color, opts = {}) {
    const g = new THREE.ConeGeometry(r, h, seg, 1);
    if (!opts.centered) g.translate(0, h / 2, 0);
    return this.add(g, color, { uvScale: Math.max(h, r * 2), ...opts });
  }

  ico(r, detail, color, opts = {}) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, { uvScale: r * 2, ...opts });
  }

  dodeca(r, color, opts = {}) {
    return this.add(new THREE.DodecahedronGeometry(r, 0), color, { uvScale: r * 2, ...opts });
  }

  octa(r, color, opts = {}) {
    return this.add(new THREE.OctahedronGeometry(r, 0), color, { uvScale: r * 2, ...opts });
  }

  torus(r, tube, rs, ts, color, opts = {}) {
    return this.add(new THREE.TorusGeometry(r, tube, rs, ts), color, { uvScale: r * 2, ...opts });
  }

  /** Extrude a 2D outline (XY points) along Z by depth, centred on z. */
  extrude(points, depth, color, opts = {}) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, { uvScale: 1, ...opts }); // extrude UVs are already in metres
  }

  sphere(r, ws, hs, color, opts = {}) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, { uvScale: r * 2, ...opts });
  }

  /** Merge into {body, glow} BufferGeometries (either may be null). */
  build() {
    const out = {};
    for (const k of ['body', 'glow']) {
      out[k] = this.parts[k].length ? mergeGeometries(this.parts[k], false) : null;
      for (const g of this.parts[k]) g.dispose();
      if (out[k]) {
        out[k].computeBoundingBox();
        out[k].computeBoundingSphere();
      }
    }
    this.parts = { body: [], glow: [] };
    return out;
  }
}

/** Deterministic tiny hash noise for jittering models. */
export function jitter(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}
