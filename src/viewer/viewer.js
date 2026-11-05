// In-game asset viewer (viewer.html): inspect every model from any angle with its animations,
// triangle count, materials and a 1.8 m hero for scale. Used for the 4-angle art review.
import * as THREE from 'three';
import { loadContent, browserReadJson } from '../core/content.js';
import { Renderer } from '../engine/renderer.js';
import { sharedMaterials } from '../engine/mapView.js';
import { propGeometry } from '../engine/propModels.js';
import { HeroView } from '../engine/heroView.js';
import { loadGLB, ModelInstance, triangleCount } from '../engine/models.js';
import { createStorage } from '../save/storage.js';
import { loadSettings } from '../save/settings.js';

const VIEWS = {
  front: [0, 0.25, 1], back: [0, 0.25, -1], left: [-1, 0.25, 0], right: [1, 0.25, 0], top: [0.001, 1, 0.001], three_quarter: [0.8, 0.55, 0.9],
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function boot() {
  const settings = loadSettings(createStorage(), {});
  settings.quality = new URLSearchParams(location.search).get('quality') || 'high';
  const content = await loadContent(browserReadJson('data/'));
  const canvas = document.getElementById('scene');
  const r = new Renderer(canvas, settings);
  r.setSun({ azimuth: 215, elevation: 50 }, { w: 14, d: 14 });
  r.scene.background = new THREE.Color('#9fb7cf');
  r.scene.fog = null;
  r.hemi.intensity = 1.25;

  // stage: stone disc with a 1 m grid for scale
  const grid = new THREE.GridHelper(12, 12, '#3d4451', '#5d6476');
  grid.position.y = 0.002;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, 0.3, 32), new THREE.MeshStandardMaterial({ color: '#7d8a5a', roughness: 1, map: sharedMaterials().grain }));
  disc.position.y = -0.15;
  disc.receiveShadow = true;
  r.scene.add(disc, grid);

  const hero = new HeroView(r.scene);
  let showHero = true;
  const stage = new THREE.Group();
  r.scene.add(stage);

  // asset catalogue
  const assets = [];
  for (const [id, m] of content.models) assets.push({ id: `glb:${id}`, name: id.replace(/_/g, ' '), group: m.kind === 'tower' ? 'Towers (Blender GLB)' : 'Enemies (Blender GLB)', kind: 'glb', model: m });
  assets.push({ id: 'hero:commander', name: 'Commander Vale', group: 'Hero (code model)', kind: 'hero' });
  for (const p of content.props.values()) assets.push({ id: `prop:${p.id}`, name: p.id.replace(/_/g, ' '), group: 'Props (code models)', kind: 'prop', def: p });

  const list = document.querySelector('.v-groups');
  const groups = new Map();
  for (const a of assets) {
    if (!groups.has(a.group)) {
      const h = document.createElement('h2');
      h.textContent = a.group;
      list.appendChild(h);
      groups.set(a.group, true);
    }
    const b = document.createElement('button');
    b.dataset.id = a.id;
    b.innerHTML = `<span>${esc(a.name)}</span><span class="tag">${a.kind === 'glb' ? 'GLB' : 'code'}</span>`;
    b.addEventListener('click', () => select(a.id));
    list.appendChild(b);
  }

  const views = document.querySelector('.v-views');
  views.innerHTML = Object.keys(VIEWS).map((v) => `<button data-view="${v}" aria-pressed="false">${v.replace('_', ' ')}</button>`).join('')
    + '<button data-act="spin" aria-pressed="false">auto-rotate</button><button data-act="wire" aria-pressed="false">wireframe</button><button data-act="hero" aria-pressed="true">hero for scale</button>';
  views.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.view) setView(b.dataset.view);
    if (b.dataset.act === 'spin') { spin = !spin; b.setAttribute('aria-pressed', String(spin)); }
    if (b.dataset.act === 'wire') { wire = !wire; b.setAttribute('aria-pressed', String(wire)); applyWire(); }
    if (b.dataset.act === 'hero') { showHero = !showHero; b.setAttribute('aria-pressed', String(showHero)); }
  });

  let current = null;
  let inst = null;
  let spin = false;
  let wire = false;
  const cam = { yaw: 0.6, pitch: 0.35, dist: 6, target: new THREE.Vector3(0, 1, 0) };
  let size = new THREE.Vector3(1, 1, 1);

  function applyWire() {
    stage.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.wireframe = wire;
    });
  }

  function setView(name) {
    const v = new THREE.Vector3(...VIEWS[name]).normalize();
    cam.yaw = Math.atan2(v.x, v.z);
    cam.pitch = Math.asin(v.y);
    for (const b of views.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === name));
  }

  async function select(id) {
    const a = assets.find((x) => x.id === id);
    if (!a) throw new Error(`unknown asset ${id}`);
    current = a;
    for (const b of list.querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === id));
    stage.clear();
    inst = null;
    let obj;
    let clips = [];
    if (a.kind === 'glb') {
      const gltf = await loadGLB(a.model.url);
      inst = new ModelInstance(gltf);
      obj = inst.root;
      clips = [...inst.clips.keys()];
      const idle = a.model.clips?.idle || clips[0];
      if (idle) inst.play(idle);
    } else if (a.kind === 'prop') {
      const geo = propGeometry(a.def, 7);
      obj = new THREE.Group();
      const mats = sharedMaterials();
      if (geo.body) { const m = new THREE.Mesh(geo.body, mats.body.clone()); m.castShadow = true; m.receiveShadow = true; obj.add(m); }
      if (geo.glow) obj.add(new THREE.Mesh(geo.glow, mats.glow.clone()));
    } else {
      obj = new THREE.Group();
    }
    stage.add(obj);
    applyWire();
    const box = new THREE.Box3().setFromObject(a.kind === 'hero' ? hero.root : obj);
    size = box.getSize(new THREE.Vector3());
    if (a.kind === 'hero') size.set(1, 1.9, 1);
    cam.target.set(0, Math.max(0.7, size.y * 0.55), 0);
    cam.dist = Math.max(3.6, (Math.max(size.x, size.y, size.z) + 1.0) * 1.4);
    const tris = a.kind === 'hero' ? triangleCount(hero.body) : triangleCount(obj);
    const mats = new Set();
    (a.kind === 'hero' ? hero.body : obj).traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) mats.add(m); });
    const colors = [...mats].map((m) => `#${m.color.getHexString()}`);
    const info = document.querySelector('.v-info');
    info.innerHTML = `<h2>${esc(a.name)}</h2>
      <dl><dt>Type</dt><dd>${esc(a.group)}</dd><dt>Triangles</dt><dd data-testid="tris">${tris}</dd>
      <dt>Size (m)</dt><dd>${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}</dd><dt>Materials</dt><dd>${mats.size}</dd></dl>
      ${clips.length ? `<div>Animations</div><div class="clips">${clips.map((c) => `<button data-clip="${esc(c)}" aria-pressed="${c === inst?.currentName}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="swatches" aria-label="Material colours">${colors.map((c) => `<span title="${c}" style="background:${c}"></span>`).join('')}</div>
      ${a.model?.source ? `<p class="src">Source: ${esc(a.model.source)}</p>` : ''}`;
    for (const b of info.querySelectorAll('[data-clip]')) {
      b.addEventListener('click', () => play(b.dataset.clip));
    }
    window.VIEWER.info = { id, tris, size: size.toArray(), clips, materials: mats.size };
    return window.VIEWER.info;
  }

  function play(name) {
    if (!inst) return false;
    const once = /death|attack/i.test(name);
    inst.play(name, { once });
    for (const b of document.querySelectorAll('[data-clip]')) b.setAttribute('aria-pressed', String(b.dataset.clip === name));
    return true;
  }

  // orbit controls: drag to rotate, wheel / pinch to zoom
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.max(-0.2, Math.min(1.55, cam.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(1.5, Math.min(40, cam.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (spin) cam.yaw += dt * 0.6;
    const cp = Math.cos(cam.pitch);
    r.camera.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
    r.camera.lookAt(cam.target);
    inst?.update(dt);
    const heroHere = current?.kind === 'hero';
    hero.root.visible = showHero || heroHere;
    hero.blob.visible = hero.root.visible;
    const hx = heroHere ? 0 : -(Math.max(size.x, size.z) * 0.5 + 0.9);
    hero.update(dt, { x: hx, y: 0, z: 0, yaw: 0, grounded: true, sprinting: false, hSpeed: 0 }, 0, false);
    r.render();
    window.VIEWER.frames++;
    requestAnimationFrame(frame);
  }

  window.VIEWER = { ready: false, frames: 0, assets: assets.map((a) => a.id), select, setView, play, info: null };
  await select(assets[0].id);
  setView('three_quarter');
  document.getElementById('loading').classList.add('done');
  window.VIEWER.ready = true;
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  const t = document.querySelector('#loading .load-text');
  if (t) t.textContent = `Could not start: ${err.message}`;
});
