// Renders small portraits of 3D models (towers, enemies) into data URLs for UI icons.
import * as THREE from 'three';
import { loadGLB, ModelInstance } from './models.js';
import { TOWER_MODELS, ENEMY_RIGS } from './unitModels.js';
import { rigFromProcedural, InstancedRig } from './instancedRig.js';

const cache = new Map();

export async function towerThumbnail(renderer, content, towerId, size = 128, silhouette = false) {
  const key = `t:${towerId}:${silhouette}`;
  if (cache.has(key)) return cache.get(key);
  const def = content.towers.get(towerId);
  const obj = new THREE.Group();
  const glb = def.model?.glb && content.models.get(def.model.glb);
  if (glb) obj.add(new ModelInstance(await loadGLB(glb)).root);
  else if (TOWER_MODELS[towerId]) {
    const built = TOWER_MODELS[towerId]();
    obj.add(built.group);
    if (built.unit) { built.unit.position.set(0, 1.6, 0); built.unit.scale.setScalar(0.55); obj.add(built.unit); }
  }
  const url = renderObject(renderer, obj, size, silhouette ? '#4a5168' : def.faction === 'magic' ? '#2a2766' : '#2f3a22', silhouette);
  cache.set(key, url);
  return url;
}

/** Enemy portrait (GLB or code rig at its idle pose); silhouette for undiscovered Index entries. */
export async function enemyThumbnail(renderer, content, enemyId, size = 128, silhouette = false) {
  const key = `e:${enemyId}:${silhouette}`;
  if (cache.has(key)) return cache.get(key);
  const def = content.enemies.get(enemyId);
  const obj = new THREE.Group();
  const glb = def.model?.glb && content.models.get(def.model.glb);
  if (glb) obj.add(new ModelInstance(await loadGLB(glb)).root);
  else {
    const rd = ENEMY_RIGS[enemyId] || ENEMY_RIGS[def.model?.builder] || ENEMY_RIGS.mite;
    const asset = rigFromProcedural(rd, { idle: 'idle', move: 'move', attack: 'attack', death: 'death' }, { height: rd.height });
    const rig = new InstancedRig(asset, obj, 1);
    rig.begin();
    rig.add(new THREE.Matrix4().makeRotationY(0), 'idle', 0);
    rig.end();
    for (const m of rig.meshes) { m.frustumCulled = false; m.computeBoundingBox(); m.computeBoundingSphere(); }
  }
  const url = renderObject(renderer, obj, size, silhouette ? '#4a5168' : '#3a1f2a', silhouette);
  cache.set(key, url);
  return url;
}

export function renderObject(renderer, obj, size = 128, bg = '#20243a', silhouette = false) {
  if (silhouette) {
    const black = new THREE.MeshBasicMaterial({ color: '#05060a' });
    obj.traverse((o) => { if (o.isMesh) o.material = black; });
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.add(new THREE.HemisphereLight('#dfe9ff', '#3a3226', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(3, 6, 4);
  scene.add(sun, obj);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const radius = Math.max(s.x, s.y, s.z) * 0.62;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
  cam.position.copy(c).addScaledVector(dir, radius / Math.sin((15 * Math.PI) / 180));
  cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const r = renderer.renderer;
  const prevTarget = r.getRenderTarget();
  const prevShadow = r.shadowMap.enabled;
  r.shadowMap.enabled = false;
  r.setRenderTarget(rt);
  r.render(scene, cam);
  const px = new Uint8Array(size * size * 4);
  r.readRenderTargetPixels(rt, 0, 0, size, size, px);
  r.setRenderTarget(prevTarget);
  r.shadowMap.enabled = prevShadow;
  rt.dispose();
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    // flip vertically (GL origin is bottom-left)
    img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
