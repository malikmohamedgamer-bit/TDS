// GLB model loading with caching, per-instance cloning (skeleton-safe), the game's material style
// (flat shading, pixel grain, emissive glow), and animation mixers with named clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { sharedMaterials } from './mapView.js';
import { remapPixels } from '../core/palette.js';

const loader = new GLTFLoader();
const cache = new Map();

/** The model entry a tower / enemy uses, with its own palette override (colour variants). */
export function modelSrc(content, def) {
  const glb = def.model?.glb && content.models.get(def.model.glb);
  if (!glb) return null;
  return def.model.palette ? { ...glb, palette: def.model.palette } : glb;
}

let schemes = {};
/** Register data/palettes.json schemes (call once after content loads). */
export function setPalettes(p) {
  schemes = p?.schemes || {};
}

/**
 * Load (once per url + palette) and return {scene, animations}. src is a url or a data/models.json
 * entry {url, palette?}; a palette recolours the model's palette texture (pack models).
 */
export function loadGLB(src) {
  const url = typeof src === 'string' ? src : src.url;
  const palette = typeof src === 'string' ? null : src.palette || null;
  const scale = typeof src === 'string' ? 1 : src.scale || 1;
  const key = `${url}|${palette || ''}|${scale}`;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        styleScene(gltf.scene, palette ? schemes[palette] : null);
        if (scale !== 1) {
          // wrap so node animations (which set the scene's own transforms) keep the scale
          const wrap = new THREE.Group();
          wrap.name = gltf.scene.name || 'scaled';
          gltf.scene.scale.multiplyScalar(scale);
          wrap.add(gltf.scene);
          gltf.scene = wrap;
        }
        resolve(gltf);
      }, undefined, (err) => reject(new Error(`Failed to load ${url}: ${err?.message || err}`)));
    }));
  }
  return cache.get(key);
}

/** Recolour a palette texture to a scheme. Returns {map, emissiveMap|null}; cached per image. */
const recolourCache = new WeakMap();
function recolour(tex, scheme) {
  let per = recolourCache.get(tex.image);
  if (!per) { per = new Map(); recolourCache.set(tex.image, per); }
  if (per.has(scheme)) return per.get(scheme);
  const img = tex.image;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const glow = remapPixels(data.data, scheme);
  ctx.putImageData(data, 0, 0);
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.flipY = tex.flipY;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = tex.wrapS;
    t.wrapT = tex.wrapT;
    return t;
  };
  let emissiveMap = null;
  if (glow) {
    const gc = document.createElement('canvas');
    gc.width = canvas.width;
    gc.height = canvas.height;
    gc.getContext('2d').putImageData(new ImageData(glow, canvas.width, canvas.height), 0, 0);
    emissiveMap = mk(gc);
  }
  const out = { map: mk(canvas), emissiveMap };
  per.set(scheme, out);
  return out;
}

/** Apply docs/art-style.md to imported materials: flat shading, pixel grain, shadows. */
export function styleScene(root, scheme = null) {
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
      if (scheme && m.map?.image) {
        // pack model: keep its palette texture, recoloured to the art-style palette
        const rc = recolour(m.map, scheme);
        nm = new THREE.MeshStandardMaterial({
          name: m.name, map: rc.map, roughness: 0.85, metalness: 0, flatShading: true, side: m.side,
          emissive: rc.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveMap: rc.emissiveMap, emissiveIntensity: rc.emissiveMap ? 1.3 : 0,
        });
      } else if (glow) {
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
