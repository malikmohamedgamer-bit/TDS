// GLB model loading with caching, per-instance cloning (skeleton-safe), the game's material style
// (flat shading, pixel grain, emissive glow), and animation mixers with named clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { sharedMaterials } from './mapView.js';

const loader = new GLTFLoader();
const cache = new Map();

/** Load (once) and return {scene, animations}. */
export function loadGLB(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        styleScene(gltf.scene);
        resolve(gltf);
      }, undefined, (err) => reject(new Error(`Failed to load ${url}: ${err?.message || err}`)));
    }));
  }
  return cache.get(url);
}

/** Apply docs/art-style.md to imported materials: flat shading, pixel grain, shadows. */
export function styleScene(root) {
  const grain = sharedMaterials().grain;
  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (seen.has(m)) return seen.get(m);
      const glow = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
      let nm;
      if (glow) {
        // glowing parts: unlit, HDR bright so only they bloom
        // same HDR level as the procedural props (geo.js intensity 2.4) so glow is consistent
        const c = m.emissive.clone().multiplyScalar(Math.min(2.6, Math.max(1.6, m.emissiveIntensity || 1)));
        nm = new THREE.MeshBasicMaterial({ color: c, name: m.name });
      } else {
        nm = new THREE.MeshStandardMaterial({
          name: m.name, color: m.color, map: grain, roughness: Math.max(0.45, m.roughness ?? 0.85),
          metalness: Math.min(0.5, m.metalness ?? 0), flatShading: true,
        });
      }
      seen.set(m, nm);
      return nm;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

/** Count triangles of an object tree. */
export function triangleCount(root) {
  let t = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    t += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(t);
}

/** A placed model instance with its own mixer. */
export class ModelInstance {
  constructor(gltf) {
    this.root = skeletonClone(gltf.scene);
    this.clips = new Map(gltf.animations.map((a) => [a.name, a]));
    this.mixer = new THREE.AnimationMixer(this.root);
    this.current = null;
    this.currentName = null;
  }

  /** Play a clip by name (crossfade). once: clamp at the last frame (death, attack). */
  play(name, { once = false, fade = 0.15, speed = 1 } = {}) {
    const clip = this.clips.get(name);
    if (!clip) return null;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.timeScale = speed;
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, fade, false);
    }
    action.play();
    this.current = action;
    this.currentName = name;
    return action;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
