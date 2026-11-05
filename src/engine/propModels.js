// Procedural low-poly prop models (docs/art-style.md). Origin = ground centre; every model extends
// a little below y=0 so it never floats on sloped terrain. Builders are referenced by name from
// data/props.json ("builder"), so new props can reuse them with different data.
import { ModelBuilder, jitter } from './geo.js';

const C = {
  bark: '#7A5230', barkDark: '#5E3E24',
  pine: ['#2F6B3A', '#3C7D44', '#4C9150'],
  leaf: ['#5FA845', '#4E9338', '#6DB84F'],
  stone: '#8D8D99', stoneDark: '#6E6E7A', stoneLight: '#A9A9B5',
  moss: '#5A9440',
  teal: '#2EC4B6', violet: '#7B4DFF', night: '#1E1B4B', gold: '#FFD166',
  glowCyan: '#7FF6FF', glowViolet: '#C9A7FF',
  olive: '#5B6B3A', oliveDark: '#47552C', khaki: '#C2B280', khakiDark: '#A8976A',
  gunmetal: '#3D4451', steel: '#8A939E', hazard: '#F28C28', muzzle: '#FFD27A',
  wood: '#A0703C', woodDark: '#7A5230',
  blight: '#2B2D42', blightGlow: '#E63946', blightMagenta: '#FF3CAC',
};

const PI = Math.PI;

