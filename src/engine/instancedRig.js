// Instanced, animated units. Every animation (Blender GLB clips or code-driven procedural clips)
// is baked once into per-frame part matrices; each frame we write instanceMatrix = world * baked.
// Result: a whole enemy type costs one draw call per part, however many are on screen.
import * as THREE from 'three';
import { ModelBuilder } from './geo.js';
import { sharedMaterials } from './mapView.js';
import { loadGLB, ModelInstance } from './models.js';

const BAKE_FPS = 30;
const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

/**
 * A baked rig: parts (geometry + material) and clips {name: {fps, frames, loop, duration, data}}
 * where data holds parts x frames matrices. states maps game states (idle/move/attack/death) to clip names.
 */
export class RigAsset {
  constructor(parts, clips, states, opts = {}) {
    this.parts = parts;
    this.clips = clips;
    this.states = states;
    this.height = opts.height ?? 1.5;
    this.transparent = opts.transparent ?? 0;
  }

  clipFor(state) {
    return this.clips.get(this.states[state]) || this.clips.get(state) || this.clips.get(this.states.move) || this.clips.values().next().value;
  }
}

/** Code motion for pack models without clips (data/models.json "motion"): pose(root, u 0-1). */
const MOTIONS = {
  hover: { move: [1.6, (r, u) => { r.position.y = 0.6 + 0.15 * Math.sin(u * Math.PI * 2); r.rotation.y = u * Math.PI * 2; }],
    idle: [2, (r, u) => { r.position.y = 0.6 + 0.1 * Math.sin(u * Math.PI * 2); }] },
  waddle: { move: [0.7, (r, u) => { r.rotation.z = 0.12 * Math.sin(u * Math.PI * 2); r.position.y = 0.06 * Math.abs(Math.sin(u * Math.PI * 2)); }],
    idle: [1.6, (r, u) => { r.rotation.x = 0.04 * Math.sin(u * Math.PI * 2); }] },
  roll: { move: [0.5, (r, u) => { r.position.y = 0.03 * Math.abs(Math.sin(u * Math.PI * 4)); r.rotation.x = 0.02 * Math.sin(u * Math.PI * 2); }],
    idle: [1.5, (r, u) => { r.position.y = 0.01 * Math.sin(u * Math.PI * 2); }] },
};
const DEATH = [0.8, (r, u) => { r.position.y = -0.6 * u; r.rotation.z = 0.9 * u; r.scale.setScalar(Math.max(0.05, 1 - u * 0.6)); }];
const ATTACK = [0.5, (r, u) => { r.position.z = 0.35 * Math.sin(u * Math.PI); }];

/** Material of a styled mesh as {glow, color (linear, HDR for glow)} or null when it is textured. */
function flatColour(m, grain) {
  if (m.map && m.map !== grain) return null;
  if (m.isMeshBasicMaterial) return { glow: true, color: m.color.clone() };
  if (m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) {
    return { glow: true, color: m.emissive.clone().multiplyScalar(Math.max(1.6, m.emissiveIntensity * 1.4)) };
  }
  return { glow: false, color: m.color.clone() };
}

/**
 * Split a SkinnedMesh into rigid parts, one per bone (instancing cannot skin). Each triangle goes to
 * the bone with the most weight over its 3 vertices; bones owning under minShare of the triangles are
 * merged into their nearest bone ancestor (fingers, toes) to keep draw calls low. Flat-coloured
 * materials become vertex colours so one bone is one part (two if it has glowing triangles).
 * Returns [{geometry, material, matrix()}] where matrix() is the part's current world matrix.
 * shared: {grain, body, glow} materials (defaults to the engine's; tests pass plain ones).
 */
