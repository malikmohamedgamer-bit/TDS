// Builds the 3D view of a map from its data + deterministic layout: terrain (inner detailed +
// outer ring), sky, clouds, instanced props (chunked for frustum culling), grass and path stones.
import * as THREE from 'three';
import { grainTexture, terrainTexture } from './textures.js';
import { propGeometry } from './propModels.js';
import { ModelBuilder } from './geo.js';
import { Rng } from '../core/rng.js';
import { AmbientParticles } from './themeFx.js';

let shared;
export function sharedMaterials() {
  if (shared) return shared;
  const grain = grainTexture();
  shared = {
    grain,
    body: new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.86, metalness: 0.04, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  return shared;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Sky: gradient + horizon haze + (per theme, data/themes.json) pixel stars, aurora curtains and fbm clouds.
const SKY_FRAG = /* glsl */ `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 haze;
  uniform float stars; uniform float aurora; uniform float clouds; uniform float time;
  varying vec3 vDir;
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash(vec3(i, 0.0)); float b = hash(vec3(i + vec2(1.0, 0.0), 0.0)); float c = hash(vec3(i + vec2(0.0, 1.0), 0.0)); float d = hash(vec3(i + vec2(1.0, 1.0), 0.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.25, h));
    c = mix(c, haze, (1.0 - smoothstep(0.0, 0.2, abs(h))) * 0.35);
    if (h > 0.0) {
      vec3 cell = floor(d * 240.0);
      float st = hash(cell);
      float tw = 0.65 + 0.35 * sin(time * 2.2 + st * 50.0);
      c += vec3(0.92, 0.94, 1.0) * step(0.9972, st) * stars * smoothstep(0.06, 0.35, h) * tw;
      float az = atan(d.z, d.x);
      float band = sin(az * 3.0 + time * 0.05 + sin(az * 7.0 + time * 0.13) * 0.6);
      float au = smoothstep(0.5, 1.0, band) * smoothstep(0.1, 0.28, h) * (1.0 - smoothstep(0.45, 0.8, h));
      c += mix(vec3(0.15, 1.0, 0.6), vec3(0.65, 0.35, 1.0), smoothstep(0.2, 0.5, h)) * au * aurora * 0.5;
      vec2 uv = d.xz / (h + 0.18) * 1.3 + vec2(time * 0.004, time * 0.002);
      float cl = smoothstep(1.02 - clouds * 0.75, 1.1, fbm(uv) + 0.3) * smoothstep(0.02, 0.22, h);
      c = mix(c, mix(haze, vec3(1.0), 0.65), cl * 0.6);
    }
    float s = max(dot(d, sunDir), 0.0);
    c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.12);
    gl_FragColor = vec4(c, 1.0);
  }`;

/** Time-of-day variants a hand-made map can opt into with "timeOfDay" (visual only, never balance). */
const TIME_OF_DAY = {
  dusk: { sky: 0.78, horizon: '#FFB27A', sun: { color: '#FFB37A', intensity: 2.0, elevation: 16 }, hemi: 0.85, stars: 0.35 },
  night: { sky: 0.32, horizon: '#3B3F7A', sun: { color: '#A9C2FF', intensity: 1.1, elevation: 38 }, hemi: 0.6, stars: 1 },
};

export class MapView {
  constructor(renderer, mapWorld, propDefs, settings, theme = null) {
    this.r = renderer;
    this.theme = theme;
    this.tod = TIME_OF_DAY[mapWorld.map.timeOfDay] || null;
    this.mw = mapWorld;
    this.propDefs = propDefs;
    this.settings = settings;
    this.group = new THREE.Group();
    this.group.name = `map:${mapWorld.map.id}`;
    this.clouds = null;
    this.time = 0;
    this.instanced = [];
    this.build();
    renderer.scene.add(this.group);
  }

  build() {
    const { map, terrain } = this.mw;
    const scene = this.r.scene;
    const sky = this.skyColors();
    scene.background = new THREE.Color(sky.horizon);
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    this.r.setSun(this.tod ? { ...map.sun, ...this.tod.sun } : map.sun, map.size);
    const th = this.theme;
    if (th?.hemi) {
      this.r.hemi.color.set(th.hemi.sky);
      this.r.hemi.groundColor.set(th.hemi.ground);
      this.r.hemi.intensity = th.hemi.intensity * (this.tod?.hemi ?? 1);
    }
    this.r.setGrade?.(th?.grade);
    this._buildSky();
    this._buildTerrain(map, terrain);
    this._buildProps();
    this._buildGrass(map, terrain);
    this._buildPathStones(map, terrain);
    this._buildClouds(map);
    this._buildMountains(map);
    this._buildPortalSwirls(terrain);
    this.ambient = new AmbientParticles(this.theme, map, this.settings.quality, this.settings.reducedMotion);
    this.group.add(this.ambient.points);
    this.applyQuality();
  }

  /** Sky colours with the time-of-day variant applied. */
  skyColors() {
    const sky = this.mw.map.sky;
    if (!this.tod) return sky;
    const k = this.tod.sky;
    const dim = (hex) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
    return { ...sky, top: dim(sky.top), horizon: this.tod.horizon, fog: `#${new THREE.Color(sky.fog).lerp(new THREE.Color(this.tod.horizon), 0.5).multiplyScalar(Math.max(0.45, k)).getHexString()}` };
  }

  _buildSky() {
    const { map } = this.mw;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(this.skyColors().top) },
        horizon: { value: new THREE.Color(this.skyColors().horizon) },
        haze: { value: new THREE.Color(this.theme?.sky?.haze || map.sky.horizon) },
        stars: { value: Math.max(this.theme?.sky?.stars || 0, this.tod?.stars || 0) },
        aurora: { value: this.theme?.sky?.aurora || 0 },
        clouds: { value: this.theme?.sky?.cloudCover ?? 0.3 },
        time: { value: 0 },
        bottom: { value: new THREE.Color(map.ground.grass[3]) },
        sunDir: { value: this.r.sunDir.clone() },
      },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), mat);
    dome.name = 'sky';
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this.sky = dome;
    this.group.add(dome);
  }

  _terrainMesh(x0, z0, w, d, cell, material, terrain) {
    const nx = Math.max(1, Math.round(w / cell));
    const nz = Math.max(1, Math.round(d / cell));
    const g = new THREE.PlaneGeometry(w, d, nx, nz);
    g.rotateX(-Math.PI / 2);
    g.translate(x0 + w / 2, 0, z0 + d / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.height(pos.getX(i), pos.getZ(i)));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
  }

  _buildTerrain(map, terrain) {
    const W = map.size.w;
    const D = map.size.d;
    const tex = terrainTexture(map, terrain, 8, { detail: this.theme?.ground?.detail, emissive: this.theme?.ground?.emissive });
    const tmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    // themed ground detail: glowing lava / ooze / runes (emissive map), glossy ice (roughness map)
    if (tex.userData.emissiveMap) { tmat.emissive.set('#ffffff'); tmat.emissiveMap = tex.userData.emissiveMap; tmat.emissiveIntensity = 1.3; this.groundGlow = tmat; }
    if (tex.userData.roughnessMap) { tmat.roughness = 1; tmat.roughnessMap = tex.userData.roughnessMap; tmat.metalness = 0.05; }
    const inner = this._terrainMesh(-W / 2, -D / 2, W, D, 1, tmat, terrain);
    // inner plane UVs: PlaneGeometry already spans 0..1 over the map, matching the baked texture
    inner.name = 'terrain';
    this.terrainMesh = inner;
    this.group.add(inner);

    // outer ring: coarse, tiled grass so the world never ends at the map edge
    const E = 90;
    const grain = sharedMaterials().grain.clone();
    grain.needsUpdate = true;
    grain.repeat.set(1, 1);
    const outerMat = new THREE.MeshStandardMaterial({ color: map.ground.grass[1], map: grain, roughness: 0.95 });
    const strips = [
      [-W / 2 - E, -D / 2 - E, W + 2 * E, E + 0.5],
      [-W / 2 - E, D / 2 - 0.5, W + 2 * E, E + 0.5],
      [-W / 2 - E, -D / 2, E + 0.5, D],
      [W / 2 - 0.5, -D / 2, E + 0.5, D],
    ];
    for (const [x0, z0, w, d] of strips) {
      const m = this._terrainMesh(x0, z0, w, d, 4, outerMat, terrain);
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 2), uv.getY(i) * (d / 2));
      m.position.y = -0.04;
      m.name = 'terrain-outer';
      this.group.add(m);
    }
  }

  _addInstanced(geom, material, list, castShadow, name) {
    if (!geom || !list.length) return null;
    const mesh = new THREE.InstancedMesh(geom, material, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    list.forEach((it, i) => {
      p.set(it.x, it.y, it.z);
      q.setFromAxisAngle(up, it.rot);
      s.setScalar(it.scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (it.tint !== undefined) mesh.setColorAt(i, col.setScalar(it.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.instanced.push(mesh);
    return mesh;
  }

  _buildProps() {
    const { terrain, layout } = this.mw;
    const mats = sharedMaterials();
    const rng = new Rng(`${this.mw.map.seed}:tint`);
    // group by kind + 32 m chunk so frustum culling skips off-screen batches
    const groups = new Map();
    for (const inst of layout) {
      const def = this.propDefs.get(inst.kind);
      const chunk = def.landmark ? 'L' : `${Math.floor(inst.x / 32)},${Math.floor(inst.z / 32)}`;
      const key = `${inst.kind}|${chunk}`;
      if (!groups.has(key)) groups.set(key, { def, list: [] });
      groups.get(key).list.push({
        x: inst.x,
        y: terrain.height(inst.x, inst.z) - 0.02,
        z: inst.z,
        rot: inst.rot,
        scale: inst.scale,
        tint: def.landmark ? 1 : 0.9 + rng.next() * 0.2,
      });
    }
    // decorative forest ring outside the walkable map (no colliders: unreachable)
    const { map } = this.mw;
    const W = map.size.w;
    const D = map.size.d;
    for (let i = 0, made = 0; i < 2000 && made < 320; i++) {
      const x = rng.range(-W / 2 - 60, W / 2 + 60);
      const z = rng.range(-D / 2 - 60, D / 2 + 60);
      if (Math.abs(x) < W / 2 + 1.5 && Math.abs(z) < D / 2 + 1.5) continue;
      if (terrain.pathInfo(x, z).d < 7) continue;
      const kind = x < 0 ? (rng.chance(0.15) ? 'tree_magic' : 'tree_pine') : 'tree_round';
      const key = `${kind}|outer${Math.floor(x / 60)},${Math.floor(z / 60)}`;
      if (!groups.has(key)) groups.set(key, { def: this.propDefs.get(kind), list: [] });
      groups.get(key).list.push({ x, y: terrain.height(x, z) - 0.05, z, rot: rng.range(0, 6.28), scale: rng.range(0.9, 1.6), tint: 0.85 + rng.next() * 0.2 });
      made++;
    }
    this.propMeshes = [];
    for (const [key, { def, list }] of groups) {
      const geo = propGeometry(def, 7);
      const body = this._addInstanced(geo.body, mats.body, list, !!def.castShadow, `prop:${key}`);
      const glowList = list.map((l) => ({ ...l, tint: undefined }));
      this._addInstanced(geo.glow, mats.glow, glowList, false, `glow:${key}`);
      if (body) { body.userData.castShadowDefault = !!def.castShadow; this.propMeshes.push(body); }
    }
  }

  _buildGrass(map, terrain) {
    const b = new ModelBuilder();
    b.cone(0.07, 0.42, 3, map.ground.grass[2], { pos: [0, -0.05, 0], rot: [0.15, 0, 0.1] });
    b.cone(0.06, 0.34, 3, map.ground.grass[0], { pos: [0.1, -0.05, 0.05], rot: [-0.2, 0.5, -0.25] });
    b.cone(0.06, 0.3, 3, map.ground.grass[2], { pos: [-0.08, -0.05, -0.06], rot: [0.25, 1, 0.2] });
    const geo = b.build().body;
    const rng = new Rng(`${map.seed}:grass`);
    const list = [];
    const W = map.size.w;
    const D = map.size.d;
    for (let i = 0; i < 9000 && list.length < 2600; i++) {
      const x = rng.range(-W / 2 + 1, W / 2 - 1);
      const z = rng.range(-D / 2 + 1, D / 2 - 1);
      if (terrain.pathMask(x, z) < 0.98 || terrain.slope(x, z) > 26) continue;
      list.push({ x, y: terrain.height(x, z), z, rot: rng.range(0, 6.28), scale: rng.range(0.7, 1.4), tint: rng.range(0.85, 1.1) });
    }
    // own material so only grass sways (vertex shader, height-weighted, phase from the instance position)
    const gm = sharedMaterials().body.clone();
    this.grassUniforms = { uTime: { value: 0 } };
    gm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassUniforms.uTime;
      sh.vertexShader = `uniform float uTime;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          float sw = sin(uTime * 1.6 + ph) * 0.07 + sin(uTime * 3.1 + ph * 1.7) * 0.025;
          transformed.x += sw * max(position.y, 0.0) * 2.0;
          transformed.z += sw * 0.6 * max(position.y, 0.0) * 2.0;
        #endif`);
    };
    gm.customProgramCacheKey = () => 'grass-sway';
    this.grass = this._addInstanced(geo, gm, list, false, 'grass');
  }

  _buildPathStones(map, terrain) {
    const b = new ModelBuilder();
    b.dodeca(0.22, '#A9A9B5', { scale: [1.2, 0.5, 1] });
    const geo = b.build().body;
    const rng = new Rng(`${map.seed}:stones`);
    const list = [];
    for (const p of terrain.paths) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const a = p.pts[i];
        const c = p.pts[i + 1];
        const len = Math.hypot(c.x - a.x, c.z - a.z);
        const nx = -(c.z - a.z) / len;
        const nz = (c.x - a.x) / len;
        for (let s = 0; s < len; s += 1.1) {
          if (!rng.chance(0.55)) continue;
          const t = s / len;
          const side = rng.chance(0.5) ? 1 : -1;
          const off = p.half + rng.range(-0.1, 0.5);
          const x = a.x + (c.x - a.x) * t + nx * off * side;
          const z = a.z + (c.z - a.z) * t + nz * off * side;
          list.push({ x, y: terrain.height(x, z), z, rot: rng.range(0, 6.28), scale: rng.range(0.6, 1.5), tint: rng.range(0.85, 1.05) });
        }
      }
    }
    this._addInstanced(geo, sharedMaterials().body, list, false, 'path-stones');
  }

  _buildClouds(map) {
    const b = new ModelBuilder();
    b.ico(3.2, 1, '#FFFFFF', { scale: [1.6, 0.6, 1] });
    b.ico(2.4, 1, '#F4F8FF', { pos: [3.2, 0.4, 0.6], scale: [1.4, 0.65, 1] });
    b.ico(2.2, 1, '#FFFFFF', { pos: [-3.0, 0.2, -0.5], scale: [1.3, 0.6, 1] });
    b.ico(1.9, 1, '#EEF4FF', { pos: [0.6, 1.4, 0.2], scale: [1.2, 0.7, 1] });
    const geo = b.build().body;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: '#E8F2FF', emissiveIntensity: 0.62 * (this.tod?.sky ?? 1), fog: false });
    const rng = new Rng(`${map.seed}:clouds`);
    this.cloudData = [];
    for (let i = 0; i < 16; i++) {
      this.cloudData.push({ x: rng.range(-220, 220), y: rng.range(48, 70), z: rng.range(-200, 200), rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.8), speed: rng.range(0.6, 1.4) });
    }
    this.clouds = new THREE.InstancedMesh(geo, mat, this.cloudData.length);
    this.clouds.name = 'clouds';
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
    this._updateClouds(0);
  }

  _updateClouds(dt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    this.cloudData.forEach((c, i) => {
      c.x += c.speed * dt * 1.2;
      if (c.x > 240) c.x = -240;
      p.set(c.x, c.y, c.z);
      q.setFromAxisAngle(up, c.rot);
      s.setScalar(c.scale);
      m.compose(p, q, s);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  _buildMountains(map) {
    const b = new ModelBuilder();
    b.cone(40, 55, 6, '#7C8C9E', { pos: [0, -5, 0] });
    b.cone(18, 16, 6, '#F4F7FB', { pos: [0, 34.5, 0] });
    b.cone(28, 36, 6, '#6C7B8E', { pos: [30, -5, 10] });
    const geo = b.build().body;
    // distant silhouettes take the theme's tint and horizon haze
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false, color: this.theme?.sky?.silhouette || '#FFFFFF', emissive: this.theme?.sky?.haze || '#9DB7D6', emissiveIntensity: this.theme ? 0.22 : 0.35 });
    const rng = new Rng(`${map.seed}:mountains`);
    const list = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const r = rng.range(230, 300);
      list.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.5) });
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((it, i) => {
      m.compose(new THREE.Vector3(it.x, it.y, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot), new THREE.Vector3(it.scale, it.scale * 0.9, it.scale));
      mesh.setMatrixAt(i, m);
    });
    mesh.name = 'mountains';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  applyQuality() {
    const q = this.r.q;
    for (const m of this.propMeshes || []) m.castShadow = q.propShadows && m.userData.castShadowDefault;
    if (this.grass) this.grass.visible = this.settings.quality !== 'low';
    if (this.ambient) this.ambient.points.visible = this.settings.ambientFx !== false && this.ambient.p.length > 0;
  }

  /** Animated Blight vortex in every enemy portal (pixel-quantised spiral, glow via colour only). */
  _buildPortalSwirls(terrain) {
    const portals = this.mw.layout.filter((p) => p.kind === 'enemy_portal');
    if (!portals.length) return;
    this.swirlUniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.swirlUniforms,
        cDark: { value: new THREE.Color('#14061F') },
        cArm: { value: new THREE.Color('#FF3CAC').multiplyScalar(1.5) },
        cEdge: { value: new THREE.Color('#E63946').multiplyScalar(1.6) },
        cCore: { value: new THREE.Color('#FF9AD5').multiplyScalar(1.8) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 cDark, cArm, cEdge, cCore; varying vec2 vUv;
        void main() {
          vec2 p = floor((vUv * 2.0 - 1.0) * 23.0) / 23.0; // ~16 texels per metre, like the rest of the art
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float arms = sin(a * 3.0 + r * 10.0 - uTime * 1.7) * 0.5 + 0.5;
          arms = floor(arms * 4.0) / 4.0 * smoothstep(1.0, 0.25, r);
          vec3 col = mix(cDark, cArm, arms * 0.85);
          col += cEdge * step(0.86, r) * 0.7;
          col = mix(col, cCore, step(r, 0.22 + 0.04 * sin(uTime * 2.3)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const geo = new THREE.CircleGeometry(2.75, 40);
    for (const p of portals) {
      const g = new THREE.Group();
      g.position.set(p.x, terrain.height(p.x, p.z) - 0.02 + 3.7 * (p.scale || 1), p.z);
      g.rotation.y = p.rot || 0;
      g.scale.setScalar(p.scale || 1);
      for (const side of [1, -1]) {
        const disc = new THREE.Mesh(geo, mat);
        disc.position.x = side * 0.075;
        disc.rotation.y = side * Math.PI / 2;
        g.add(disc);
      }
      g.name = 'portal-swirl';
      this.group.add(g);
    }
  }

  update(dt, cameraPos) {
    this.time += dt;
    if (this.swirlUniforms && !this.settings.reducedMotion) this.swirlUniforms.uTime.value = this.time;
    if (this.clouds) this._updateClouds(dt);
    const calm = this.settings.reducedMotion;
    if (this.sky) this.sky.material.uniforms.time.value = calm ? 0 : this.time;
    if (this.grassUniforms) this.grassUniforms.uTime.value = calm ? 0 : this.time;
    if (this.ambient?.points.visible) this.ambient.update(dt);
    if (this.groundGlow && !calm) this.groundGlow.emissiveIntensity = 1.15 + Math.sin(this.time * 1.3) * 0.25 + Math.sin(this.time * 3.7) * 0.08;
    if (this.sky && cameraPos) this.sky.position.copy(cameraPos);
  }
}