export const BUILDERS = {
  treePine(b, seed) {
    const r = jitter(seed);
    b.cyl(0.2, 0.28, 2.2, 6, C.bark, { pos: [0, -0.4, 0] });
    const tiers = [[1.1, 1.75, 2.3], [2.3, 1.35, 2.0], [3.4, 0.95, 1.7], [4.4, 0.55, 1.4]];
    tiers.forEach(([y, rad, h], i) => {
      b.cone(rad, h, 7, C.pine[i % 3], { pos: [0, y, 0], rot: [0, r() * PI, 0] });
    });
  },

  treeRound(b, seed) {
    const r = jitter(seed);
    b.cyl(0.18, 0.3, 2.6, 6, C.bark, { pos: [0, -0.4, 0] });
    b.cyl(0.08, 0.12, 1.1, 5, C.bark, { pos: [0.2, 1.5, 0], rot: [0, 0, -0.7] });
    b.ico(1.55, 0, C.leaf[0], { pos: [0, 3.2, 0], rot: [r(), r(), r()] });
    b.ico(1.1, 0, C.leaf[1], { pos: [0.9, 2.8, 0.5], rot: [r(), r(), r()] });
    b.ico(1.05, 0, C.leaf[2], { pos: [-0.8, 3.0, -0.5], rot: [r(), r(), r()] });
    b.ico(0.9, 0, C.leaf[0], { pos: [0.1, 4.25, -0.2], rot: [r(), r(), r()] });
  },

  treeMagic(b, seed) {
    const r = jitter(seed);
    b.cyl(0.22, 0.38, 1.6, 6, '#5B4A7A', { pos: [0, -0.4, 0] });
    b.cyl(0.16, 0.22, 1.6, 6, '#5B4A7A', { pos: [0.1, 1.1, 0], rot: [0, 0, -0.25] });
    b.cyl(0.1, 0.16, 1.4, 5, '#6A5890', { pos: [0.45, 2.5, 0], rot: [0.2, 0, 0.35] });
    b.ico(1.5, 0, '#3FB8AA', { pos: [0.1, 3.6, 0], rot: [r(), r(), r()] });
    b.ico(1.1, 0, '#7B5BD6', { pos: [-0.9, 3.2, 0.6], rot: [r(), r(), r()] });
    b.ico(1.0, 0, '#34A398', { pos: [0.9, 3.0, -0.7], rot: [r(), r(), r()] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + r();
      b.octa(0.16, i % 2 ? C.glowCyan : C.glowViolet, { glow: true, pos: [Math.cos(a) * 1.4, 2.35 + r() * 0.5, Math.sin(a) * 1.4] });
    }
  },

  bush(b, seed) {
    const r = jitter(seed);
    b.ico(0.6, 0, C.leaf[1], { pos: [0, 0.3, 0], scale: [1.2, 0.8, 1.1], rot: [r(), r(), r()] });
    b.ico(0.45, 0, C.leaf[0], { pos: [0.45, 0.3, 0.2], rot: [r(), r(), r()] });
    b.ico(0.42, 0, C.leaf[2], { pos: [-0.4, 0.28, -0.25], rot: [r(), r(), r()] });
    b.ico(0.08, 0, '#D64545', { pos: [0.3, 0.75, 0.3] });
    b.ico(0.08, 0, '#D64545', { pos: [-0.25, 0.68, 0.35] });
  },

  rock(b, seed) {
    const r = jitter(seed);
    b.dodeca(0.95, C.stone, { pos: [0, 0.35, 0], scale: [1.15, 0.8, 1.0], rot: [r(), r(), r()] });
    b.dodeca(0.55, C.stoneDark, { pos: [0.85, 0.15, 0.35], rot: [r(), r(), r()] });
    b.dodeca(0.5, C.moss, { pos: [-0.1, 0.95, 0.05], scale: [1.2, 0.35, 1.0], rot: [0, r(), 0] });
  },

  rockSmall(b, seed) {
    const r = jitter(seed);
    b.dodeca(0.45, C.stoneLight, { pos: [0, 0.1, 0], scale: [1.1, 0.7, 0.9], rot: [r(), r(), r()] });
    b.dodeca(0.25, C.stoneDark, { pos: [0.4, 0.02, 0.2], rot: [r(), r(), r()] });
  },

  crystalCluster(b, seed) {
    const r = jitter(seed);
    b.dodeca(0.7, C.stoneDark, { pos: [0, 0.1, 0], scale: [1.2, 0.55, 1.1], rot: [r(), r(), r()] });
    const spikes = [[0, 1.2, 0, 0, 0, 1.25], [0.45, 0.85, 0.2, 0.35, 0.3, 0.9], [-0.4, 0.8, 0.25, -0.4, -0.2, 0.85], [0.1, 0.7, -0.45, 0.2, -0.45, 0.75], [-0.2, 0.55, -0.2, -0.5, 0.3, 0.6]];
    spikes.forEach(([x, y, z, rx, rz, s], i) => {
      const glow = i % 2 === 0;
      b.octa(0.45, glow ? (i === 0 ? C.glowCyan : C.glowViolet) : (i % 3 ? C.teal : C.violet), {
        glow, intensity: 1.8, pos: [x, y, z], rot: [rx, r(), rz], scale: [0.55 * s, 1.6 * s, 0.55 * s],
      });
    });
  },

  mushroomGlow(b, seed) {
    const r = jitter(seed);
    const caps = [[0, 0, 0.75, 0.42], [0.35, 0.15, 0.5, 0.28], [-0.25, -0.25, 0.42, 0.24]];
    caps.forEach(([x, z, h, cr], i) => {
      b.cyl(0.06, 0.09, h + 0.2, 5, '#EDE6D6', { pos: [x, -0.2, z] });
      b.cone(cr, cr * 0.75, 7, i === 1 ? '#7B5BD6' : '#3A8FB7', { pos: [x, h - 0.02, z], rot: [r() * 0.2, r(), 0] });
      b.ico(cr * 0.22, 0, i === 1 ? C.glowViolet : C.glowCyan, { glow: true, intensity: 2, pos: [x + cr * 0.4, h + cr * 0.25, z] });
    });
  },

  runestone(b, seed) {
    const r = jitter(seed);
    b.box(1.6, 0.4, 1.0, C.stoneDark, { pos: [0, -0.05, 0] });
    b.cyl(0.42, 0.55, 2.4, 4, C.stone, { pos: [0, 0, 0], rot: [0, PI / 4, 0], scale: [1.4, 1, 0.75] });
    b.cone(0.42, 0.45, 4, C.stoneLight, { pos: [0, 2.4, 0], rot: [0, PI / 4, 0], scale: [1.4, 1, 0.75] });
    // rune glyphs on both faces so it reads from every angle
    for (const side of [-1, 1]) {
      const z = side * 0.33;
      b.box(0.1, 0.9, 0.04, C.glowCyan, { glow: true, pos: [0, 1.3, z] });
      b.box(0.5, 0.08, 0.04, C.glowCyan, { glow: true, pos: [0, 1.55, z] });
      b.box(0.3, 0.08, 0.04, C.glowCyan, { glow: true, pos: [0.12, 1.0, z], rot: [0, 0, 0.6 + r() * 0.3] });
    }
    b.dodeca(0.25, C.moss, { pos: [0.4, 0.2, 0.4], scale: [1.4, 0.5, 1] });
  },

  ruinPillar(b, seed) {
    const r = jitter(seed);
    b.box(1.3, 0.5, 1.3, C.stoneDark, { pos: [0, 0, 0] });
    b.cyl(0.48, 0.52, 2.6, 8, C.stone, { pos: [0, 0.2, 0] });
    b.box(0.95, 0.5, 0.95, C.stoneLight, { pos: [0.08, 3.0, 0], rot: [0.12, r(), 0.18] });
    b.box(0.5, 0.35, 0.4, C.stone, { pos: [0.9, 0.05, 0.6], rot: [0.3, r(), 0.2] });
    b.box(0.2, 1.4, 0.2, C.moss, { pos: [0.45, 1.2, 0.15], rot: [0, 0, 0.1] });
    b.box(0.25, 0.25, 1.1, C.moss, { pos: [0, 2.7, 0], rot: [0, r() * PI, 0] });
  },

  ruinArch(b) {
    for (const x of [-3.3, 3.3]) {
      b.box(1.5, 0.5, 1.5, C.stoneDark, { pos: [x, 0, 0] });
      b.box(1.1, 3.8, 1.1, C.stone, { pos: [x, 2.0, 0] });
      b.box(0.3, 1.8, 0.2, C.moss, { pos: [x + 0.4, 1.4, 0.56] });
      b.box(0.3, 1.8, 0.2, C.moss, { pos: [x - 0.4, 1.8, -0.56] });
    }
    b.box(8.2, 0.9, 1.3, C.stoneLight, { pos: [0, 4.3, 0] });
    b.box(1.0, 1.2, 1.36, C.stone, { pos: [0, 4.4, 0] });
    for (const side of [-1, 1]) {
      b.octa(0.32, C.glowViolet, { glow: true, pos: [0, 4.45, side * 0.7], scale: [1, 1.4, 0.3] });
    }
  },

  sandbagWall(b, seed) {
    const r = jitter(seed);
    for (let row = 0; row < 3; row++) {
      const n = 4 - (row === 2 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = -1.25 + i * 0.83 + (row % 2) * 0.42;
        const c = (i + row) % 2 ? C.khaki : C.khakiDark;
        b.box(0.8, 0.34, 0.85, c, { pos: [x, 0.17 + row * 0.32 - 0.05, 0], rot: [0, (r() - 0.5) * 0.15, 0] });
      }
    }
  },

  crate(b) {
    b.box(1.2, 1.2, 1.2, C.wood, { pos: [0, 0.55, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.14, 1.24, 0.14, C.woodDark, { pos: [sx * 0.56, 0.55, sz * 0.56] });
    }
    for (const sy of [-1, 1]) {
      b.box(1.24, 0.14, 0.14, C.woodDark, { pos: [0, 0.55 + sy * 0.56, 0.56] });
      b.box(1.24, 0.14, 0.14, C.woodDark, { pos: [0, 0.55 + sy * 0.56, -0.56] });
      b.box(0.14, 0.14, 1.24, C.woodDark, { pos: [0.56, 0.55 + sy * 0.56, 0] });
      b.box(0.14, 0.14, 1.24, C.woodDark, { pos: [-0.56, 0.55 + sy * 0.56, 0] });
    }
    b.box(0.5, 0.18, 0.02, C.hazard, { pos: [0, 0.6, 0.61] });
    b.box(0.5, 0.18, 0.02, C.hazard, { pos: [0, 0.6, -0.61] });
  },

  crateStack(b) {
    const one = (x, y, z, ry, s = 1) => {
      b.box(1.2 * s, 1.2 * s, 1.2 * s, C.wood, { pos: [x, y + 0.6 * s - 0.05, z], rot: [0, ry, 0] });
      b.box(1.26 * s, 0.14 * s, 1.26 * s, C.woodDark, { pos: [x, y + 1.1 * s, z], rot: [0, ry, 0] });
      b.box(1.26 * s, 0.14 * s, 1.26 * s, C.woodDark, { pos: [x, y + 0.08 * s, z], rot: [0, ry, 0] });
    };
    one(-0.62, 0, 0, 0.05);
    one(0.62, 0, 0.05, -0.08);
    one(0, 1.15, 0, 0.3, 0.95);
  },

  barrel(b) {
    b.cyl(0.42, 0.42, 1.1, 10, C.olive, { pos: [0, -0.05, 0] });
    b.cyl(0.44, 0.44, 0.08, 10, C.gunmetal, { pos: [0, 0.18, 0] });
    b.cyl(0.44, 0.44, 0.08, 10, C.gunmetal, { pos: [0, 0.82, 0] });
    b.cyl(0.43, 0.43, 0.16, 10, C.hazard, { pos: [0, 0.48, 0] });
    b.cyl(0.08, 0.08, 0.06, 6, C.gunmetal, { pos: [0.18, 1.05, 0.1] });
  },

  tent(b) {
    // triangular prism along x
    b.extrude([[-1.85, 0], [1.85, 0], [0, 2.35]], 3.4, C.olive, { rot: [0, PI / 2, 0], pos: [0, -0.05, 0] });
    b.extrude([[-1.0, 0], [1.0, 0], [0, 1.3]], 0.06, C.oliveDark, { rot: [0, PI / 2, 0], pos: [-1.72, -0.04, 0] });
    b.extrude([[-0.9, 0], [0.9, 0], [0, 1.15]], 0.04, '#1F2418', { rot: [0, PI / 2, 0], pos: [-1.76, -0.03, 0] });
    b.box(3.6, 0.08, 0.08, C.woodDark, { pos: [0, 2.36, 0] });
    for (const x of [-1.8, 1.8]) b.cyl(0.05, 0.05, 2.5, 5, C.woodDark, { pos: [x, -0.1, 0] });
    b.box(0.6, 0.3, 0.02, C.khaki, { pos: [0.4, 1.05, 1.0], rot: [0.72, 0, 0] });
  },

  tankWreck(b) {
    b.box(4.2, 1.0, 2.4, C.oliveDark, { pos: [0, 0.75, 0], rot: [0, 0, 0.04] });
    b.box(3.6, 0.5, 2.0, C.olive, { pos: [0, 1.4, 0] });
    for (const z of [-1.3, 1.3]) {
      b.box(4.6, 0.8, 0.6, C.gunmetal, { pos: [0, 0.35, z] });
      for (let i = 0; i < 5; i++) b.cyl(0.32, 0.32, 0.64, 8, '#2A2F3A', { centered: true, pos: [-1.8 + i * 0.9, 0.35, z], rot: [PI / 2, 0, 0] });
    }
    b.box(1.8, 0.7, 1.6, C.olive, { pos: [-0.3, 1.95, 0.2], rot: [0.08, 0.5, -0.12] });
    b.cyl(0.12, 0.14, 2.6, 7, C.gunmetal, { pos: [-0.9, 2.0, 0.9], rot: [PI / 2 + 0.35, 0, 0.5] });
    b.box(1.2, 0.04, 0.9, '#1D1F24', { pos: [0.9, 1.66, -0.3] });
    b.box(0.5, 0.5, 0.04, '#F2F2E8', { pos: [1.0, 1.0, 1.22] });
    b.box(0.3, 0.3, 0.05, C.oliveDark, { pos: [1.0, 1.0, 1.23] });
  },

  barbedFence(b) {
    for (const x of [-1.5, 0, 1.5]) b.box(0.12, 1.4, 0.12, C.woodDark, { pos: [x, 0.3, 0], rot: [0, 0, (x / 1.5) * 0.06] });
    for (const y of [0.45, 0.8, 1.1]) {
      b.cyl(0.025, 0.025, 3.1, 4, C.steel, { centered: true, pos: [0, y, 0], rot: [0, 0, PI / 2] });
      for (let i = -5; i <= 5; i++) b.octa(0.06, C.steel, { pos: [i * 0.28, y, 0] });
    }
  },

  watchtower(b) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.28, 5.0, 0.28, C.woodDark, { pos: [sx * 1.15, 2.1, sz * 1.15], rot: [sz * 0.05, 0, -sx * 0.05] });
    }
    b.box(2.2, 0.12, 0.12, C.wood, { pos: [0, 1.6, 1.12], rot: [0, 0, 0.7] });
    b.box(2.2, 0.12, 0.12, C.wood, { pos: [0, 1.6, -1.12], rot: [0, 0, -0.7] });
    b.box(3.0, 0.25, 3.0, C.wood, { pos: [0, 4.5, 0] });
    for (const [x, z, w, d] of [[0, 1.4, 3.0, 0.12], [0, -1.4, 3.0, 0.12], [1.4, 0, 0.12, 3.0], [-1.4, 0, 0.12, 3.0]]) {
      b.box(w, 0.9, d, C.olive, { pos: [x, 5.05, z] });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.15, 1.7, 0.15, C.woodDark, { pos: [sx * 1.35, 5.4, sz * 1.35] });
    b.cone(2.4, 1.2, 4, C.oliveDark, { pos: [0, 6.25, 0], rot: [0, PI / 4, 0] });
    b.cyl(0.25, 0.32, 0.4, 8, C.gunmetal, { centered: true, pos: [1.2, 5.6, 1.2], rot: [0.5, 0, -0.5] });
    b.cyl(0.24, 0.24, 0.04, 8, C.muzzle, { glow: true, centered: true, intensity: 2.6, pos: [1.33, 5.48, 1.33], rot: [0.5, 0, -0.5] });
    // ladder
    for (const x of [-0.3, 0.3]) b.box(0.08, 4.6, 0.08, C.wood, { pos: [x, 2.2, -1.55], rot: [0.08, 0, 0] });
    for (let i = 0; i < 9; i++) b.box(0.6, 0.06, 0.08, C.wood, { pos: [0, 0.3 + i * 0.5, -1.5 + i * 0.02] });
  },

  lampPost(b) {
    b.cyl(0.18, 0.25, 0.3, 6, C.stoneDark, { pos: [0, -0.1, 0] });
    b.cyl(0.07, 0.09, 3.0, 6, C.gunmetal, { pos: [0, 0.1, 0] });
    b.box(0.5, 0.06, 0.06, C.gunmetal, { pos: [0.18, 3.0, 0] });
    b.cyl(0.18, 0.12, 0.36, 6, C.gunmetal, { pos: [0.4, 2.55, 0] });
    b.cyl(0.13, 0.1, 0.3, 6, C.muzzle, { glow: true, intensity: 3, pos: [0.4, 2.42, 0] });
  },

  fenceWood(b) {
    for (const x of [-1.45, 0, 1.45]) b.box(0.16, 1.3, 0.16, C.woodDark, { pos: [x, 0.3, 0] });
    b.box(3.1, 0.14, 0.08, C.wood, { pos: [0, 0.55, 0] });
    b.box(3.1, 0.14, 0.08, C.wood, { pos: [0, 0.95, 0] });
  },

  enemyPortal(b) {
    for (const z of [-3.6, 3.6]) {
      b.box(1.7, 0.6, 1.5, C.blight, { pos: [0, 0, z] });
      b.cyl(0.55, 0.8, 5.2, 5, '#3A3D5C', { pos: [0, 0.2, z] });
      b.cone(0.55, 1.6, 5, C.blight, { pos: [0, 5.3, z], rot: [z > 0 ? 0.25 : -0.25, 0, 0] });
      b.octa(0.3, C.blightGlow, { glow: true, pos: [0.62, 3.2, z], scale: [0.3, 1.2, 1] });
      b.octa(0.3, C.blightGlow, { glow: true, pos: [-0.62, 3.2, z], scale: [0.3, 1.2, 1] });
    }
    b.torus(3.15, 0.32, 6, 20, C.blight, { pos: [0, 3.7, 0], rot: [0, PI / 2, 0] });
    b.torus(2.85, 0.12, 4, 24, C.blightMagenta, { glow: true, intensity: 2.2, pos: [0, 3.7, 0], rot: [0, PI / 2, 0] });
    // the void: a dark backing disc; the animated swirl on both faces is added by MapView
    b.cyl(2.9, 2.9, 0.12, 24, '#14061F', { centered: true, pos: [0, 3.7, 0], rot: [0, 0, PI / 2] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.cone(0.22, 0.9, 4, C.blight, { centered: true, pos: [0, 3.7 + Math.sin(a) * 3.6, Math.cos(a) * 3.6], rot: [a - PI / 2, 0, 0] });
    }
  },

  baseKeep(b) {
    // central keep
    b.box(6.6, 1.0, 9.0, C.stoneDark, { pos: [0, 0.0, 0] });
    b.box(5.6, 6.6, 7.0, C.stone, { pos: [0.4, 3.4, 0] });
    for (let i = 0; i < 6; i++) {
      b.box(0.7, 0.7, 0.7, C.stoneLight, { pos: [0.4 - 2.45, 7.05, -3.15 + i * 1.26] });
      b.box(0.7, 0.7, 0.7, C.stoneLight, { pos: [0.4 + 2.45, 7.05, -3.15 + i * 1.26] });
    }
    for (let i = 1; i < 4; i++) {
      b.box(0.7, 0.7, 0.7, C.stoneLight, { pos: [0.4 - 2.45 + i * 1.22, 7.05, -3.15] });
      b.box(0.7, 0.7, 0.7, C.stoneLight, { pos: [0.4 - 2.45 + i * 1.22, 7.05, 3.15] });
    }
    // gate facing west (-x)
    b.box(0.3, 3.4, 3.2, '#2A1E14', { pos: [-2.45, 1.75, 0] });
    b.box(0.35, 3.0, 2.6, C.wood, { pos: [-2.5, 1.55, 0] });
    for (let i = -1; i <= 1; i++) b.box(0.4, 0.14, 2.7, C.gunmetal, { pos: [-2.55, 1.6 + i * 0.9, 0] });
    b.box(0.5, 0.5, 3.8, C.stoneLight, { pos: [-2.4, 3.6, 0] });
    // flanking towers: Magic (north) and War (south)
    for (const [z, roof, banner] of [[-4.8, C.violet, C.violet], [4.8, C.olive, C.hazard]]) {
      b.cyl(1.7, 1.9, 8.2, 8, C.stone, { pos: [-1.6, -0.4, z] });
      b.cyl(2.0, 2.0, 0.6, 8, C.stoneLight, { pos: [-1.6, 7.6, z] });
      b.cone(2.2, 2.8, 8, roof, { pos: [-1.6, 8.2, z] });
      b.box(0.08, 2.4, 1.2, banner, { pos: [-3.55, 4.6, z] });
      b.box(0.06, 0.5, 0.5, C.gold, { pos: [-3.6, 5.2, z], rot: [PI / 4, 0, 0] });
    }
    // the core enemies try to reach
    b.cyl(0.9, 1.2, 0.8, 8, C.gold, { pos: [0.4, 6.8, 0] });
    b.octa(1.0, C.gold, { glow: true, intensity: 1.9, pos: [0.4, 9.0, 0], scale: [1, 1.6, 1] });
  },
};

const cache = new Map();

/** Returns cached {body, glow} geometries for a prop definition. */
export function propGeometry(def, seed = 7) {
  const key = `${def.builder}:${seed}`;
  if (!cache.has(key)) {
    const fn = BUILDERS[def.builder];
    if (!fn) throw new Error(`No prop builder "${def.builder}" for ${def.id}`);
    const b = new ModelBuilder();
    fn(b, seed);
    cache.set(key, b.build());
  }
  return cache.get(key);
}
