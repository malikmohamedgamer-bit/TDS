// Theme atmosphere (data/themes.json): ambient particles (snow, embers, spores, dust, motes,
// pollen) as one THREE.Points cloud updated on the CPU, sized by the quality tier. The pure part
// (ambientMotion) is unit-tested; the rest only wraps it for Three.js.
import * as THREE from 'three';
import { Rng } from '../core/rng.js';

export const QUALITY_PARTICLES = { low: 0.25, medium: 0.6, high: 1, ultra: 1.4 };

/**
 * Per-kind motion: returns the new [x, y, z] for a particle after dt (pure, deterministic).
 * p = {x, y, z, ph (phase), sp (speed factor)}; box = {w, d, top}.
 */
export function ambientMotion(kind, p, t, dt, box) {
  let { x, y, z } = p;
  const s = p.sp;
  switch (kind) {
    case 'snow': y -= 1.6 * s * dt; x += Math.sin(t * 0.9 + p.ph) * 0.6 * dt; z += Math.cos(t * 0.7 + p.ph) * 0.4 * dt; break;
    case 'embers': y += 1.4 * s * dt; x += Math.sin(t * 2.3 + p.ph) * 0.9 * dt; z += 0.3 * dt; break;
    case 'spores': y += Math.sin(t * 0.8 + p.ph) * 0.35 * dt + 0.08 * dt; x += Math.cos(t * 0.5 + p.ph) * 0.3 * dt; break;
    case 'dust': x += 2.4 * s * dt; y += Math.sin(t * 1.7 + p.ph) * 0.25 * dt; break;
    case 'motes': y += Math.sin(t * 1.1 + p.ph) * 0.5 * dt; x += Math.cos(t * 0.6 + p.ph * 2) * 0.25 * dt; z += Math.sin(t * 0.4 + p.ph) * 0.25 * dt; break;
    default: x += Math.sin(t * 0.4 + p.ph) * 0.25 * dt; y += Math.cos(t * 0.6 + p.ph) * 0.15 * dt; break; // pollen
  }
  // wrap inside the box so the count never changes
  const hw = box.w / 2;
  const hd = box.d / 2;
  if (x > hw) x -= box.w; else if (x < -hw) x += box.w;
  if (z > hd) z -= box.d; else if (z < -hd) z += box.d;
  if (y < 0) y += box.top; else if (y > box.top) y -= box.top;
  return [x, y, z];
}

function spriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  // pixel-style soft square: bright core, dim rim (fits the 16 texel art style)
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(3, 3, 10, 10);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fillRect(5, 5, 6, 6);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export class AmbientParticles {
  constructor(theme, map, quality = 'medium', reducedMotion = false) {
    const def = theme?.particles;
    this.kind = def?.kind || 'pollen';
    const n = def ? Math.round(def.count * (QUALITY_PARTICLES[quality] ?? 0.6)) : 0;
    this.box = { w: map.size.w + 30, d: map.size.d + 30, top: this.kind === 'snow' ? 26 : this.kind === 'embers' ? 14 : 9 };
    this.reduced = reducedMotion;
    this.p = [];
    const rng = new Rng(`${map.seed}:ambient`);
    for (let i = 0; i < n; i++) {
      this.p.push({ x: (rng.next() - 0.5) * this.box.w, y: rng.next() * this.box.top, z: (rng.next() - 0.5) * this.box.d, ph: rng.next() * 6.283, sp: 0.6 + rng.next() * 0.8 });
    }
    this.pos = new Float32Array(Math.max(1, n) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const glow = this.kind === 'embers' || this.kind === 'motes' || this.kind === 'spores';
    const mat = new THREE.PointsMaterial({
      size: this.kind === 'snow' ? 0.22 : this.kind === 'dust' ? 0.16 : 0.14, map: spriteTexture(), transparent: true, depthWrite: false,
      color: new THREE.Color(def?.color || '#ffffff').multiplyScalar(glow ? 2.2 : 1), opacity: this.kind === 'dust' ? 0.5 : 0.85,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.name = `ambient:${this.kind}`;
    this.points.frustumCulled = false;
    this.points.visible = n > 0;
    this.t = 0;
    this._write();
  }

  _write() {
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i];
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    if (!this.p.length) return;
    const d = this.reduced ? dt * 0.4 : dt;
    this.t += d;
    for (const q of this.p) [q.x, q.y, q.z] = ambientMotion(this.kind, q, this.t, d, this.box);
    this._write();
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.map?.dispose();
    this.points.material.dispose();
  }
}
