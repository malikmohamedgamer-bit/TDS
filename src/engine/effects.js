// Code-driven VFX: pixel particles (one InstancedMesh), expanding rings, lightning bolts, slash
// arcs, and floating damage numbers (pooled DOM). All pooled: nothing allocates per hit.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export const DAMAGE_COLORS = {
  physical: '#E8E8E8', fire: '#FF6B35', ice: '#7FDBFF', lightning: '#FFE14D', arcane: '#C9A7FF',
  poison: '#7BD389', explosive: '#FF9F1C', holy: '#FFF3B0', dark: '#B07CD8',
};
const GLYPHS = { physical: '•', fire: '🔥', ice: '❄', lightning: '⚡', arcane: '✦', poison: '💧', explosive: '✸', holy: '☀', dark: '☾' };

export class Effects {
  constructor(scene, camera, overlay, settings) {
    this.scene = scene;
    this.camera = camera;
    this.settings = settings;
    // particles
    this.maxP = 3200; // instanced capacity (Ultra cap); the live cap comes from data/vfx.json per quality
    this.capP = 2400;
    this.countMul = 1;
    this.lib = null;
    this.p = [];
    this.pFree = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: true }), this.maxP);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    this.pMesh.setColorAt(0, _c.set('#ffffff'));
    scene.add(this.pMesh);
    // rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.92, 1, 48, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, r0: 0, r1: 1, y: 0 });
    }
    // bolts (lightning) as glowing segments
    this.boltMax = 400;
    this.bolts = [];
    this.boltMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFE14D').multiplyScalar(2.4) }), this.boltMax);
    this.boltMesh.frustumCulled = false;
    this.boltMesh.count = 0;
    scene.add(this.boltMesh);
    // damage numbers
    this.overlay = overlay;
    this.nums = [];
    for (let i = 0; i < 48; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      overlay.appendChild(el);
      this.nums.push({ el, life: 0, x: 0, y: 0, z: 0 });
    }
    this.numIdx = 0;
    this.time = 0;
  }

  get scale() {
    return this.settings.reducedMotion ? 0.5 : 1;
  }

  /** Burst of pixel particles. */
  burst(x, y, z, { count = 12, color = '#ffffff', speed = 4, up = 2, size = 0.12, life = 0.6, gravity = 9, spread = 1, colors = null } = {}) {
    const n = Math.round(count * this.scale);
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.capP) this.p.shift();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.p.push({
        x: x + (Math.random() - 0.5) * 0.3 * spread, y: y + Math.random() * 0.2, z: z + (Math.random() - 0.5) * 0.3 * spread,
        vx: Math.cos(a) * v * spread, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * v * spread,
        life, max: life, size: size * (0.6 + Math.random() * 0.8), g: gravity, color: _c.set(colors ? colors[i % colors.length] : color).getHex(),
        rot: Math.random() * 6,
      });
    }
  }

  /** VFX library (data/vfx.json) and the live particle cap / count multiplier for a quality tier. */
  setLibrary(lib, quality = 'medium') {
    this.lib = lib;
    this.capP = Math.min(this.maxP, lib?.caps?.particles?.[quality] ?? 2400);
    this.countMul = lib?.caps?.countMul?.[quality] ?? 1;
  }

  /**
   * Plays a preset. Visual steps run here; side effects (shake, flash, slowmo) are returned so the
   * owner can apply them (camera, post pass, simulation speed). Unknown presets do nothing.
   */
  play(name, x, y, z, { radius = 1, tx, ty, tz } = {}) {
    const steps = this.lib?.presets?.[name];
    if (!steps) return null;
    let side = null;
    for (const step of steps) {
      const [k, p] = Object.entries(step)[0];
      if (k === 'burst') {
        this.burst(x, y + (p.y || 0), z, { ...p, count: Math.max(1, Math.round((p.count || 8) * this.countMul)), speed: p.speedByRadius ? p.speedByRadius * radius : p.speed ?? 4 });
      } else if (k === 'ring') {
        this.ring(x, y + (p.y || 0), z, { ...p, r0: p.r0 === 'radius' ? radius : p.r0 ?? 0.2, r1: p.r1 === 'radius' ? radius : p.r1 ?? 3 });
      } else if (k === 'bolt') {
        if (tx !== undefined) this.bolt(x, y, z, tx, ty, tz, p);
      } else {
        side = side || {};
        side[k] = p;
      }
    }
    return side;
  }

  ring(x, y, z, { color = '#ffffff', r0 = 0.2, r1 = 3, life = 0.5, intensity = 1.6 } = {}) {
    const r = this.rings.find((q) => q.life <= 0) || this.rings[0];
    r.life = life; r.max = life; r.r0 = r0; r.r1 = r1;
    r.mesh.position.set(x, y + 0.08, z);
    r.mesh.material.color.set(color).multiplyScalar(intensity);
    r.mesh.visible = true;
    return r;
  }

  /** Jagged lightning between two points. */
  bolt(x0, y0, z0, x1, y1, z1, { segments = 7, jitter = 0.45, life = 0.16 } = {}) {
    let px = x0; let py = y0; let pz = z0;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      let nx = x0 + (x1 - x0) * t; let ny = y0 + (y1 - y0) * t; let nz = z0 + (z1 - z0) * t;
      if (i < segments) { nx += (Math.random() - 0.5) * jitter; ny += (Math.random() - 0.5) * jitter; nz += (Math.random() - 0.5) * jitter; }
      if (this.bolts.length >= this.boltMax) this.bolts.shift();
      this.bolts.push({ ax: px, ay: py, az: pz, bx: nx, by: ny, bz: nz, life, max: life });
      px = nx; py = ny; pz = nz;
    }
  }

  /** Floating number above a world point (pooled DOM). */
  number(x, y, z, value, type = 'physical', { big = false, text = null } = {}) {
    if (this.settings.damageNumbers === false) return;
    const n = this.nums[this.numIdx++ % this.nums.length];
    n.x = x; n.y = y; n.z = z; n.life = 0.9; n.max = 0.9;
    n.el.textContent = text ?? `${GLYPHS[type] || ''}${Math.max(1, Math.round(value))}`;
    n.el.style.color = DAMAGE_COLORS[type] || '#fff';
    n.el.classList.toggle('big', big);
    n.el.style.display = 'block';
  }

  update(dt, viewW, viewH) {
    this.time += dt;
    // particles
    let k = 0;
    const keep = [];
    for (const q of this.p) {
      q.life -= dt;
      if (q.life <= 0) continue;
      q.vy -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.02 && q.g > 0) { q.y = 0.02; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      const s = q.size * Math.min(1, (q.life / q.max) * 2);
      q.rot += dt * 4;
      _q.setFromAxisAngle(UP, q.rot);
      _m.compose(_v.set(q.x, q.y, q.z), _q, _s.set(s, s, s));
      this.pMesh.setMatrixAt(k, _m);
      this.pMesh.setColorAt(k, _c.setHex(q.color).multiplyScalar(1.8));
      k++;
      keep.push(q);
    }
    this.p = keep;
    this.pMesh.count = k;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
    // rings
    for (const r of this.rings) {
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      r.life -= dt;
      const u = 1 - Math.max(0, r.life) / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) * (1 - u));
      r.mesh.scale.set(rad, 1, rad);
      r.mesh.material.opacity = Math.max(0, 1 - u) * 0.9;
    }
    // bolts
    let b = 0;
    const kb = [];
    for (const s of this.bolts) {
      s.life -= dt;
      if (s.life <= 0) continue;
      const dx = s.bx - s.ax; const dy = s.by - s.ay; const dz = s.bz - s.az;
      const len = Math.hypot(dx, dy, dz);
      _v.set((s.ax + s.bx) / 2, (s.ay + s.by) / 2, (s.az + s.bz) / 2);
      _q.setFromUnitVectors(UP, _s.set(dx / len, dy / len, dz / len));
      const w = 0.07 * (s.life / s.max) + 0.02;
      _m.compose(_v, _q, _s.set(w, len, w));
      this.boltMesh.setMatrixAt(b++, _m);
      kb.push(s);
    }
    this.bolts = kb;
    this.boltMesh.count = b;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    // numbers
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) { n.el.style.display = 'none'; continue; }
      const u = 1 - n.life / n.max;
      _v.set(n.x, n.y + 0.4 + u * 1.2, n.z).project(this.camera);
      if (_v.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = 'block';
      n.el.style.transform = `translate(${((_v.x + 1) / 2) * viewW}px, ${((1 - _v.y) / 2) * viewH}px) translate(-50%, -50%) scale(${1 + 0.3 * (1 - u)})`;
      n.el.style.opacity = String(Math.min(1, n.life / 0.3));
    }
  }
}
