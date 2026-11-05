// Builds the 3D view of a map from its data + deterministic layout: terrain (inner detailed +
// outer ring), sky, clouds, instanced props (chunked for frustum culling), grass and path stones.
import * as THREE from 'three';
import { grainTexture, terrainTexture } from './textures.js';
import { propGeometry } from './propModels.js';
import { ModelBuilder } from './geo.js';
import { Rng } from '../core/rng.js';

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
const SKY_FRAG = /* glsl */ `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir;
  varying vec3 vDir;
  void main(){
    float h = vDir.y;
    vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.25, h));
    float s = max(dot(normalize(vDir), sunDir), 0.0);
    c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.12);
    gl_FragColor = vec4(c, 1.0);
  }`;

export class MapView {
  constructor(renderer, mapWorld, propDefs, settings) {
    this.r = renderer;
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
    const sky = map.sky;
    scene.background = new THREE.Color(sky.horizon);
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    this.r.setSun(map.sun, map.size);
    this._buildSky();
    this._buildTerrain(map, terrain);
    this._buildProps();
    this._buildGrass(map, terrain);
    this._buildPathStones(map, terrain);
    this._buildClouds(map);
    this._buildMountains(map);
    this.applyQuality();
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
        top: { value: new THREE.Color(map.sky.top) },
        horizon: { value: new THREE.Color(map.sky.horizon) },
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
    const tex = terrainTexture(map, terrain);
    const inner = this._terrainMesh(-W / 2, -D / 2, W, D, 1, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }), terrain);
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
    this.grass = this._addInstanced(geo, sharedMaterials().body, list, false, 'grass');
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: '#E8F2FF', emissiveIntensity: 0.62, fog: false });
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false, emissive: '#9DB7D6', emissiveIntensity: 0.35 });
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
  }

  update(dt, cameraPos) {
    this.time += dt;
    if (this.clouds) this._updateClouds(dt);
    if (this.sky && cameraPos) this.sky.position.copy(cameraPos);
  }
}
