// Renders a Match (src/sim/match.js) read-only: enemies and allies through instanced rigs,
// towers as animated models, projectiles, mines, health bars, telegraphs and event-driven VFX.
import * as THREE from 'three';
import { rigFromGLB, rigFromProcedural, InstancedRig } from './instancedRig.js';
import { loadGLB, ModelInstance, modelSrc } from './models.js';
import { matchEnemyIds } from '../sim/matchUnits.js';
import { enemyRigDef, ALLY_RIGS, TOWER_MODELS, towerBuilder, mineModel } from './unitModels.js';
import { Effects } from './effects.js';
import { ModelBuilder } from './geo.js';
import { sharedMaterials } from './mapView.js';
import { damp } from '../core/math.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const RARITY_COLOR = { rare: '#3FA9F5', epic: '#B15CFF', legendary: '#FFB627', mythic: '#FF4D6D' };
const decals = {};
/**
 * Faction base decal under every tower (docs/art-style.md material language): War = olive pad with a
 * hazard-stripe band and rivets, Magic = night-violet disc with a gold rune circle. One shared canvas
 * texture per faction (128 px), drawn once.
 */
function factionDecal(faction) {
  if (decals[faction]) return decals[faction];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  if (faction === 'war') {
    g.fillStyle = 'rgba(61,68,81,0.55)';
    g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#1B1D20' : '#F28C28';
      g.beginPath(); g.arc(0, 0, 62, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2); g.arc(0, 0, 52, ((i + 1) / 24) * Math.PI * 2, (i / 24) * Math.PI * 2, true); g.fill();
    }
    g.fillStyle = '#A7AE9A';
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillRect(Math.cos(a) * 44 - 2, Math.sin(a) * 44 - 2, 4, 4); }
  } else {
    g.fillStyle = 'rgba(30,27,75,0.5)';
    g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#FFD166';
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#C9A7FF';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      // simple angular runes between the two circles
      const a = (i / 12) * Math.PI * 2;
      g.save(); g.rotate(a); g.translate(0, -55);
      g.beginPath();
      if (i % 3 === 0) { g.moveTo(-3, -3); g.lineTo(0, 3); g.lineTo(3, -3); } else if (i % 3 === 1) { g.moveTo(0, -4); g.lineTo(0, 4); g.moveTo(-3, 0); g.lineTo(3, -2); } else { g.moveTo(-3, 3); g.lineTo(0, -3); g.lineTo(3, 3); g.moveTo(-2, 1); g.lineTo(2, 1); }
      g.stroke(); g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  decals[faction] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(faction === 'war' ? '#FFFFFF' : '#FFFFFF').multiplyScalar(faction === 'war' ? 1 : 1.5), polygonOffset: true, polygonOffsetFactor: -2 });
  return decals[faction];
}

const PROJECTILES = {
  bullet: { color: '#FFD27A', size: [0.06, 0.06, 0.5], glow: 2.6 },
  tracer: { color: '#FFF3B0', size: [0.05, 0.05, 1.6], glow: 3 },
  grenade: { color: '#47552C', size: [0.18, 0.18, 0.18], glow: 0 },
  rocket: { color: '#FF9F1C', size: [0.16, 0.16, 0.55], glow: 2.4 },
  fireball: { color: '#FF6B35', size: [0.34, 0.34, 0.34], glow: 2.6 },
  frostbolt: { color: '#7FDBFF', size: [0.16, 0.16, 0.6], glow: 2.4 },
  sunbolt: { color: '#FFF3B0', size: [0.3, 0.3, 0.3], glow: 2.8 },
  railslug: { color: '#7FF6FF', size: [0.09, 0.09, 2.4], glow: 3.2 },
  starshard: { color: '#C9A7FF', size: [0.32, 0.32, 0.32], glow: 3 },
};

/** Hit effects for hero skills added in data (ring colour at cast, particle burst on hit). */
/** Hero skill VFX now live in data/vfx.json as ability.<id> presets (cast ring colour = first ring step). */

export class MatchView {
  constructor(renderer, match, content, settings, overlay, looks = {}) {
    this.looks = looks; // equipped cosmetics: {projectile, plinth} (data/cosmetics.json items)
    this.r = renderer;
    this.match = match;
    this.content = content;
    this.settings = settings;
    this.scene = renderer.scene;
    this.group = new THREE.Group();
    this.group.name = 'match';
    this.scene.add(this.group);
    this.fx = new Effects(this.scene, renderer.camera, overlay, settings);
    this.fx.setLibrary(content.vfx, settings.quality);
    this.timeScale = 1; // < 1 during slow-motion moments (boss death); read by the controller
    this.slowmo = null;
    this.auraT = 0;
    this.enemyRigs = new Map(); // defId -> InstancedRig
    this.pendingRigs = new Map(); // defId -> Promise while a rig is being baked
    this.allyRigs = new Map();
    this.enemyVis = new Map(); // id -> visual state
    this.dying = [];
    this.towerVis = new Map();
    this.allyVis = new Map();
    this.time = 0;
    this.selected = null;
    this._buildProjectiles();
    this._buildMines();
    this._buildBars();
    this._buildRanges();
    this.telegraphs = new Map();
  }

