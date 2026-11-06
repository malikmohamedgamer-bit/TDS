// Modular code-built towers (ROADMAP Chunk 1 / 2): a faction base, a class head that turns to aim, and one
// add-on per new mechanic (crit gem, ramp spool, ram piston, drill tip, fan barrels, coin box, skull totem).
// Data: tower `model.kit = { base, head, addon, accent }` (written by tools/gen-towers.mjs). Front = +Z, up = +Y.
// Builds the same shape as TOWER_MODELS entries: {group, parts: {turret, recoil, spinZ?, spinY?, bob?}, muzzle}.
// Faction material language: War = olive / gunmetal / khaki with hazard trim; Magic = stone with gold trim and
// glowing runes (glow only through emissive parts, docs/art-style.md).
import * as THREE from 'three';
import { ModelBuilder } from './geo.js';
import { sharedMaterials } from './mapView.js';

const P = Math.PI;
const TAU = P * 2;

const PAL = {
  war: { main: '#5B6B3A', dark: '#47552C', metal: '#3D4451', steel: '#8A939E', trim: '#F28C28', light: '#C2B280', black: '#1C1E24' },
  magic: { main: '#8D8D99', dark: '#6E6E7A', metal: '#3A3D5C', steel: '#A9A9B5', trim: '#FFD166', light: '#D6CFC7', black: '#1E1B4B' },
};
export const KIT_ACCENTS = { cyan: '#7FF6FF', gold: '#FFD166', crimson: '#E63946', toxic: '#9BE564', violet: '#C9A7FF', ember: '#FF6B35', magenta: '#FF3CAC', ice: '#BDEBFF' };

// ------------------------------------------------------------------------------------------- bases
// each returns the height H of the platform top
export const KIT_BASES = {
  // war: sandbag ring on a steel pad
  bunker: { h: 0.55, build: (b, c) => {
    b.cyl(1.1, 1.15, 0.22, 8, c.metal, { pos: [0, -0.08, 0] });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; if (Math.abs(Math.cos(a - P / 2) - 1) < 0.25) continue; b.box(0.5, 0.26, 0.28, i % 2 ? c.light : c.dark, { pos: [Math.cos(a) * 0.9, 0.2, Math.sin(a) * 0.9], rot: [0, -a + P / 2, 0] }); }
    b.cyl(0.7, 0.8, 0.18, 8, c.dark, { pos: [0, 0.3, 0] });
  } },
  // war: lattice mast on four legs
  mast: { h: 1.6, build: (b, c) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 1.6, 0.14, c.metal, { pos: [sx * 0.6, 0.7, sz * 0.6], rot: [sz * 0.08, 0, -sx * 0.08] });
    for (const y of [0.4, 0.95]) { b.box(1.3, 0.08, 0.08, c.steel, { pos: [0, y, 0.6] }); b.box(1.3, 0.08, 0.08, c.steel, { pos: [0, y, -0.6] }); b.box(0.08, 0.08, 1.3, c.steel, { pos: [0.6, y, 0] }); b.box(0.08, 0.08, 1.3, c.steel, { pos: [-0.6, y, 0] }); }
    b.box(1.5, 0.14, 1.5, c.dark, { pos: [0, 1.55, 0] });
    b.box(1.5, 0.05, 0.3, c.trim, { pos: [0, 1.64, 0.7] });
  } },
  // war: hazard-striped armoured pad
  pad: { h: 0.4, build: (b, c) => {
    b.cyl(1.25, 1.35, 0.3, 6, c.metal, { pos: [0, -0.08, 0] });
    b.cyl(1.0, 1.1, 0.18, 6, c.dark, { pos: [0, 0.2, 0], rot: [0, P / 6, 0] });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.box(0.34, 0.05, 0.14, i % 2 ? c.trim : c.black, { pos: [Math.cos(a) * 1.18, 0.2, Math.sin(a) * 1.18], rot: [0, -a + P / 2, 0] }); }
  } },
  // magic: stone plinth with glowing runes
  plinth: { h: 0.5, build: (b, c, a) => {
    b.cyl(1.0, 1.1, 0.28, 6, c.dark, { pos: [0, -0.1, 0] });
    b.cyl(0.84, 0.9, 0.22, 6, c.main, { pos: [0, 0.18, 0], rot: [0, P / 6, 0] });
    for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + P / 6; b.box(0.16, 0.06, 0.04, a, { glow: true, pos: [Math.cos(an) * 0.85, 0.3, Math.sin(an) * 0.85], rot: [0, -an + P / 2, 0] }); }
  } },
  // magic: three standing stones around a gold ring
  menhir: { h: 0.35, build: (b, c, a) => {
    b.cyl(1.05, 1.1, 0.2, 8, c.dark, { pos: [0, -0.08, 0] });
    for (let i = 0; i < 3; i++) { const an = (i / 3) * TAU + 0.4; b.box(0.34, 1.1 + (i % 2) * 0.3, 0.3, c.main, { pos: [Math.cos(an) * 0.85, 0.55 + (i % 2) * 0.15, Math.sin(an) * 0.85], rot: [0.06, -an, 0.05] }); b.box(0.06, 0.4, 0.04, a, { glow: true, pos: [Math.cos(an) * 0.85 * 0.9, 0.7, Math.sin(an) * 0.85 * 0.9 + 0.17], rot: [0, -an, 0] }); }
    b.cyl(0.62, 0.62, 0.08, 10, c.trim, { pos: [0, 0.17, 0] });
  } },
  // magic: tall obelisk shaft
  obelisk: { h: 1.5, build: (b, c, a) => {
    b.cyl(0.95, 1.05, 0.25, 4, c.dark, { pos: [0, -0.08, 0], rot: [0, P / 4, 0] });
    b.cyl(0.45, 0.62, 1.2, 4, c.main, { pos: [0, 0.15, 0], rot: [0, P / 4, 0] });
    for (const y of [0.45, 0.85]) b.box(0.5, 0.05, 0.05, a, { glow: true, pos: [0, y, 0.43] });
    b.cyl(0.62, 0.62, 0.1, 4, c.trim, { pos: [0, 1.38, 0], rot: [0, P / 4, 0] });
  } },
};

