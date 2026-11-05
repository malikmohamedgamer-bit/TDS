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
    return this.clips.get(this.states[state]) || this.clips.get(this.states.move) || this.clips.values().next().value;
  }
}

/** Bake a GLB (rigid parts bound to bones) into a RigAsset. */
export async function rigFromGLB(url, states, opts = {}) {
  const gltf = await loadGLB(url);
  const inst = new ModelInstance(gltf);
  const root = inst.root;
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const parts = meshes.map((m) => ({ geometry: m.geometry, material: m.material }));
  const clips = new Map();
  const record = (name, duration, loop, sampler) => {
    const frames = Math.max(2, Math.ceil(duration * BAKE_FPS) + 1);
    const data = new Float32Array(parts.length * frames * 16);
    for (let f = 0; f < frames; f++) {
      sampler(Math.min(duration, f / BAKE_FPS));
      root.updateMatrixWorld(true);
      meshes.forEach((m, p) => m.matrixWorld.toArray(data, (p * frames + f) * 16));
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
        _w.toArray(data, (p * frames + f) * 16);
      });
    }
    clips.set(name, { fps: BAKE_FPS, frames, loop: c.loop !== false, duration: c.duration, data });
  };
  for (const [name, c] of Object.entries(def.clips)) record(name, c);
  return new RigAsset(parts, clips, states, opts);
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