export function rigidifySkinned(mesh, { minShare = 0.04, shared = sharedMaterials() } = {}) {
  const g = mesh.geometry;
  const { position: pos, normal: nrm, uv, skinIndex: si, skinWeight: sw } = g.attributes;
  const index = g.index;
  const vid = (k) => (index ? index.getX(k) : k);
  const triCount = (index ? index.count : pos.count) / 3;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }];
  const bones = mesh.skeleton.bones;
  const triMat = new Int32Array(triCount);
  for (const grp of groups) for (let t = grp.start / 3; t < Math.min(triCount, (grp.start + grp.count) / 3); t++) triMat[t] = grp.materialIndex || 0;
  const triBone = new Int32Array(triCount);
  const w = new Float32Array(bones.length);
  const owned = new Int32Array(bones.length);
  for (let t = 0; t < triCount; t++) {
    w.fill(0);
    for (let k = 0; k < 3; k++) {
      const v = vid(t * 3 + k);
      for (let j = 0; j < 4; j++) w[si.getComponent(v, j)] += sw.getComponent(v, j);
    }
    let best = 0;
    for (let b = 1; b < bones.length; b++) if (w[b] > w[best]) best = b;
    triBone[t] = best;
    owned[best]++;
  }
  // merge small bones into their ancestors, deepest first
  const parent = bones.map((b) => bones.indexOf(b.parent));
  const depth = bones.map((b, i) => { let d = 0; for (let p = parent[i]; p >= 0; p = parent[p]) d++; return d; });
  const target = bones.map((_, i) => i);
  const order = bones.map((_, i) => i).sort((a, b) => depth[b] - depth[a]);
  for (const b of order) {
    if (owned[b] > 0 && owned[b] < minShare * triCount && parent[b] >= 0) { owned[parent[b]] += owned[b]; owned[b] = 0; target[b] = parent[b]; }
  }
  const resolve = (b) => { while (target[b] !== b) b = target[b]; return b; };
  // bucket triangles by part key: bone + (flat | glow | textured material index)
  const flat = mats.map((m) => flatColour(m, shared.grain));
  const buckets = new Map();
  for (let t = 0; t < triCount; t++) {
    const b = resolve(triBone[t]);
    const f = flat[triMat[t]];
    const key = `${b}|${f ? (f.glow ? 'glow' : 'flat') : `m${triMat[t]}`}`;
    if (!buckets.has(key)) buckets.set(key, { bone: b, kind: f ? (f.glow ? 'glow' : 'flat') : 'tex', mat: triMat[t], tris: [] });
    buckets.get(key).tris.push(t);
  }
  const toBone = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v3 = new THREE.Vector3();
  const parts = [];
  for (const bk of buckets.values()) {
    const n = bk.tris.length * 3;
    const P = new Float32Array(n * 3);
    const N = nrm ? new Float32Array(n * 3) : null;
    const U = uv ? new Float32Array(n * 2) : null;
    const C = bk.kind !== 'tex' ? new Float32Array(n * 3) : null;
    // bind-pose vertex -> bone-local space (the bone's world matrix then places it each frame)
    toBone.multiplyMatrices(mesh.skeleton.boneInverses[bk.bone], mesh.bindMatrix);
    nm.getNormalMatrix(toBone);
    let o = 0;
    for (const t of bk.tris) {
      const col = flat[triMat[t]]?.color;
      for (let k = 0; k < 3; k++, o++) {
        const v = vid(t * 3 + k);
        v3.fromBufferAttribute(pos, v).applyMatrix4(toBone).toArray(P, o * 3);
        if (N) v3.fromBufferAttribute(nrm, v).applyMatrix3(nm).normalize().toArray(N, o * 3);
        if (U) { U[o * 2] = uv.getX(v); U[o * 2 + 1] = uv.getY(v); }
        if (C) col.toArray(C, o * 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (N) geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    else geo.computeVertexNormals();
    if (U) geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const bone = bones[bk.bone];
    const out = new THREE.Matrix4();
    parts.push({
      geometry: geo,
      material: bk.kind === 'glow' ? shared.glow : bk.kind === 'flat' ? shared.body : mats[bk.mat],
      matrix: () => out.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bone.matrixWorld),
    });
  }
  return parts;
}

/** Bake a GLB into a RigAsset (rigid meshes as they are, skinned meshes split per bone). src: url or data/models.json entry. */
export async function rigFromGLB(src, states, opts = {}) {
  const gltf = await loadGLB(src);
  const inst = new ModelInstance(gltf);
  const root = inst.root;
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) parts.push(...rigidifySkinned(o));
    else parts.push({ geometry: o.geometry, material: o.material, matrix: () => o.matrixWorld });
  });
  const clips = new Map();
  const record = (name, duration, loop, sampler) => {
    const frames = Math.max(2, Math.ceil(duration * BAKE_FPS) + 1);
    const data = new Float32Array(parts.length * frames * 16);
    for (let f = 0; f < frames; f++) {
      sampler(Math.min(duration, f / BAKE_FPS));
      root.updateMatrixWorld(true);
      parts.forEach((pt, p) => pt.matrix().toArray(data, (p * frames + f) * 16));
    }
    clips.set(name, { fps: BAKE_FPS, frames, loop, duration, data });
  };
  record('_rest', 0.01, true, () => {});
  for (const clip of gltf.animations) {
    const action = inst.mixer.clipAction(clip);
    action.reset().play();
    const loop = !/death|attack|roar/i.test(clip.name);
    record(clip.name, clip.duration, loop, (t) => inst.mixer.setTime(t));
    action.stop();
  }
  states = { ...(states || {}) };
  const motion = typeof src === 'object' && MOTIONS[src.motion];
  if (motion) {
    // no clips in the file: synthesize idle / move / attack / death by moving the whole model
    const base = { p: root.position.clone(), r: root.rotation.clone(), s: root.scale.clone() };
    const reset = () => { root.position.copy(base.p); root.rotation.copy(base.r); root.scale.copy(base.s); };
    for (const [state, [dur, pose]] of Object.entries({ ...motion, attack: ATTACK, death: DEATH })) {
      if (states[state] && clips.has(states[state])) continue;
      record(`code:${state}`, dur, state !== 'death' && state !== 'attack', (t) => { reset(); pose(root, t / dur); });
      states[state] = `code:${state}`;
    }
    reset();
  }
  const box = new THREE.Box3().setFromObject(root);
  return new RigAsset(parts, clips, states, { height: box.max.y, ...opts });
}