// -------------------------------------------------------------------------------------------- heads
// build(b, c, a, y) adds geometry at height y; returns the muzzle [x, y, z]
const barrel = (b, c, x, y, len, r = 0.06) => { b.cyl(r, r, len, 6, c.black, { centered: true, pos: [x, y, 0.2 + len / 2], rot: [P / 2, 0, 0] }); };
export const KIT_HEADS = {
  single: (b, c, a, y) => { b.box(0.7, 0.5, 0.9, c.main, { pos: [0, y + 0.3, -0.05] }); barrel(b, c, 0, y + 0.35, 1.2); b.box(0.2, 0.16, 0.06, a, { glow: true, pos: [0, y + 0.5, 0.42] }); return [0, y + 0.35, 1.4]; },
  twin: (b, c, a, y) => { b.box(0.95, 0.5, 0.9, c.main, { pos: [0, y + 0.3, -0.05] }); for (const x of [-0.28, 0.28]) barrel(b, c, x, y + 0.35, 1.1); b.box(0.5, 0.06, 0.06, a, { glow: true, pos: [0, y + 0.58, 0.42] }); return [0, y + 0.35, 1.3]; },
  quad: (b, c, a, y) => { b.box(1.0, 0.6, 0.9, c.metal, { pos: [0, y + 0.35, -0.05] }); for (const [x, yy] of [[-0.25, 0.2], [0.25, 0.2], [-0.25, 0.52], [0.25, 0.52]]) barrel(b, c, x, y + yy + 0.15, 1.0, 0.05); b.box(0.9, 0.05, 0.05, c.trim, { pos: [0, y + 0.7, 0.4] }); return [0, y + 0.5, 1.2]; },
  long: (b, c, a, y) => { b.box(0.55, 0.45, 1.0, c.main, { pos: [0, y + 0.28, -0.15] }); barrel(b, c, 0, y + 0.32, 2.0, 0.05); b.cyl(0.07, 0.07, 0.4, 6, c.steel, { centered: true, pos: [0, y + 0.6, 0.2], rot: [P / 2, 0, 0] }); b.box(0.05, 0.05, 0.05, a, { glow: true, pos: [0, y + 0.6, 0.42] }); return [0, y + 0.32, 2.2]; },
  mortar: (b, c, a, y) => { b.box(1.0, 0.35, 1.0, c.metal, { pos: [0, y + 0.2, 0] }); b.cyl(0.32, 0.4, 1.0, 8, c.black, { centered: true, pos: [0, y + 0.75, 0.15], rot: [-0.9, 0, 0] }); b.cyl(0.36, 0.36, 0.08, 8, c.trim, { centered: true, pos: [0, y + 1.1, 0.5], rot: [-0.9, 0, 0] }); return [0, y + 1.2, 0.6]; },
  rack: (b, c, a, y) => { b.box(1.2, 0.3, 0.9, c.metal, { pos: [0, y + 0.18, 0] }); for (const x of [-0.4, 0, 0.4]) for (const yy of [0.45, 0.8]) { b.cyl(0.1, 0.1, 0.9, 6, c.dark, { centered: true, pos: [x, y + yy, 0.2], rot: [P / 2 - 0.25, 0, 0] }); b.cone(0.1, 0.22, 6, a, { centered: true, glow: true, pos: [x, y + yy + 0.1, 0.65], rot: [P / 2 - 0.25, 0, 0] }); } return [0, y + 0.8, 0.8]; },
  dish: (b, c, a, y) => { b.box(0.4, 0.5, 0.4, c.metal, { pos: [0, y + 0.3, 0] }); b.cyl(0.8, 0.2, 0.3, 10, c.steel, { centered: true, pos: [0, y + 0.85, 0.2], rot: [P / 2 - 0.5, 0, 0] }); b.cyl(0.04, 0.04, 0.7, 5, c.black, { centered: true, pos: [0, y + 0.95, 0.5], rot: [P / 2 - 0.5, 0, 0] }); b.octa(0.1, a, { glow: true, pos: [0, y + 1.1, 0.72] }); return [0, y + 1.0, 0.7]; },
  coil: (b, c, a, y) => { b.cyl(0.4, 0.5, 0.25, 8, c.metal, { pos: [0, y, 0] }); for (let i = 0; i < 4; i++) b.torus(0.34 - i * 0.04, 0.05, 4, 10, c.trim, { pos: [0, y + 0.4 + i * 0.28, 0], rot: [P / 2, 0, 0] }); b.cyl(0.06, 0.06, 1.2, 5, c.steel, { pos: [0, y + 0.25, 0] }); b.ico(0.18, 0, a, { glow: true, intensity: 1.6, pos: [0, y + 1.55, 0] }); return [0, y + 1.55, 0.2]; },
  orb: (b, c, a, y) => { b.cyl(0.3, 0.4, 0.3, 6, c.dark, { pos: [0, y, 0] }); b.ico(0.3, 1, a, { glow: true, intensity: 1.15, pos: [0, y + 0.95, 0] }); b.torus(0.46, 0.04, 4, 12, c.trim, { pos: [0, y + 0.95, 0], rot: [P / 2 - 0.35, 0, 0] }); b.torus(0.46, 0.04, 4, 12, c.steel, { pos: [0, y + 0.95, 0], rot: [0.35, 0, P / 2] }); for (let i = 0; i < 3; i++) { const an = (i / 3) * TAU; b.box(0.08, 0.7, 0.08, c.trim, { pos: [Math.cos(an) * 0.45, y + 0.7, Math.sin(an) * 0.45], rot: [Math.sin(an) * 0.3, 0, -Math.cos(an) * 0.3] }); } return [0, y + 0.95, 0.4]; },
  staff: (b, c, a, y) => { b.box(0.1, 1.6, 0.1, c.trim, { pos: [0, y + 0.8, 0] }); b.octa(0.25, a, { glow: true, intensity: 1.5, pos: [0, y + 1.75, 0], scale: [0.8, 1.5, 0.8] }); for (const s of [-1, 1]) b.box(0.05, 0.4, 0.05, c.trim, { pos: [s * 0.18, y + 1.5, 0], rot: [0, 0, s * 0.5] }); return [0, y + 1.75, 0.3]; },
  prism: (b, c, a, y) => { b.cyl(0.4, 0.5, 0.2, 6, c.dark, { pos: [0, y, 0] }); b.cone(0.5, 1.3, 3, a, { glow: true, intensity: 1.1, pos: [0, y + 0.2, 0], rot: [0, P / 6, 0] }); b.cone(0.5, 1.3, 3, a, { glow: true, intensity: 1.1, pos: [0, y + 1.5, 0], rot: [P, 0, P / 3] }); return [0, y + 0.95, 0.5]; },
  cauldron: (b, c, a, y) => { b.cyl(0.75, 0.55, 0.6, 8, c.metal, { pos: [0, y + 0.1, 0] }); b.torus(0.72, 0.07, 5, 12, c.trim, { pos: [0, y + 0.7, 0], rot: [P / 2, 0, 0] }); b.cyl(0.62, 0.62, 0.04, 8, a, { glow: true, intensity: 1.3, pos: [0, y + 0.66, 0] }); for (const s of [-1, 1]) b.box(0.08, 0.3, 0.08, c.dark, { pos: [s * 0.85, y + 0.55, 0] }); return [0, y + 0.8, 0.3]; },
  drum: (b, c, a, y) => { b.box(0.8, 0.4, 0.8, c.metal, { pos: [0, y + 0.25, 0] }); b.cyl(0.5, 0.5, 0.5, 8, c.dark, { centered: true, pos: [0, y + 0.7, 0.1], rot: [0, 0, P / 2] }); for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; b.box(0.5, 0.08, 0.08, c.black, { pos: [0, y + 0.7 + Math.sin(an) * 0.45, 0.1 + Math.cos(an) * 0.45] }); } barrel(b, c, 0, y + 0.7, 0.9, 0.07); b.box(0.2, 0.08, 0.08, a, { glow: true, pos: [0, y + 1.0, 0.45] }); return [0, y + 0.7, 1.1]; },
  claw: (b, c, a, y) => { b.box(0.6, 0.5, 0.6, c.metal, { pos: [0, y + 0.3, 0] }); for (const s of [-1, 0, 1]) b.cone(0.1, 1.1, 4, c.steel, { centered: true, pos: [s * 0.32, y + 0.7, 0.55], rot: [P / 2 - 0.2, 0, s * -0.25] }); b.octa(0.12, a, { glow: true, pos: [0, y + 0.4, 0.4] }); return [0, y + 0.7, 1.2]; },
};