  /** Load / bake the models this match can field (call before the first frame). Enemies outside
   *  the match's waves and their spawn graph are loaded on demand (_drawEnemy). A model that fails
   *  to load never stops the match: it gets a code-built stand-in and a console warning. */
  async preload() {
    const tasks = [];
    for (const id of matchEnemyIds(this.match)) tasks.push(this._enemyAsset(this.content.enemies.get(id)));
    for (const id of Object.keys(ALLY_RIGS)) this._allyAsset(id);
    for (const id of new Set(this.match.loadout)) {
      const def = this.content.towers.get(id);
      const glb = def && modelSrc(this.content, def);
      if (glb) tasks.push(loadGLB(glb).catch((err) => console.warn(`tower model ${id} failed to load; using a stand-in`, err)));
    }
    await Promise.all(tasks);
  }

  _enemyAsset(def) {
    if (this.enemyRigs.has(def.id)) return Promise.resolve(this.enemyRigs.get(def.id));
    if (!this.pendingRigs.has(def.id)) {
      const job = this._bakeEnemy(def).then((asset) => {
        if (this.disposed) return null;
        const rig = new InstancedRig(asset, this.group, def.boss ? 2 : 24);
        rig.setShadows(this.r.q?.propShadows ?? true);
        this.enemyRigs.set(def.id, rig);
        return rig;
      }).finally(() => this.pendingRigs.delete(def.id));
      this.pendingRigs.set(def.id, job);
    }
    return this.pendingRigs.get(def.id);
  }

  async _bakeEnemy(def) {
    const procedural = () => {
      const rd = enemyRigDef(def);
      return rigFromProcedural(rd, { idle: 'idle', move: 'move', attack: 'attack', death: 'death' }, { height: rd.height, transparent: rd.transparent || 0 });
    };
    const glb = modelSrc(this.content, def);
    if (!glb) return procedural();
    try {
      return await rigFromGLB(glb, glb.clips, { transparent: def.stealth ? 0.45 : 0 });
    } catch (err) {
      console.warn(`enemy model ${def.id} failed to load; using a code-built stand-in`, err);
      return procedural();
    }
  }

  _allyAsset(id) {
    if (!this.allyRigs.has(id)) {
      const rd = ALLY_RIGS[id] || ALLY_RIGS.spirit_wolf;
      const asset = rigFromProcedural(rd, { idle: 'idle', move: 'move', attack: 'attack', death: 'death' }, { height: rd.height });
      this.allyRigs.set(id, new InstancedRig(asset, this.group, 8));
    }
    return this.allyRigs.get(id);
  }