/**
 * Bake a code-built model. def = {parts: [{name, pivot:[x,y,z], build(b)}], clips: {name: {duration,
 * loop, pose(t, out)}}} where pose fills out[name] = {r:[x,y,z] radians, p:[x,y,z] offset, s: scale}.
 */
export function rigFromProcedural(def, states, opts = {}) {
  const mats = sharedMaterials();
  const parts = [];
  const owner = [];
  for (const pd of def.parts) {
    const b = new ModelBuilder();
    pd.build(b);
    const g = b.build();
    if (g.body) { parts.push({ geometry: g.body, material: mats.body }); owner.push(pd); }
    if (g.glow) { parts.push({ geometry: g.glow, material: mats.glow }); owner.push(pd); }
  }
  const k = def.scale || 1; // uniform model scale baked into every frame (kit enemies are small versions of the boss bodies)
  const clips = new Map();
  const pose = {};
  const piv = new THREE.Vector3();
  const neg = new THREE.Vector3();
  const record = (name, c) => {
    const frames = Math.max(2, Math.ceil(c.duration * BAKE_FPS) + 1);
    const data = new Float32Array(parts.length * frames * 16);
    for (let f = 0; f < frames; f++) {
      for (const k of Object.keys(pose)) delete pose[k];
      c.pose(Math.min(c.duration, f / BAKE_FPS) / c.duration, pose);
      owner.forEach((pd, p) => {
        const tr = pose[pd.name] || {};
        const base = pose._root || {};
        piv.fromArray(pd.pivot || [0, 0, 0]);
        neg.copy(piv).negate();
        // part transform about its pivot, then the whole-body (root) transform
        _m.makeTranslation(neg.x, neg.y, neg.z);
        _q.setFromEuler(_e.set(...(tr.r || [0, 0, 0])));
        _w.compose(_v.set(...(tr.p || [0, 0, 0])).add(piv), _q, _s.setScalar(tr.s ?? 1));
        _w.multiply(_m);
        if (pose._root) {
          _q.setFromEuler(_e.set(...(base.r || [0, 0, 0])));
          _m.compose(_v.set(...(base.p || [0, 0, 0])), _q, _s.setScalar(base.s ?? 1));
          _w.premultiply(_m);
        }
        if (k !== 1) _w.premultiply(_m.makeScale(k, k, k));
        _w.toArray(data, (p * frames + f) * 16);
      });
    }
    clips.set(name, { fps: BAKE_FPS, frames, loop: c.loop !== false, duration: c.duration, data });
  };
  for (const [name, c] of Object.entries(def.clips)) record(name, c);
  return new RigAsset(parts, clips, states, k !== 1 && opts.height ? { ...opts, height: opts.height * k } : opts);
}

/** Draws many instances of one RigAsset. */
export class InstancedRig {
  constructor(asset, scene, capacity = 32) {
    this.asset = asset;
    this.scene = scene;
    this.meshes = [];
    this.count = 0;
    this._alloc(capacity);
  }

  _alloc(capacity) {
    for (const m of this.meshes) { this.scene.remove(m); m.dispose(); }
    this.capacity = capacity;
    this.meshes = this.asset.parts.map((p) => {
      let mat = p.material;
      if (this.asset.transparent) {
        mat = mat.clone();
        mat.transparent = true;
        mat.opacity = 1 - this.asset.transparent;
        mat.depthWrite = false;
      }
      const im = new THREE.InstancedMesh(p.geometry, mat, capacity);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = !this.asset.transparent;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, _c.setRGB(1, 1, 1));
      this.scene.add(im);
      return im;
    });
  }

  begin() {
    this.count = 0;
  }

  /** world: Matrix4 of the unit; state: idle|move|attack|death; t: seconds into that state. */
  add(world, state, t, tint = 1) {
    if (this.count >= this.capacity) this._alloc(this.capacity * 2);
    const clip = this.asset.clipFor(state);
    let frame;
    if (clip.loop) frame = Math.floor((t * clip.fps) % (clip.frames - 1));
    else frame = Math.min(clip.frames - 1, Math.floor(t * clip.fps));
    const i = this.count++;
    for (let p = 0; p < this.meshes.length; p++) {
      _m.fromArray(clip.data, (p * clip.frames + frame) * 16);
      _w.multiplyMatrices(world, _m);
      const im = this.meshes[p];
      im.setMatrixAt(i, _w);
      im.setColorAt(i, _c.setScalar(tint));
    }
  }

  end() {
    for (const im of this.meshes) {
      im.count = this.count;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  setShadows(on) {
    for (const im of this.meshes) im.castShadow = on && !this.asset.transparent;
  }

  dispose() {
    for (const m of this.meshes) { this.scene.remove(m); m.dispose(); }
    this.meshes = [];
  }
}