// ------------------------------------------------------------------------------------------- add-ons
// each adds geometry in the head's group (y = platform top) and may ask for a spinning part
export const KIT_ADDONS = {
  none: () => {},
  // crit: a glowing optic gem on the head
  gem: (b, c, a, y) => { b.octa(0.16, a, { glow: true, intensity: 3, pos: [0.38, y + 0.85, 0.1], scale: [0.7, 1.4, 0.7] }); b.box(0.12, 0.4, 0.06, c.trim, { pos: [0.38, y + 0.55, 0.1] }); },
  // ramp: spinning spool ring around the barrel (spins with firing)
  spool: (b, c, a, y) => { b.torus(0.3, 0.05, 4, 10, a, { glow: true, pos: [0, y + 0.35, 0.65] }); b.torus(0.3, 0.05, 4, 10, c.trim, { pos: [0, y + 0.35, 0.95] }); },
  // pushback: heavy flared muzzle brake / piston
  ram: (b, c, a, y) => { b.cyl(0.2, 0.28, 0.35, 6, c.steel, { centered: true, pos: [0, y + 0.35, 1.15], rot: [P / 2, 0, 0] }); b.box(0.5, 0.3, 0.12, c.trim, { pos: [0, y + 0.35, 0.8] }); },
  // shred: spiked drill tip
  drill: (b, c, a, y) => { b.cone(0.16, 0.7, 5, c.steel, { centered: true, pos: [0.55, y + 0.4, 0.55], rot: [P / 2, 0, 0] }); b.cyl(0.14, 0.14, 0.3, 6, c.trim, { centered: true, pos: [0.55, y + 0.4, 0.12], rot: [P / 2, 0, 0] }); },
  // multishot: a fan of mini barrels on the sides
  fan: (b, c, a, y) => { for (const s of [-1, 1]) for (const k of [0, 1]) b.cyl(0.04, 0.04, 0.7, 5, c.black, { centered: true, pos: [s * (0.5 + k * 0.12), y + 0.3 + k * 0.12, 0.45], rot: [P / 2, 0, s * 0.18] }); },
  // bounty: a gold coin box with a glowing coin
  coinbox: (b, c, a, y) => { b.box(0.45, 0.35, 0.4, c.trim, { pos: [-0.5, y + 0.3, -0.25] }); b.cyl(0.14, 0.14, 0.04, 8, a, { centered: true, glow: true, pos: [-0.5, y + 0.5, -0.25], rot: [P / 2, 0, 0] }); },
  // execute: a skull totem on a pole
  skull: (b, c, a, y) => { b.box(0.06, 0.8, 0.06, c.dark, { pos: [-0.42, y + 0.6, -0.2] }); b.ico(0.17, 0, c.light, { pos: [-0.42, y + 1.05, -0.2] }); for (const s of [-1, 1]) b.box(0.05, 0.05, 0.03, a, { glow: true, pos: [-0.42 + s * 0.06, y + 1.07, -0.04] }); },
  // support aura: a banner pole
  banner: (b, c, a, y) => { b.box(0.06, 1.1, 0.06, c.steel, { pos: [0.45, y + 0.7, -0.3] }); b.box(0.5, 0.35, 0.04, c.trim, { pos: [0.7, y + 1.05, -0.3] }); b.box(0.2, 0.12, 0.05, a, { glow: true, pos: [0.7, y + 1.05, -0.28] }); },
};