  _buildProjectiles() {
    this.proj = new Map();
    for (const [kind, p] of Object.entries(PROJECTILES)) {
      const color = new THREE.Color(p.color);
      const fx = this.looks.projectile;
      if (fx?.tint) color.lerp(new THREE.Color(fx.tint), fx.mix ?? 0.6);
      if (p.glow) color.multiplyScalar(p.glow);
      const mat = p.glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, flatShading: true });
      const geo = kind === 'fireball' || kind === 'sunbolt' || kind === 'grenade' || kind === 'starshard' ? new THREE.IcosahedronGeometry(0.5, 0) : new THREE.BoxGeometry(1, 1, 1);
      const im = new THREE.InstancedMesh(geo, mat, 256);
      im.frustumCulled = false;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
      this.proj.set(kind, { im, size: p.size });
    }
  }

  _buildMines() {
    const g = mineModel();
    const mats = sharedMaterials();
    this.mineMeshes = [g.body, g.glow].filter(Boolean).map((geo, i) => {
      const im = new THREE.InstancedMesh(geo, i ? mats.glow : mats.body, 64);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
  }

  _buildBars() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mk = (color, order) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }), 400);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = order;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
      return im;
    };
    this.barBg = mk('#12141C', 10);
    this.barHp = mk('#5FD068', 11);
    this.barShield = mk('#7FDBFF', 12);
  }

  _buildRanges() {
    // selected-tower range ring + placement ring (solid when valid, dashed + cross when not)
    const solid = new THREE.RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2);
    const dashedPts = [];
    for (let i = 0; i < 48; i++) {
      if (i % 2) continue;
      const a0 = (i / 48) * Math.PI * 2;
      const a1 = ((i + 1) / 48) * Math.PI * 2;
      dashedPts.push(new THREE.RingGeometry(0.95, 1, 4, 1, a0, a1 - a0).rotateX(-Math.PI / 2));
    }
    this.rangeRing = new THREE.Mesh(solid, new THREE.MeshBasicMaterial({ color: '#FFD166', transparent: true, opacity: 0.85, depthWrite: false }));
    this.rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#FFD166', transparent: true, opacity: 0.08, depthWrite: false }));
    this.rangeRing.renderOrder = this.rangeFill.renderOrder = 4;
    this.rangeRing.visible = this.rangeFill.visible = false;
    this.group.add(this.rangeRing, this.rangeFill);
    this.dashedGroup = new THREE.Group();
    const dmat = new THREE.MeshBasicMaterial({ color: '#E5484D', transparent: true, opacity: 0.95, depthWrite: false });
    for (const g of dashedPts) { const m = new THREE.Mesh(g, dmat); m.renderOrder = 4; this.dashedGroup.add(m); }
    this.dashedGroup.visible = false;
    this.group.add(this.dashedGroup);
    // footprint marker: check (valid) or cross (invalid) drawn as glowing bars
    const b = new ModelBuilder();
    b.box(0.18, 0.04, 0.55, '#5FD068', { glow: true, intensity: 1.6, pos: [-0.12, 0, 0.08], rot: [0, 0.8, 0] });
    b.box(0.18, 0.04, 0.95, '#5FD068', { glow: true, intensity: 1.6, pos: [0.2, 0, -0.05], rot: [0, -0.6, 0] });
    this.checkMark = new THREE.Mesh(b.build().glow, sharedMaterials().glow);
    const x = new ModelBuilder();
    x.box(0.18, 0.04, 1.1, '#E5484D', { glow: true, intensity: 1.6, rot: [0, 0.78, 0] });
    x.box(0.18, 0.04, 1.1, '#E5484D', { glow: true, intensity: 1.6, rot: [0, -0.78, 0] });
    this.crossMark = new THREE.Mesh(x.build().glow, sharedMaterials().glow);
    this.checkMark.visible = this.crossMark.visible = false;
    this.group.add(this.checkMark, this.crossMark);
    this.ghost = null;
    this.ghostId = null;
  }

  // ------------------------------------------------------------------------- towers ---------
  /** Base plate material: the faction decal, recoloured when a plinth cosmetic is equipped (one
   *  material per faction per match, freed with the view). */
  _plinthMaterial(faction) {
    const base = factionDecal(faction);
    const col = this.looks.plinth?.color;
    if (!col) return base;
    this.plinths ||= {};
    if (!this.plinths[faction]) {
      this.plinths[faction] = base.clone();
      this.plinths[faction].color = new THREE.Color(col).multiplyScalar(1.3);
    }
    return this.plinths[faction];
  }

  _makeTower(t) {
    const def = t.def;
    const vis = { uid: t.uid, defId: def.id, root: new THREE.Group(), inst: null, parts: {}, unit: null, yaw: t.rot || 0, recoil: 0, attackT: 9, scale: 1, evolved: false, muzzle: new THREE.Vector3(0, 1.4, 0.8) };
    const glb = modelSrc(this.content, def);
    if (glb) {
      loadGLB(glb).then((gltf) => {
        if (!this.towerVis.has(t.uid)) return;
        vis.inst = new ModelInstance(gltf);
        if (glb.clips?.idle) vis.inst.play(glb.clips.idle);
        vis.clips = glb.clips;
        vis.root.add(vis.inst.root);
      }).catch((err) => {
        // a missing or broken model file: a code-built stand-in keeps the tower visible and usable
        console.warn(`tower model ${def.id} failed to load; using a stand-in`, err);
        if (!this.towerVis.has(t.uid)) return;
        const built = TOWER_MODELS.rune_totem();
        vis.root.add(built.group);
        vis.parts = built.parts;
      });
      vis.muzzle.set(0, 1.25, 0.9);
    } else {
      const built = (towerBuilder(def) || TOWER_MODELS.rune_totem)();
      vis.root.add(built.group);
      vis.parts = built.parts;
      vis.muzzle.copy(built.muzzle);
      if (built.unit) { vis.unit = built.unit; this.group.add(built.unit); }
    }
    // faction base decal + rarity ring (rare and up; legendary / mythic pulse)
    vis.decal = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), this._plinthMaterial(def.faction === 'magic' ? 'magic' : 'war'));
    vis.decal.position.y = 0.05;
    vis.decal.renderOrder = 1;
    vis.root.add(vis.decal);
    if (RARITY_COLOR[def.rarity]) {
      vis.rarity = new THREE.Mesh(new THREE.RingGeometry(1.52, 1.62, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(RARITY_COLOR[def.rarity]).multiplyScalar(1.8), transparent: true, opacity: 0.85, depthWrite: false }));
      vis.rarity.position.y = 0.07;
      vis.rarity.userData.pulse = def.rarity === 'legendary' || def.rarity === 'mythic';
      vis.root.add(vis.rarity);
    }
    // tier / evolution marker ring
    vis.aura = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD166').multiplyScalar(2), transparent: true, opacity: 0.0, depthWrite: false }));
    vis.aura.position.y = 0.12;
    vis.root.add(vis.aura);
    // stun marker
    const sb = new ModelBuilder();
    for (let i = 0; i < 3; i++) sb.octa(0.12, '#C9A7FF', { glow: true, pos: [Math.cos(i * 2.1) * 0.45, 0, Math.sin(i * 2.1) * 0.45] });
    vis.stun = new THREE.Mesh(sb.build().glow, sharedMaterials().glow);
    vis.stun.visible = false;
    vis.root.add(vis.stun);
    vis.root.position.set(t.x, t.y, t.z);
    this.group.add(vis.root);
    this.towerVis.set(t.uid, vis);
    this._vfx('place', t.x, t.y + 0.2, t.z);
    return vis;
  }

  _removeTower(uid) {
    const vis = this.towerVis.get(uid);
    if (!vis) return;
    this.group.remove(vis.root);
    if (vis.unit) this.group.remove(vis.unit);
    this.towerVis.delete(uid);
  }

  // ------------------------------------------------------------------------- events ---------
  onEvents(events) {
    const m = this.match;
    for (const e of events) {
      switch (e.type) {
        case 'place': { const t = m.towerById(e.uid); if (t) this._makeTower(t); break; }
        case 'sell': {
          const v = this.towerVis.get(e.uid);
          if (v) this._vfx('sell', v.root.position.x, v.root.position.y + 0.5, v.root.position.z);
          this._removeTower(e.uid);
          break;
        }
        case 'move': {
          const v = this.towerVis.get(e.uid);
          const t = m.towerById(e.uid);
          if (v && t) { v.root.position.set(t.x, t.y, t.z); this.fx.ring(t.x, t.y, t.z, { color: '#7FDBFF', r1: 2 }); }
          break;
        }
        case 'upgrade': {
          const v = this.towerVis.get(e.uid);
          const t = m.towerById(e.uid);
          if (v && t) {
            this._vfx(e.evolved ? 'evolve' : 'upgrade', t.x, t.y + 1, t.z);
            if (e.evolved) v.evolved = true;
          }
          break;
        }
        case 'fire': {
          const v = this.towerVis.get(e.uid);
          if (v) {
            v.attackT = 0;
            v.recoil = 1;
            if (v.inst && v.clips?.attack) { v.inst.play(v.clips.attack, { once: true, fade: 0.05 }); v.returnIdleAt = this.time + 0.45; }
            this._vfx(`muzzle.${e.kind}`, e.x, e.y, e.z);
            if (e.kind === 'lightning') this.fx.bolt(e.x, e.y, e.z, e.tx, e.ty, e.tz);
          }
          break;
        }
        case 'chain': this.fx.bolt(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, { segments: 5 }); break;
        case 'damage': {
          const ev = this.enemyVis.get(e.id);
          if (ev) ev.flash = 1;
          if (e.amount >= 1) this.fx.number(e.x, e.y + (ev?.height || 1.5), e.z, e.amount, e.damageType);
          if (!e.dot || Math.random() < 0.25) this._vfx(`hit.${e.damageType || 'physical'}`, e.x, e.y + 0.8, e.z);
          break;
        }
        case 'explosion': {
          const lib = this.fx.lib?.presets || {};
          const name = e.kind === 'mine' ? 'explosion.mine' : lib[`explosion.${e.damageType}`] ? `explosion.${e.damageType}` : 'explosion.default';
          this._vfx(name, e.x, e.y + 0.3, e.z, { radius: e.radius });
          break;
        }
        case 'death': {
          const ev = this.enemyVis.get(e.id);
          if (ev) { ev.state = 'death'; ev.t = 0; ev.dead = true; this.dying.push(ev); this.enemyVis.delete(e.id); }
          this._vfx(e.boss ? 'death.boss' : ev?.data?.def?.flying ? 'death.flying' : 'death.normal', e.x, e.y + 0.6, e.z);
          if (e.reward) this.fx.number(e.x, e.y + 2, e.z, e.reward, 'holy', { text: `+$${e.reward}` });
          break;
        }
        case 'leak': this._vfx('leak', e.x, 1, e.z); break;
        case 'heal': this._vfx('enemyHeal', e.x, 0.1, e.z, { radius: e.radius }); break;
        case 'reveal': this._vfx('reveal', e.x, 1, e.z); break;
        case 'freeze': { const ev = this.enemyVis.get(e.id); if (ev) ev.frozen = this.time + e.duration; break; }
        case 'hex': this.fx.bolt(e.x, 6, e.z, e.x, 1.5, e.z, { segments: 5, jitter: 0.6, life: 0.3 }); break;
        case 'telegraph': this._telegraph(e); break;
        case 'telegraphHit': {
          this._vfx('boss.slam', e.x, 0.3, e.z, { radius: e.radius });
          const tg = this.telegraphs.get(e.id);
          if (tg) { this.group.remove(tg.mesh); this.telegraphs.delete(e.id); }
          break;
        }
        case 'bossPhase': { const ev = this.enemyVis.get(e.id); if (ev) { ev.state = 'roar'; ev.t = 0; ev.roarUntil = this.time + 1.4; this._vfx('boss.phase', ev.x, 0.5, ev.z); } break; }
        case 'bossBlink': this._vfx('boss.blink', e.x0, 1, e.z0); this._vfx('boss.blink', e.x, 1, e.z); break;
        case 'bossRegen': this._vfx('boss.regen', e.x, 0.2, e.z); break;
        case 'bossCloak': this._vfx('boss.cloak', e.x, 1, e.z); break;
        case 'bossImmune': this._vfx('boss.immune', e.x, 0.3, e.z); break;
        case 'immune': this.fx.number(e.x, e.y + 3, e.z, 0, e.damageType, { text: 'IMMUNE' }); break;
        case 'bossArmor': this._vfx('boss.armor', e.x, 0.3, e.z); break;
        case 'bossDash': this._vfx('boss.dash', e.x, 0.3, e.z); break;
        case 'cashDrain': this._vfx('boss.drain', e.x, 1, e.z); break;
        case 'bossPortal': this._vfx('boss.portal', e.x, 0.3, e.z); break;
        case 'bossRevive': this._vfx('boss.revive', e.x, 0.5, e.z); break;
        case 'bossSplit': this._vfx('boss.split', e.x, 0.6, e.z); break;
        case 'minePlaced': this.fx.burst(e.x, 0.2, e.z, { count: 6, color: '#C49A6C', up: 1.5, size: 0.08 }); break;
        case 'allySpawn': this._vfx('summon', e.x, 0.1, e.z); break;
        case 'allyDeath': this.fx.burst(e.x, 0.6, e.z, { count: 14, color: '#7FF6FF', up: 3 }); break;
        case 'heroAttack': this.fx.bolt(e.x, 1.2, e.z, e.tx, 1.0, e.tz, { segments: 3, jitter: 0.15, life: 0.12 }); this.fx.burst(e.tx, 1, e.tz, { count: 6, color: '#C9A7FF', up: 1.5, speed: 2 }); break;
        case 'abilityCast': this.fx.ring(e.x, 0.1, e.z, { color: this.fx.lib?.presets?.[`ability.${e.id}`]?.find((st) => st.ring)?.ring.color || '#FFD166', r0: e.radius, r1: e.radius * 1.02, life: Math.max(0.4, e.delay + 0.2), intensity: 2 }); break;
        case 'abilityHit': {
          this._vfx(`ability.${e.id}`, e.x, 0, e.z, { radius: e.radius });
          this.fx.ring(e.x, 0.1, e.z, { color: '#FFFFFF', r0: 0.5, r1: e.radius, life: 0.5 });
          break;
        }
        default: break;
      }
    }
  }

  /** Plays a data/vfx.json preset and applies its side effects (shake, flash, slow motion). */
  _vfx(name, x, y, z, opts) {
    const side = this.fx.play(name, x, y, z, opts);
    if (!side) return;
    const calm = this.settings.reducedMotion;
    if (side.shake && !calm) this.shake = Math.max(this.shake || 0, side.shake);
    if (side.flash) this.r.flash?.(side.flash.color, side.flash.alpha, side.flash.life);
    if (side.slowmo && !calm) this.slowmo = { scale: side.slowmo.scale, until: this.time + side.slowmo.seconds, len: side.slowmo.seconds };
  }

  /** Status auras: a few particles on burning, slowed, stunned, marked and shielded enemies (capped). */
  _auras(dt) {
    this.auraT += dt;
    if (this.auraT < 0.12) return;
    this.auraT = 0;
    const m = this.match;
    let n = 0;
    for (const e of m.enemies) {
      if (!e.alive || n > 24) continue;
      const v = this.enemyVis.get(e.id);
      if (!v) continue;
      const y = v.y + (v.height || 1.5) * 0.6;
      if (e.burnUntil > m.time) { this._vfx('status.burn', v.x, y, v.z); n++; }
      if (e.slowUntil > m.time) { this._vfx('status.slow', v.x, y, v.z); n++; }
      if (e.stunUntil > m.time) { this._vfx('status.stun', v.x, y + 0.6, v.z); n++; }
      if (e.markUntil > m.time) { this._vfx('status.mark', v.x, y + 0.8, v.z); n++; }
      if (e.shield > 0) { this._vfx('status.shield', v.x, y, v.z); n++; }
    }
  }

  _telegraph(e) {
    const mesh = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#E63946', transparent: true, opacity: 0.18, depthWrite: false }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#E63946').multiplyScalar(2), transparent: true, depthWrite: false }));
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD166').multiplyScalar(2), transparent: true, depthWrite: false }));
    fill.renderOrder = edge.renderOrder = inner.renderOrder = 5;
    mesh.add(fill, edge, inner);
    mesh.position.set(e.x, this.match.mw.terrain.height(e.x, e.z) + 0.12, e.z);
    mesh.scale.setScalar(e.radius);
    this.group.add(mesh);
    this.telegraphs.set(e.id, { mesh, inner, start: this.time, delay: e.delay });
  }

  // ------------------------------------------------------------------------- placement ------
  /** Show a placement preview: towerId at (x,z) with validity {ok, reason}. */
  setPreview(towerId, x, z, valid, range) {
    this.previewActive = !!towerId;
    if (!towerId) {
      this.rangeRing.visible = this.rangeFill.visible = this.dashedGroup.visible = this.checkMark.visible = this.crossMark.visible = false;
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const y = this.match.mw.terrain.height(x, z) + 0.06;
    if (towerId.startsWith('__')) {
      // ability aiming: just the area ring
      if (this.ghost) this.ghost.visible = false;
      this.checkMark.visible = this.crossMark.visible = this.dashedGroup.visible = false;
      this.rangeRing.visible = this.rangeFill.visible = true;
      this.rangeRing.material.color.set('#E5484D');
      this.rangeFill.material.color.set('#E5484D');
      this.rangeRing.position.set(x, y, z); this.rangeRing.scale.set(range, 1, range);
      this.rangeFill.position.set(x, y, z); this.rangeFill.scale.set(range, 1, range);
      return;
    }
    if (this.ghostId !== towerId) {
      if (this.ghost) this.group.remove(this.ghost);
      this.ghost = this._ghostModel(towerId);
      this.ghostId = towerId;
      this.group.add(this.ghost);
    }
    this.ghost.visible = true;
    this.ghost.position.set(x, y - 0.06, z);
    this.ghost.traverse((o) => { if (o.isMesh) o.material.color.set(valid ? '#9FE6A0' : '#FF8A8A'); });
    const r = Math.max(1.2, range || 1.2);
    this.rangeRing.visible = this.rangeFill.visible = valid;
    this.dashedGroup.visible = !valid;
    this.rangeRing.position.set(x, y, z); this.rangeRing.scale.set(r, 1, r);
    this.rangeFill.position.set(x, y, z); this.rangeFill.scale.set(r, 1, r);
    this.rangeRing.material.color.set('#5FD068');
    this.rangeFill.material.color.set('#5FD068');
    this.dashedGroup.position.set(x, y, z); this.dashedGroup.scale.set(r, 1, r);
    this.checkMark.visible = valid;
    this.crossMark.visible = !valid;
    const mark = valid ? this.checkMark : this.crossMark;
    mark.position.set(x, y + 3.2 + Math.sin(this.time * 4) * 0.1, z);
    mark.rotation.y = this.r.camera.rotation.y;
  }

  _ghostModel(towerId) {
    const def = this.content.towers.get(towerId);
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#9FE6A0', transparent: true, opacity: 0.45, depthWrite: false });
    const src = towerBuilder(def)?.().group || null;
    if (src) {
      src.traverse((o) => { if (o.isMesh) o.material = mat; });
      g.add(src);
    } else {
      const glb = modelSrc(this.content, def);
      if (glb) loadGLB(glb).then((gltf) => {
        const inst = new ModelInstance(gltf);
        inst.root.traverse((o) => { if (o.isMesh) o.material = mat; });
        g.add(inst.root);
      }).catch((err) => console.warn(`ghost model ${def.id} failed to load`, err));
    }
    return g;
  }

  /** Highlight the selected tower's range. */
  select(uid) {
    this.selected = uid;
  }

  // ------------------------------------------------------------------------- per frame ------
  update(dt) {
    this.time += dt;
    const m = this.match;
    const cam = this.r.camera;

    // --- enemies
    for (const rig of this.enemyRigs.values()) rig.begin();
    const seen = new Set();
    for (const e of m.enemies) {
      if (!e.alive) continue;
      seen.add(e.id);
      let v = this.enemyVis.get(e.id);
      if (!v) {
        v = { id: e.id, defId: e.defId, x: e.x, y: e.y, z: e.z, yaw: e.heading, state: 'move', t: Math.random(), flash: 0, scale: 1, height: 1.5, boss: e.boss, spawnT: 0 };
        this.enemyVis.set(e.id, v);
        if (e.boss) { this._vfx('boss.spawn', e.x, 0.1, e.z); this.bossSeen = e.id; }
      }
      const k = damp(20, dt);
      v.x += (e.x - v.x) * k; v.y += (e.y - v.y) * k; v.z += (e.z - v.z) * k;
      v.yaw += wrap(e.heading - v.yaw) * damp(10, dt);
      const frozen = (v.frozen || 0) > this.time;
      const stunned = e.stunUntil > m.time;
      if (v.state !== 'roar' || this.time > (v.roarUntil || 0)) v.state = e.blocked ? 'attack' : e.curSpeed > 0.05 ? 'move' : 'idle';
      if (!frozen && !stunned) v.t += dt * (e.curSpeed > 0 ? Math.max(0.5, e.curSpeed / Math.max(0.5, e.baseSpeed)) : 1);
      v.flash = Math.max(0, v.flash - dt * 6);
      v.spawnT += dt;
      v.data = e;
    }
    for (const id of [...this.enemyVis.keys()]) if (!seen.has(id)) this.enemyVis.delete(id); // leaked
    for (const v of this.enemyVis.values()) this._drawEnemy(v);
    this.dying = this.dying.filter((v) => {
      v.t += dt;
      if (v.t > 1.6) return false;
      this._drawEnemy(v);
      return true;
    });
    for (const rig of this.enemyRigs.values()) rig.end();

    // --- allies
    for (const rig of this.allyRigs.values()) rig.begin();
    const seenA = new Set();
    for (const a of m.allies) {
      if (a.dead) continue;
      seenA.add(a.id);
      let v = this.allyVis.get(a.id);
      if (!v) { v = { x: a.x, z: a.z, y: a.y, yaw: a.heading, t: 0 }; this.allyVis.set(a.id, v); }
      const k = damp(20, dt);
      v.x += (a.x - v.x) * k; v.z += (a.z - v.z) * k; v.y += (a.y - v.y) * k;
      v.yaw += wrap(a.heading - v.yaw) * damp(10, dt);
      v.t += dt;
      const rig = this._allyAsset(a.kind);
      _m.compose(_v.set(v.x, v.y, v.z), _q.setFromAxisAngle(UP, v.yaw), _s.set(1, 1, 1));
      rig.add(_m, a.fighting ? 'attack' : 'move', a.fighting ? v.t % 0.45 : v.t);
    }
    for (const id of [...this.allyVis.keys()]) if (!seenA.has(id)) this.allyVis.delete(id);
    for (const rig of this.allyRigs.values()) rig.end();

    // --- towers
    for (const t of m.towers) {
      const v = this.towerVis.get(t.uid) || this._makeTower(t);
      if (v.rarity?.userData.pulse) v.rarity.material.opacity = this.settings.reducedMotion ? 0.85 : 0.55 + 0.35 * Math.sin(this.time * 2.4 + t.uid);
      const tgt = t.target && m.enemies.find((e) => e.id === t.target && e.alive);
      const ox = v.unit ? t.unit.x : t.x;
      const oz = v.unit ? t.unit.z : t.z;
      if (tgt) v.aimYaw = Math.atan2(tgt.x - ox, tgt.z - oz);
      if (v.aimYaw !== undefined && !v.unit) {
        const turret = v.parts.turret;
        if (turret) turret.rotation.y += wrap(v.aimYaw - turret.rotation.y) * damp(10, dt);
        else v.root.rotation.y += wrap(v.aimYaw - v.root.rotation.y) * damp(10, dt);
      }
      v.recoil = Math.max(0, v.recoil - dt * 8);
      if (v.parts.recoil && v.parts.recoil !== v.parts.turret) v.parts.recoil.position.z = -0.12 * v.recoil;
      for (const p of v.parts.spinY || []) p.rotation.y += dt * (p.name === 'rotor' ? 22 : 1.2);
      for (const p of v.parts.spinX || []) p.rotation.x += dt * 30;
      for (const p of v.parts.spinZ || []) p.rotation.z += dt * (v.recoil > 0 ? 25 : 2);
      if (v.parts.bob) v.parts.bob.position.y += (Math.sin(this.time * 2 + t.uid) * 0.0015);
      if (v.parts.sway) v.parts.sway.rotation.y = Math.sin(this.time * 2 + t.uid) * 0.25;
      if (v.inst) {
        v.inst.update(dt);
        if (v.returnIdleAt && this.time > v.returnIdleAt && v.clips?.idle) { v.inst.play(v.clips.idle, { fade: 0.2 }); v.returnIdleAt = 0; }
        // static pack towers have no attack clip: kick the whole model back a little when firing
        if (!v.clips?.attack) v.inst.root.position.z = -0.12 * v.recoil;
      }
      if (v.unit && t.unit) {
        v.unit.position.set(t.unit.x, t.unit.y + Math.sin(this.time * 1.7 + t.uid) * 0.25, t.unit.z);
        const heading = v.aimYaw ?? t.unit.angle + Math.PI;
        v.unit.rotation.y += wrap(heading - v.unit.rotation.y) * damp(4, dt);
        v.unit.rotation.z = Math.sin(this.time * 1.3) * 0.05;
      }
      const evo = t.evolved || t.lobbyLevel >= 5;
      v.aura.material.opacity = evo ? 0.55 + Math.sin(this.time * 3) * 0.2 : t.tier > 0 ? 0.2 : 0;
      v.aura.material.color.set(t.evolved ? '#C9A7FF' : '#FFD166').multiplyScalar(2);
      const targetScale = t.evolved ? 1.14 : 1 + t.tier * 0.02;
      v.scale += (targetScale - v.scale) * damp(6, dt);
      v.root.scale.setScalar(v.scale);
      v.stun.visible = t.stunUntil > m.time;
      if (v.stun.visible) { v.stun.position.y = 2.6; v.stun.rotation.y += dt * 4; }
    }
    for (const uid of [...this.towerVis.keys()]) if (!m.towerById(uid)) this._removeTower(uid);

    // --- selection range
    const sel = this.selected && m.towerById(this.selected);
    if (sel && !this.previewActive) {
      this.rangeRing.visible = this.rangeFill.visible = true;
      this.rangeRing.material.color.set('#FFD166');
      this.rangeFill.material.color.set('#FFD166');
      const rr = Math.max(1.5, m.effective(sel).range || 2);
      this.rangeRing.position.set(sel.x, sel.y + 0.08, sel.z); this.rangeRing.scale.set(rr, 1, rr);
      this.rangeFill.position.set(sel.x, sel.y + 0.08, sel.z); this.rangeFill.scale.set(rr, 1, rr);
    } else if (!this.previewActive) {
      this.rangeRing.visible = this.rangeFill.visible = false;
    }

    // --- projectiles
    const counts = new Map();
    for (const p of m.projectiles) {
      const pr = this.proj.get(p.kind) || this.proj.get('bullet');
      const i = counts.get(pr) || 0;
      if (i >= 256) continue;
      const dx = p.tx - p.x; const dy = p.ty - p.y; const dz = p.tz - p.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      _q.setFromUnitVectors(_v.set(0, 0, 1), _s.set(dx / len, dy / len, dz / len));
      _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(...pr.size));
      pr.im.setMatrixAt(i, _m);
      counts.set(pr, i + 1);
      if ((p.kind === 'rocket' || p.kind === 'fireball') && Math.random() < 0.5) this.fx.burst(p.x, p.y, p.z, { count: 1, color: p.kind === 'rocket' ? '#BBBBBB' : '#FF9F1C', speed: 0.2, up: 0.4, size: 0.12, life: 0.35, gravity: -1 });
    }
    for (const pr of this.proj.values()) { pr.im.count = counts.get(pr) || 0; pr.im.instanceMatrix.needsUpdate = true; }

    // --- mines
    let mi = 0;
    for (const mine of m.mines) {
      if (mine.dead || mi >= 64) continue;
      _m.compose(_v.set(mine.x, mine.y, mine.z), _q.identity(), _s.set(1, 1, 1));
      for (const im of this.mineMeshes) im.setMatrixAt(mi, _m);
      mi++;
    }
    for (const im of this.mineMeshes) { im.count = mi; im.instanceMatrix.needsUpdate = true; }

    // --- health bars (billboards)
    let bi = 0;
    _q.copy(cam.quaternion);
    for (const v of this.enemyVis.values()) {
      const e = v.data;
      if (!e || e.boss || bi >= 400) continue;
      const hurt = e.hp < e.maxHp - 0.01 || e.shield > 0;
      if (!hurt) continue;
      const w = 1.0 * Math.max(0.7, Math.min(1.6, (e.def.size || 1)));
      const top = v.y + v.height + 0.35;
      _m.compose(_v.set(v.x, top, v.z), _q, _s.set(w + 0.08, 0.17, 1));
      this.barBg.setMatrixAt(bi, _m);
      const f = Math.max(0, e.hp / e.maxHp);
      _s.set(w * f, 0.11, 1);
      _t.set(v.x, top, v.z);
      _v.set(-w * (1 - f) / 2, 0, 0.001).applyQuaternion(_q).add(_t);
      _m.compose(_v, _q, _s);
      this.barHp.setMatrixAt(bi, _m);
      const sf = e.maxShield > 0 ? Math.max(0, e.shield / e.maxShield) : 0;
      _s.set(w * sf, sf > 0 ? 0.06 : 0.0001, 1);
      _v.set(-w * (1 - sf) / 2, 0.055, 0.002).applyQuaternion(_q).add(_t);
      _m.compose(_v, _q, _s);
      this.barShield.setMatrixAt(bi, _m);
      bi++;
    }
    for (const im of [this.barBg, this.barHp, this.barShield]) { im.count = bi; im.instanceMatrix.needsUpdate = true; }

    // --- telegraphs
    for (const tg of this.telegraphs.values()) {
      const u = Math.min(1, (this.time - tg.start) / tg.delay);
      tg.inner.scale.setScalar(Math.max(0.01, u));
      tg.mesh.children[0].material.opacity = 0.12 + 0.12 * Math.abs(Math.sin(this.time * 10));
    }

    const rect = this.r.canvas.getBoundingClientRect();
    this._auras(dt);
    // slow motion eases back to normal over its last third
    if (this.slowmo) {
      const left = this.slowmo.until - this.time;
      if (left <= 0) { this.slowmo = null; this.timeScale = 1; } else this.timeScale = Math.min(1, this.slowmo.scale + (1 - this.slowmo.scale) * Math.max(0, 1 - left / (this.slowmo.len / 3)));
    }
    this.fx.update(dt, rect.width, rect.height);
  }

  _drawEnemy(v) {
    const rig = this.enemyRigs.get(v.defId);
    if (!rig) {
      // not preloaded (endless pools, rare spawns): bake it now, draw it from the next frames
      const def = this.content.enemies.get(v.defId);
      if (def && !this.pendingRigs.has(v.defId)) this._enemyAsset(def);
      return;
    }
    v.height = rig.asset.height;
    let s = v.spawnT !== undefined ? Math.min(1, 0.3 + (v.spawnT || 0) * 3) : 1;
    let state = v.state;
    let t = v.t;
    if (v.dead) {
      state = 'death';
      if (v.t > 1.1) s *= Math.max(0, 1 - (v.t - 1.1) * 2.2);
    }
    if (v.state === 'roar' && !v.dead) { state = rig.asset.clips.has('Roar') ? 'roar' : 'attack'; t = this.time - (v.roarUntil - 1.4); }
    if (s <= 0.001) return;
    _m.compose(_v.set(v.x, v.y, v.z), _q.setFromAxisAngle(UP, v.yaw), _s.setScalar(s));
    const frozen = (v.frozen || 0) > this.time;
    rig.add(_m, state, t, frozen ? 1.6 : 1 + v.flash * 1.5);
  }

  setQuality(q) {
    for (const rig of this.enemyRigs.values()) rig.setShadows(q.propShadows);
  }

  /** Match end: free everything this view created (rigs are rebuilt per match, so their baked
   *  geometry would otherwise stay on the GPU and in the renderer's caches: about 2,000 geometries
   *  and 30 MB per match before this). Materials shared between matches are kept. */
  dispose() {
    this.disposed = true; // rigs still baking are dropped when they finish
    const keep = new Set([sharedMaterials().body, sharedMaterials().glow, ...Object.values(decals)]);
    const geos = new Set();
    const mats = new Set();
    const take = (o) => {
      if (o.geometry) geos.add(o.geometry);
      for (const m of [].concat(o.material || [])) if (!keep.has(m)) mats.add(m);
    };
    for (const rig of [...this.enemyRigs.values(), ...this.allyRigs.values()]) {
      for (const m of rig.meshes) take(m);
      rig.dispose();
    }
    this.enemyRigs.clear();
    this.allyRigs.clear();
    this.fx.dispose();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      take(o);
      if (o.isInstancedMesh) o.dispose();
    });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }
}