function part(name, build, pivot) {
  const b = new ModelBuilder();
  build(b);
  const g = b.build();
  const mats = sharedMaterials();
  const grp = new THREE.Group();
  grp.name = name;
  grp.position.set(...pivot);
  const off = new THREE.Vector3(-pivot[0], -pivot[1], -pivot[2]);
  if (g.body) { g.body.translate(off.x, off.y, off.z); const m = new THREE.Mesh(g.body, mats.body); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  if (g.glow) { g.glow.translate(off.x, off.y, off.z); grp.add(new THREE.Mesh(g.glow, mats.glow)); }
  return grp;
}

/** Validate a kit (throws on unknown pieces, so bad data fails tests, not players). */
export function checkTowerKit(kit) {
  if (!KIT_BASES[kit.base]) throw new Error(`Unknown tower base "${kit.base}"`);
  if (!KIT_HEADS[kit.head]) throw new Error(`Unknown tower head "${kit.head}"`);
  if (kit.addon && !KIT_ADDONS[kit.addon]) throw new Error(`Unknown tower add-on "${kit.addon}"`);
  return true;
}

/** Build a kit tower: {group, parts, muzzle}. faction: 'war' | 'magic' picks the material language. */
export function buildKitTower(kit, faction = 'war') {
  checkTowerKit(kit);
  const c = PAL[faction] || PAL.war;
  const a = KIT_ACCENTS[kit.accent] || KIT_ACCENTS.cyan;
  const base = KIT_BASES[kit.base];
  const g = new THREE.Group();
  g.add(part('base', (b) => base.build(b, c, a), [0, 0, 0]));
  let muzzle = [0, base.h + 0.6, 1.2];
  const turret = part('turret', (b) => {
    muzzle = KIT_HEADS[kit.head](b, c, a, base.h);
    (KIT_ADDONS[kit.addon || 'none'])(b, c, a, base.h);
  }, [0, base.h, 0]);
  g.add(turret);
  const parts = { turret, recoil: turret };
  return { group: g, parts, muzzle: new THREE.Vector3(...muzzle) };
}
