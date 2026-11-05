// Code-built unit models (docs/art-style.md): enemies and allies as rig definitions (baked and
// instanced by instancedRig.js), towers as part groups animated in code. Front = +Z, up = +Y.
import * as THREE from 'three';
import { ModelBuilder } from './geo.js';
import { sharedMaterials } from './mapView.js';

const P = Math.PI;
const TAU = Math.PI * 2;
const S = (u, k = 1) => Math.sin(u * TAU * k);
const C = {
  slate: '#2B2D42', slate2: '#3A3D5C', bone: '#D6CFC7', crimson: '#E63946', magenta: '#FF3CAC', pink: '#FF9AD5',
  violet: '#7B4DFF', night: '#1E1B4B', teal: '#2EC4B6', cyan: '#7FF6FF', gold: '#FFD166', glowViolet: '#C9A7FF',
  olive: '#5B6B3A', oliveDark: '#47552C', khaki: '#C2B280', khakiDark: '#A8976A', gunmetal: '#3D4451', steel: '#8A939E',
  hazard: '#F28C28', skin: '#F1C7A0', wood: '#A0703C', woodDark: '#7A5230', black: '#1C1E24', stone: '#8D8D99',
  stoneDark: '#6E6E7A', stoneLight: '#A9A9B5', moss: '#5A9440', ice: '#BDEBFF', ember: '#FF6B35', muzzle: '#FFD27A',
  wraith: '#2A1E4A', storm: '#FFE14D',
};

/** Shared generic death: tip over and sink. */
const deathPose = (u, out, axis = 'z') => {
  const k = Math.min(1, u * 1.6);
  out._root = { r: axis === 'z' ? [0, 0, k * 1.35] : [k * -1.3, 0, 0], p: [0, -0.35 * k, 0] };
};

// =============================================================================== enemies (rigs)
export const ENEMY_RIGS = {
  skitter: {
    height: 0.8,
    parts: [
      { name: 'body', pivot: [0, 0.45, 0], build: (b) => {
        b.ico(0.45, 0, C.slate2, { pos: [0, 0.48, 0], scale: [0.95, 0.6, 1.4] });
        b.box(0.34, 0.24, 0.3, C.slate, { pos: [0, 0.5, 0.62] });
        for (const x of [-0.09, 0.09]) b.box(0.07, 0.05, 0.04, C.crimson, { glow: true, pos: [x, 0.55, 0.78] });
        for (let i = 0; i < 3; i++) b.cone(0.07, 0.24, 4, C.bone, { pos: [0, 0.7, -0.25 + i * 0.25], rot: [-0.4, 0, 0] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 0.45, 0], build: (b) => {
        const legs = g === 'A' ? [[1, -0.35], [-1, 0], [1, 0.35]] : [[-1, -0.35], [1, 0], [-1, 0.35]];
        for (const [s, z] of legs) {
          b.box(0.5, 0.07, 0.07, C.slate, { pos: [s * 0.42, 0.55, z], rot: [0, 0, s * 0.5] });
          b.box(0.07, 0.5, 0.07, C.slate2, { pos: [s * 0.66, 0.26, z], rot: [0, 0, s * -0.25] });
        }
      } })),
    ],
    clips: {
      move: { duration: 0.32, pose: (u, o) => { o.legsA = { r: [0, 0.45 * S(u), 0] }; o.legsB = { r: [0, -0.45 * S(u), 0] }; o.body = { p: [0, 0.03 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 1.2, pose: (u, o) => { o.body = { r: [0.05 * S(u), 0, 0] }; } },
      attack: { duration: 0.5, loop: false, pose: (u, o) => { o.body = { p: [0, 0, 0.25 * Math.sin(u * P)] }; } },
      death: { duration: 0.8, loop: false, pose: (u, o) => deathPose(u, o) },
    },
  },

  shade: {
    height: 1.9,
    transparent: 0.45,
    parts: [
      { name: 'body', pivot: [0, 1, 0], build: (b) => {
        b.cyl(0.5, 0.18, 1.0, 7, C.wraith, { pos: [0, 0.3, 0] });
        b.ico(0.26, 0, C.night, { pos: [0, 1.45, 0.02] });
        b.cone(0.3, 0.5, 6, C.wraith, { pos: [0, 1.5, -0.05], rot: [-0.3, 0, 0] });
        for (const x of [-0.09, 0.09]) b.box(0.08, 0.05, 0.04, C.magenta, { glow: true, pos: [x, 1.46, 0.24] });
        // wisps hang from the robe hem (attached, tips just above the ground)
        for (const [x, z] of [[-0.25, -0.1], [0.2, -0.2], [0, 0.2]]) b.cone(0.14, 0.5, 4, C.wraith, { pos: [x, 0.36, z], rot: [P, 0, 0] });
      } },
      { name: 'arms', pivot: [0, 1.2, 0], build: (b) => {
        for (const s of [-1, 1]) {
          b.cyl(0.08, 0.16, 0.6, 5, C.wraith, { pos: [s * 0.42, 0.95, 0.12], rot: [0.5, 0, s * 0.3] });
          for (let k = -1; k <= 1; k++) b.cone(0.03, 0.2, 4, C.bone, { pos: [s * 0.5 + k * 0.05, 0.75, 0.32], rot: [2.3, 0, 0] });
        }
      } },
    ],
    clips: {
      move: { duration: 1.4, pose: (u, o) => { o._root = { p: [0, 0.35 + 0.1 * S(u), 0] }; o.body = { r: [0.12, 0, 0.05 * S(u)] }; o.arms = { r: [0.15 * S(u), 0, 0] }; } },
      idle: { duration: 1.6, pose: (u, o) => { o._root = { p: [0, 0.35 + 0.08 * S(u), 0] }; } },
      attack: { duration: 0.6, loop: false, pose: (u, o) => { o._root = { p: [0, 0.35, 0] }; o.arms = { r: [-1.0 * Math.sin(u * P), 0, 0] }; } },
      death: { duration: 0.8, loop: false, pose: (u, o) => { o._root = { p: [0, 0.35 + u * 1.2, 0], s: 1 - u * 0.6 }; } },
    },
  },

  mender: {
    height: 1.6,
    parts: [
      { name: 'body', pivot: [0, 0.8, 0], build: (b) => {
        b.box(0.55, 0.6, 0.42, C.slate2, { pos: [0, 0.95, -0.05], rot: [0.35, 0, 0] });
        b.cyl(0.3, 0.42, 0.5, 6, C.slate, { pos: [0, 0.45, 0] });
        b.box(0.34, 0.36, 0.3, C.bone, { pos: [0, 1.3, 0.22] });
        for (const x of [-0.08, 0.08]) b.box(0.07, 0.05, 0.04, C.pink, { glow: true, pos: [x, 1.32, 0.38] });
        for (const s of [-1, 1]) b.cone(0.06, 0.3, 4, C.bone, { pos: [s * 0.15, 1.45, 0.1], rot: [-0.5, 0, s * -0.6] });
        b.box(0.6, 0.1, 0.46, C.magenta, { pos: [0, 0.72, 0] });
      } },
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'legL' : 'legR', pivot: [s * 0.15, 0.5, 0], build: (b) => {
        b.box(0.16, 0.5, 0.18, C.slate, { pos: [s * 0.15, 0.25, 0] });
        b.box(0.2, 0.1, 0.28, C.slate2, { pos: [s * 0.15, 0.04, 0.05] });
      } })),
      { name: 'staff', pivot: [0.38, 1.0, 0.1], build: (b) => {
        b.cyl(0.035, 0.035, 1.7, 5, C.bone, { pos: [0.4, 0.0, 0.25] });
        b.torus(0.13, 0.025, 4, 10, C.bone, { pos: [0.4, 1.8, 0.25] });
        b.ico(0.11, 1, C.pink, { glow: true, pos: [0.4, 1.8, 0.25] });
        b.box(0.14, 0.14, 0.14, C.slate, { pos: [0.4, 1.0, 0.25] });
      } },
    ],
    clips: {
      move: { duration: 0.9, pose: (u, o) => { o.legL = { r: [0.5 * S(u), 0, 0] }; o.legR = { r: [-0.5 * S(u), 0, 0] }; o.staff = { r: [0.1 * S(u), 0, 0] }; o.body = { p: [0, 0.03 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 2, pose: (u, o) => { o.staff = { r: [0.05 * S(u), 0, 0] }; } },
      attack: { duration: 0.8, loop: false, pose: (u, o) => { o.staff = { p: [0, 0.35 * Math.sin(u * P), 0] }; o.body = { r: [-0.2 * Math.sin(u * P), 0, 0] }; } },
      death: { duration: 0.9, loop: false, pose: (u, o) => deathPose(u, o, 'x') },
    },
  },

  brood_sac: {
    height: 1.7,
    parts: [
      { name: 'sac', pivot: [0, 0.9, 0], build: (b) => {
        b.ico(0.75, 1, C.slate2, { pos: [0, 1.0, 0], scale: [1.0, 0.85, 1.15] });
        for (const [x, y, z] of [[0.4, 1.35, 0.3], [-0.45, 1.2, 0.2], [0.1, 1.55, -0.3], [-0.2, 0.95, 0.65], [0.55, 0.9, -0.35], [-0.5, 1.1, -0.45]]) {
          b.ico(0.13, 0, C.crimson, { glow: true, intensity: 1.8, pos: [x, y, z] });
        }
        for (let i = 0; i < 3; i++) b.torus(0.62 - i * 0.1, 0.035, 3, 14, C.bone, { pos: [0, 1.0, -0.4 + i * 0.4], rot: [0, 0, 0] });
        b.box(0.3, 0.2, 0.25, C.slate, { pos: [0, 0.85, 0.8] });
        for (const x of [-0.07, 0.07]) b.box(0.06, 0.05, 0.03, C.crimson, { glow: true, pos: [x, 0.9, 0.93] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 0.5, 0], build: (b) => {
        const legs = g === 'A' ? [[1, 0.4], [-1, -0.4]] : [[-1, 0.4], [1, -0.4]];
        for (const [s, z] of legs) b.box(0.18, 0.6, 0.18, C.slate, { pos: [s * 0.45, 0.28, z], rot: [0, 0, s * -0.2] });
      } })),
    ],
    clips: {
      move: { duration: 0.9, pose: (u, o) => { o.sac = { s: 1 + 0.05 * S(u, 2), r: [0, 0, 0.06 * S(u)] }; o.legsA = { r: [0.35 * S(u), 0, 0] }; o.legsB = { r: [-0.35 * S(u), 0, 0] }; } },
      idle: { duration: 1.5, pose: (u, o) => { o.sac = { s: 1 + 0.06 * S(u) }; } },
      attack: { duration: 0.6, loop: false, pose: (u, o) => { o.sac = { s: 1 + 0.15 * Math.sin(u * P) }; } },
      death: { duration: 0.5, loop: false, pose: (u, o) => { o.sac = { s: 1 + u * 0.5 }; o._root = { p: [0, -0.2 * u, 0] }; } },
    },
  },

  bulwark: {
    height: 2.0,
    parts: [
      { name: 'torso', pivot: [0, 1.0, 0], build: (b) => {
        b.box(0.8, 0.75, 0.55, C.slate, { pos: [0, 1.25, 0] });
        b.box(0.62, 0.22, 0.45, C.slate2, { pos: [0, 0.82, 0] });
        b.box(0.48, 0.46, 0.44, C.bone, { pos: [0, 1.82, 0.04] });
        b.box(0.36, 0.06, 0.04, C.crimson, { glow: true, pos: [0, 1.84, 0.27] });
        for (const s of [-1, 1]) b.box(0.32, 0.3, 0.6, C.slate2, { pos: [s * 0.55, 1.55, 0] });
        b.cone(0.1, 0.5, 4, C.bone, { pos: [0, 2.05, -0.05], rot: [-0.3, 0, 0] });
      } },
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'legL' : 'legR', pivot: [s * 0.22, 0.8, 0], build: (b) => {
        b.box(0.26, 0.72, 0.3, C.slate2, { pos: [s * 0.22, 0.42, 0] });
        b.box(0.3, 0.14, 0.42, C.slate, { pos: [s * 0.22, 0.06, 0.05] });
      } })),
      { name: 'shield', pivot: [-0.45, 1.3, 0.3], build: (b) => {
        b.box(1.15, 1.45, 0.14, C.slate2, { pos: [-0.15, 1.15, 0.62] });
        b.box(0.95, 1.25, 0.06, C.night, { pos: [-0.15, 1.15, 0.71] });
        b.box(1.2, 0.07, 0.05, C.magenta, { glow: true, pos: [-0.15, 1.88, 0.66] });
        b.box(1.2, 0.07, 0.05, C.magenta, { glow: true, pos: [-0.15, 0.42, 0.66] });
        b.box(0.07, 1.5, 0.05, C.magenta, { glow: true, pos: [-0.74, 1.15, 0.66] });
        b.box(0.07, 1.5, 0.05, C.magenta, { glow: true, pos: [0.44, 1.15, 0.66] });
        b.octa(0.2, C.magenta, { glow: true, pos: [-0.15, 1.15, 0.75], scale: [1, 1.4, 0.4] });
      } },
    ],
    clips: {
      move: { duration: 1.1, pose: (u, o) => { o.legL = { r: [0.45 * S(u), 0, 0] }; o.legR = { r: [-0.45 * S(u), 0, 0] }; o.torso = { r: [0, 0.06 * S(u), 0], p: [0, 0.04 * Math.abs(S(u)), 0] }; o.shield = { p: [0, 0.04 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 2, pose: (u, o) => { o.torso = { p: [0, 0.02 * S(u), 0] }; } },
      attack: { duration: 0.6, loop: false, pose: (u, o) => { o.shield = { p: [0, 0, 0.3 * Math.sin(u * P)] }; } },
      death: { duration: 1.0, loop: false, pose: (u, o) => deathPose(u, o, 'x') },
    },
  },

  mossback: {
    height: 1.9,
    parts: [
      { name: 'shell', pivot: [0, 0.9, 0], build: (b) => {
        b.ico(1.0, 1, C.stoneDark, { pos: [0, 0.95, -0.1], scale: [1.05, 0.75, 1.25] });
        b.ico(0.75, 1, C.moss, { pos: [0, 1.38, -0.1], scale: [1.1, 0.45, 1.2] });
        for (const [x, z, s] of [[0.4, 0.3, 1], [-0.35, -0.4, 0.8], [0.1, -0.7, 0.7], [-0.5, 0.35, 0.9]]) {
          b.cyl(0.05, 0.06, 0.25 * s, 5, '#EDE6D6', { pos: [x, 1.55, z] });
          b.cone(0.16 * s, 0.12 * s, 6, C.teal, { pos: [x, 1.55 + 0.25 * s, z] });
          b.ico(0.04, 0, C.cyan, { glow: true, pos: [x, 1.6 + 0.3 * s, z] });
        }
        b.box(1.5, 0.3, 1.9, C.slate2, { pos: [0, 0.5, -0.1] });
      } },
      { name: 'head', pivot: [0, 0.8, 1.0], build: (b) => {
        b.box(0.55, 0.45, 0.6, C.slate2, { pos: [0, 0.75, 1.25] });
        b.box(0.5, 0.15, 0.4, C.moss, { pos: [0, 1.0, 1.2] });
        for (const x of [-0.13, 0.13]) b.box(0.09, 0.06, 0.04, C.crimson, { glow: true, pos: [x, 0.8, 1.56] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 0.6, 0], build: (b) => {
        const legs = g === 'A' ? [[1, 0.6], [-1, -0.7]] : [[-1, 0.6], [1, -0.7]];
        for (const [s, z] of legs) b.box(0.42, 0.65, 0.42, C.slate, { pos: [s * 0.72, 0.3, z] });
      } })),
    ],
    clips: {
      move: { duration: 1.6, pose: (u, o) => { o.legsA = { r: [0.3 * S(u), 0, 0] }; o.legsB = { r: [-0.3 * S(u), 0, 0] }; o.shell = { r: [0, 0, 0.04 * S(u)] }; o.head = { r: [0.08 * S(u, 2), 0.1 * S(u), 0] }; } },
      idle: { duration: 2.5, pose: (u, o) => { o.head = { r: [0.06 * S(u), 0, 0] }; } },
      attack: { duration: 0.7, loop: false, pose: (u, o) => { o.head = { p: [0, 0, 0.3 * Math.sin(u * P)] }; } },
      death: { duration: 1.1, loop: false, pose: (u, o) => { o._root = { p: [0, -0.5 * Math.min(1, u * 1.4), 0], r: [0, 0, 0.2 * u] }; } },
    },
  },

  mite: {
    height: 0.5,
    parts: [
      { name: 'body', pivot: [0, 0.25, 0], build: (b) => {
        b.ico(0.24, 0, C.slate2, { pos: [0, 0.26, 0], scale: [1, 0.8, 1.2] });
        b.ico(0.12, 0, C.slate, { pos: [0, 0.24, 0.27] });
        b.box(0.04, 0.04, 0.03, C.crimson, { glow: true, pos: [-0.05, 0.28, 0.38] });
        b.box(0.04, 0.04, 0.03, C.crimson, { glow: true, pos: [0.05, 0.28, 0.38] });
        b.cone(0.05, 0.14, 4, C.bone, { pos: [0, 0.4, -0.05], rot: [-0.4, 0, 0] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 0.22, 0], build: (b) => {
        const legs = g === 'A' ? [[1, -0.12], [-1, 0], [1, 0.12]] : [[-1, -0.12], [1, 0], [-1, 0.12]];
        for (const [s, z] of legs) b.box(0.26, 0.04, 0.04, C.slate, { pos: [s * 0.24, 0.14, z], rot: [0, 0, s * 0.6] });
      } })),
    ],
    clips: {
      move: { duration: 0.22, pose: (u, o) => { o.legsA = { r: [0, 0.5 * S(u), 0] }; o.legsB = { r: [0, -0.5 * S(u), 0] }; o.body = { p: [0, 0.02 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 1, pose: (u, o) => { o.body = { p: [0, 0.01 * S(u), 0] }; } },
      attack: { duration: 0.4, loop: false, pose: (u, o) => { o.body = { p: [0, 0.1 * Math.sin(u * P), 0.1 * Math.sin(u * P)] }; } },
      death: { duration: 0.5, loop: false, pose: (u, o) => { o._root = { r: [0, 0, u * P], p: [0, 0.1 * Math.sin(u * P), 0] }; } },
    },
  },

  caller: {
    height: 2.6,
    parts: [
      { name: 'body', pivot: [0, 1, 0], build: (b) => {
        b.cyl(0.22, 0.55, 1.5, 7, C.slate2, { pos: [0, 0, 0] });
        b.cyl(0.56, 0.56, 0.08, 7, C.magenta, { glow: true, intensity: 1.4, pos: [0, 0.02, 0] });
        b.box(0.5, 0.4, 0.4, C.slate, { pos: [0, 1.55, 0] });
        b.ico(0.22, 0, C.bone, { pos: [0, 1.88, 0.04] });
        b.cone(0.3, 0.55, 6, C.slate, { pos: [0, 1.92, -0.06], rot: [-0.25, 0, 0] });
        for (const x of [-0.07, 0.07]) b.box(0.06, 0.04, 0.03, C.crimson, { glow: true, pos: [x, 1.9, 0.24] });
        for (const s of [-1, 1]) b.cyl(0.07, 0.15, 0.7, 5, C.slate2, { pos: [s * 0.4, 1.0, 0.1], rot: [0.3, 0, s * 0.35] });
      } },
      { name: 'ring', pivot: [0, 2.55, 0], build: (b) => {
        b.torus(0.42, 0.05, 4, 18, C.magenta, { glow: true, pos: [0, 2.55, 0], rot: [P / 2, 0, 0] });
        b.torus(0.26, 0.03, 4, 14, C.crimson, { glow: true, pos: [0, 2.55, 0], rot: [P / 2, 0, 0] });
        for (let i = 0; i < 4; i++) b.octa(0.07, C.bone, { pos: [Math.cos(i * P / 2) * 0.55, 2.55, Math.sin(i * P / 2) * 0.55] });
      } },
    ],
    clips: {
      move: { duration: 2, pose: (u, o) => { o.ring = { r: [0, u * TAU, 0], p: [0, 0.08 * S(u), 0] }; o.body = { r: [0.06, 0.05 * S(u), 0] }; } },
      idle: { duration: 2, pose: (u, o) => { o.ring = { r: [0, u * TAU, 0] }; } },
      attack: { duration: 0.9, loop: false, pose: (u, o) => { o.ring = { r: [0, u * TAU * 2, 0], s: 1 + 0.5 * Math.sin(u * P) }; o.body = { r: [-0.15 * Math.sin(u * P), 0, 0] }; } },
      death: { duration: 1.0, loop: false, pose: (u, o) => { deathPose(u, o, 'x'); o.ring = { p: [0, 1.5 * u, 0], s: Math.max(0.01, 1 - u) }; } },
    },
  },

  thornmother: {
    height: 2.2,
    parts: [
      { name: 'body', pivot: [0, 1.1, 0], build: (b) => {
        b.ico(1.0, 1, C.slate2, { pos: [0, 1.15, -0.35], scale: [1.1, 0.8, 1.5] });
        b.ico(0.7, 1, C.night, { pos: [0, 1.0, -1.25], scale: [1.1, 0.9, 1.1] });
        for (let i = 0; i < 7; i++) {
          const z = -1.6 + i * 0.4;
          b.cone(0.12, 0.55 + (i % 2) * 0.2, 4, C.bone, { pos: [0, 1.75 - Math.abs(z + 0.4) * 0.15, z], rot: [-0.3, 0, 0] });
          for (const s of [-1, 1]) b.cone(0.08, 0.35, 4, C.bone, { pos: [s * 0.65, 1.45, z], rot: [-0.2, 0, s * -0.9] });
        }
        for (const [x, z] of [[0.45, -1.2], [-0.4, -1.4], [0.1, -1.7], [-0.15, -0.9]]) b.ico(0.14, 0, C.magenta, { glow: true, pos: [x, 1.25, z] });
      } },
      { name: 'head', pivot: [0, 1.2, 0.8], build: (b) => {
        b.box(0.8, 0.6, 0.8, C.slate, { pos: [0, 1.25, 1.0] });
        b.box(0.7, 0.18, 0.5, C.bone, { pos: [0, 0.98, 1.3] });
        for (const s of [-1, 1]) b.cone(0.1, 0.6, 4, C.bone, { pos: [s * 0.3, 1.7, 0.85], rot: [-0.5, 0, s * -0.4] });
        for (const x of [-0.2, 0, 0.2]) b.box(0.1, 0.07, 0.04, C.crimson, { glow: true, pos: [x, 1.35, 1.41] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 1.0, 0], build: (b) => {
        const legs = g === 'A' ? [[1, 0.6], [-1, -0.1], [1, -0.8]] : [[-1, 0.6], [1, -0.1], [-1, -0.8]];
        for (const [s, z] of legs) {
          b.box(0.9, 0.16, 0.16, C.slate, { pos: [s * 0.95, 1.1, z], rot: [0, 0, s * 0.5] });
          b.box(0.16, 1.0, 0.16, C.slate2, { pos: [s * 1.4, 0.5, z], rot: [0, 0, s * -0.2] });
          b.cone(0.09, 0.25, 4, C.bone, { pos: [s * 1.48, 0.02, z], rot: [P, 0, 0] });
        }
      } })),
    ],
    clips: {
      move: { duration: 1.1, pose: (u, o) => { o.legsA = { r: [0, 0.3 * S(u), 0] }; o.legsB = { r: [0, -0.3 * S(u), 0] }; o.body = { p: [0, 0.05 * Math.abs(S(u)), 0], r: [0, 0, 0.03 * S(u)] }; o.head = { r: [0.06 * S(u, 2), 0.08 * S(u), 0] }; } },
      idle: { duration: 2.2, pose: (u, o) => { o.body = { r: [0.03 * S(u), 0, 0] }; o.head = { r: [0.08 * S(u), 0, 0] }; } },
      attack: { duration: 0.8, loop: false, pose: (u, o) => { o.head = { p: [0, 0, 0.4 * Math.sin(u * P)], r: [-0.3 * Math.sin(u * P), 0, 0] }; } },
      death: { duration: 1.4, loop: false, pose: (u, o) => deathPose(u, o) },
    },
  },
};

// =============================================================================== allies (rigs)
export const ALLY_RIGS = {
  spirit_wolf: {
    height: 1.0,
    parts: [
      { name: 'body', pivot: [0, 0.65, 0], build: (b) => {
        b.box(0.45, 0.42, 1.0, C.teal, { pos: [0, 0.68, 0] });
        b.box(0.36, 0.34, 0.42, C.teal, { pos: [0, 0.88, 0.62] });
        b.box(0.22, 0.18, 0.3, '#34A398', { pos: [0, 0.8, 0.9] });
        for (const s of [-1, 1]) b.cone(0.07, 0.2, 4, C.teal, { pos: [s * 0.12, 1.05, 0.55] });
        for (const s of [-1, 1]) b.box(0.06, 0.05, 0.03, C.cyan, { glow: true, pos: [s * 0.1, 0.94, 0.84] });
        b.box(0.1, 0.12, 0.6, C.cyan, { glow: true, intensity: 1.4, pos: [0, 0.85, -0.7], rot: [0.5, 0, 0] });
        b.box(0.47, 0.06, 0.9, C.cyan, { glow: true, intensity: 1.2, pos: [0, 0.91, 0] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 0.5, 0], build: (b) => {
        const legs = g === 'A' ? [[1, 0.35], [-1, -0.35]] : [[-1, 0.35], [1, -0.35]];
        for (const [s, z] of legs) b.box(0.13, 0.5, 0.14, C.teal, { pos: [s * 0.16, 0.25, z] });
      } })),
    ],
    clips: {
      move: { duration: 0.45, pose: (u, o) => { o.legsA = { r: [0.6 * S(u), 0, 0] }; o.legsB = { r: [-0.6 * S(u), 0, 0] }; o.body = { p: [0, 0.05 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 1.5, pose: (u, o) => { o.body = { p: [0, 0.02 * S(u), 0] }; } },
      attack: { duration: 0.45, loop: false, pose: (u, o) => { o.body = { p: [0, 0.1 * Math.sin(u * P), 0.35 * Math.sin(u * P)], r: [-0.25 * Math.sin(u * P), 0, 0] }; } },
      death: { duration: 0.6, loop: false, pose: (u, o) => { o._root = { p: [0, u * 0.8, 0], s: Math.max(0.01, 1 - u) }; } },
    },
  },
  spirit_drake: {
    height: 1.4,
    parts: [
      { name: 'body', pivot: [0, 1, 0], build: (b) => {
        b.ico(0.35, 0, C.ember, { pos: [0, 1.0, 0], scale: [0.9, 0.8, 1.5] });
        b.box(0.28, 0.26, 0.38, C.ember, { pos: [0, 1.15, 0.55] });
        b.box(0.08, 0.06, 0.03, C.gold, { glow: true, pos: [0.08, 1.2, 0.75] });
        b.box(0.08, 0.06, 0.03, C.gold, { glow: true, pos: [-0.08, 1.2, 0.75] });
        b.cone(0.12, 0.6, 4, C.ember, { pos: [0, 0.95, -0.65], rot: [-1.7, 0, 0] });
        b.ico(0.12, 0, C.gold, { glow: true, pos: [0, 1.0, 0.1] });
      } },
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'wingL' : 'wingR', pivot: [s * 0.25, 1.1, 0], build: (b) => {
        b.box(0.8, 0.04, 0.55, '#C2410C', { pos: [s * 0.62, 1.12, 0], rot: [0, 0, s * 0.15] });
        b.box(0.8, 0.05, 0.05, C.gold, { glow: true, intensity: 1.2, pos: [s * 0.62, 1.15, 0.27] });
      } })),
    ],
    clips: {
      move: { duration: 0.5, pose: (u, o) => { o.wingL = { r: [0, 0, -0.6 * S(u)] }; o.wingR = { r: [0, 0, 0.6 * S(u)] }; o._root = { p: [0, 0.6 + 0.1 * S(u), 0] }; } },
      idle: { duration: 0.6, pose: (u, o) => { o.wingL = { r: [0, 0, -0.5 * S(u)] }; o.wingR = { r: [0, 0, 0.5 * S(u)] }; o._root = { p: [0, 0.6, 0] }; } },
      attack: { duration: 0.5, loop: false, pose: (u, o) => { o._root = { p: [0, 0.6, 0.3 * Math.sin(u * P)] }; o.body = { r: [0.3 * Math.sin(u * P), 0, 0] }; } },
      death: { duration: 0.6, loop: false, pose: (u, o) => { o._root = { p: [0, 0.6 + u, 0], s: Math.max(0.01, 1 - u) }; } },
    },
  },
};

// =============================================================================== towers (groups)
function part(name, build, pivot = [0, 0, 0]) {
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

const sandbagRing = (b, r, gapFront = true, h = 0.3) => {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    if (gapFront && Math.abs(Math.cos(a - P / 2) - 1) < 0.25) continue;
    b.box(0.5, 0.26, 0.28, i % 2 ? C.khaki : C.khakiDark, { pos: [Math.cos(a) * r, h, Math.sin(a) * r], rot: [0, -a + P / 2, 0] });
  }
};
const stonePlinth = (b, rune = C.cyan) => {
  b.cyl(0.95, 1.05, 0.28, 6, C.stoneDark, { pos: [0, -0.1, 0] });
  b.cyl(0.82, 0.88, 0.2, 6, C.stone, { pos: [0, 0.18, 0], rot: [0, P / 6, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + P / 6;
    b.box(0.16, 0.06, 0.04, rune, { glow: true, pos: [Math.cos(a) * 0.83, 0.3, Math.sin(a) * 0.83], rot: [0, -a + P / 2, 0] });
  }
};
const soldier = (b, x, y, z, { kneel = false, helmet = C.olive } = {}) => {
  const ly = kneel ? 0.18 : 0.38;
  b.box(0.36, ly * 2, 0.3, C.oliveDark, { pos: [x, y + ly, z] });
  b.box(0.48, 0.45, 0.32, C.olive, { pos: [x, y + ly * 2 + 0.22, z] });
  b.box(0.38, 0.32, 0.06, C.khaki, { pos: [x, y + ly * 2 + 0.24, z + 0.17] });
  b.box(0.32, 0.3, 0.3, C.skin, { pos: [x, y + ly * 2 + 0.6, z] });
  b.box(0.06, 0.06, 0.02, C.black, { pos: [x - 0.07, y + ly * 2 + 0.62, z + 0.16] });
  b.box(0.06, 0.06, 0.02, C.black, { pos: [x + 0.07, y + ly * 2 + 0.62, z + 0.16] });
  b.sphere(0.23, 8, 5, helmet, { pos: [x, y + ly * 2 + 0.74, z], scale: [1.05, 0.65, 1.08] });
};

/** Builders return {group, parts:{turret, recoil, spin[], bob}, muzzle:Vector3 (local), unit?}. */
export const TOWER_MODELS = {
  marksman() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.18, 1.4, 0.18, C.woodDark, { pos: [sx * 0.75, 0.55, sz * 0.75] });
      b.box(1.8, 0.16, 1.8, C.wood, { pos: [0, 1.25, 0] });
      b.box(1.9, 0.3, 0.12, C.khaki, { pos: [0, 1.45, 0.88] });
      b.box(1.9, 0.3, 0.12, C.khaki, { pos: [0, 1.45, -0.88] });
      b.box(0.12, 0.3, 1.9, C.khakiDark, { pos: [0.88, 1.45, 0] });
      b.box(0.12, 0.3, 1.9, C.khakiDark, { pos: [-0.88, 1.45, 0] });
      for (let i = 0; i < 5; i++) b.box(0.5, 0.05, 0.08, C.wood, { pos: [0, 0.2 + i * 0.25, -0.92] });
      b.cyl(0.95, 1.0, 0.2, 8, C.gunmetal, { pos: [0, -0.1, 0] });
    }));
    const turret = part('turret', (b) => {
      soldier(b, 0, 1.33, -0.15, { kneel: true, helmet: C.khakiDark });
      b.box(0.08, 0.12, 1.5, C.gunmetal, { pos: [0.1, 2.0, 0.55] });
      b.cyl(0.06, 0.06, 0.32, 6, C.black, { pos: [0.1, 2.12, 0.25], rot: [P / 2, 0, 0], centered: true });
      b.box(0.06, 0.3, 0.06, C.gunmetal, { pos: [0.1, 1.82, 1.1] });
      b.box(0.1, 0.12, 0.35, C.wood, { pos: [0.1, 1.95, -0.25] });
    }, [0, 1.33, 0]);
    g.add(turret);
    return { group: g, parts: { turret, recoil: turret }, muzzle: new THREE.Vector3(0.1, 2.0, 1.35) };
  },

  gunner() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      b.cyl(1.05, 1.1, 0.22, 8, C.gunmetal, { pos: [0, -0.08, 0] });
      sandbagRing(b, 0.88, true, 0.3);
      sandbagRing(b, 0.86, true, 0.55);
    }));
    const turret = part('turret', (b) => {
      soldier(b, 0, 0.12, -0.35, { kneel: true });
      b.cyl(0.04, 0.04, 0.45, 5, C.gunmetal, { pos: [0, 0.2, 0.25] });
      b.box(0.22, 0.2, 0.55, C.gunmetal, { pos: [0, 0.78, 0.25] });
      b.box(0.18, 0.12, 0.2, C.olive, { pos: [0.18, 0.72, 0.15] });
    }, [0, 0.6, 0]);
    const barrel = part('barrel', (b) => {
      for (let i = 0; i < 4; i++) b.cyl(0.025, 0.025, 0.65, 5, C.black, { pos: [Math.cos(i * P / 2) * 0.05, 0.8 + Math.sin(i * P / 2) * 0.05, 0.85], rot: [P / 2, 0, 0], centered: true });
    }, [0, 0.8, 0.6]);
    turret.add(barrel);
    barrel.position.sub(turret.position);
    g.add(turret);
    return { group: g, parts: { turret, recoil: barrel, spinZ: [barrel] }, muzzle: new THREE.Vector3(0, 0.8, 1.2) };
  },

  gunship() {
    const g = new THREE.Group();
    g.add(part('pad', (b) => {
      b.cyl(1.35, 1.45, 0.2, 12, C.gunmetal, { pos: [0, -0.08, 0] });
      b.cyl(1.2, 1.2, 0.04, 12, C.steel, { pos: [0, 0.12, 0] });
      b.box(0.14, 0.02, 0.9, C.gold, { pos: [-0.3, 0.15, 0] });
      b.box(0.14, 0.02, 0.9, C.gold, { pos: [0.3, 0.15, 0] });
      b.box(0.6, 0.02, 0.14, C.gold, { pos: [0, 0.15, 0] });
      for (let i = 0; i < 8; i++) b.box(0.08, 0.06, 0.08, C.muzzle, { glow: true, pos: [Math.cos(i * P / 4) * 1.25, 0.15, Math.sin(i * P / 4) * 1.25] });
    }));
    // the helicopter itself flies (sim provides its position); returned separately as `unit`
    const unit = new THREE.Group();
    const heli = part('heli', (b) => {
      b.ico(0.6, 1, C.olive, { pos: [0, 0, 0.1], scale: [0.85, 0.75, 1.35] });
      b.box(0.5, 0.32, 0.4, '#1F3A4D', { pos: [0, 0.12, 0.72] });
      b.cyl(0.14, 0.07, 1.6, 6, C.olive, { pos: [0, 0.1, -0.6], rot: [-P / 2 - 0.05, 0, 0] });
      b.box(0.06, 0.45, 0.3, C.oliveDark, { pos: [0, 0.32, -2.1] });
      for (const s of [-1, 1]) {
        b.box(0.05, 0.05, 1.2, C.gunmetal, { pos: [s * 0.42, -0.55, 0.1] });
        b.box(0.05, 0.3, 0.05, C.gunmetal, { pos: [s * 0.42, -0.4, 0.4] });
        b.box(0.05, 0.3, 0.05, C.gunmetal, { pos: [s * 0.42, -0.4, -0.2] });
        b.cyl(0.08, 0.08, 0.5, 6, C.gunmetal, { pos: [s * 0.62, -0.1, 0.2], rot: [P / 2, 0, 0], centered: true });
      }
      b.box(0.1, 0.1, 0.4, C.gunmetal, { pos: [0, -0.32, 0.85] });
      b.cyl(0.08, 0.1, 0.25, 6, C.gunmetal, { pos: [0, 0.38, 0.05] });
      b.box(0.25, 0.04, 0.12, C.hazard, { pos: [0, -0.02, -1.3] });
    });
    const rotor = part('rotor', (b) => {
      b.box(4.2, 0.03, 0.2, C.black, { pos: [0, 0.65, 0] });
      b.box(0.2, 0.03, 4.2, C.black, { pos: [0, 0.65, 0] });
      b.cyl(0.12, 0.12, 0.08, 6, C.gunmetal, { pos: [0, 0.6, 0] });
    });
    const tail = part('tailRotor', (b) => {
      b.box(0.03, 0.9, 0.12, C.black, { pos: [0.06, 0.32, -2.2] });
    }, [0.06, 0.32, -2.2]);
    unit.add(heli, rotor, tail);
    return { group: g, unit, parts: { spinY: [rotor], spinX: [tail], recoil: heli }, muzzle: new THREE.Vector3(0, -0.32, 1.1) };
  },

  supply_depot() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      b.box(2.4, 0.2, 2.2, C.gunmetal, { pos: [0, -0.05, 0] });
      b.box(1.1, 0.7, 1.9, C.olive, { pos: [0.55, 0.55, 0] });
      b.box(1.0, 0.6, 0.7, C.oliveDark, { pos: [0.55, 0.5, 1.15] });
      b.box(0.9, 0.3, 0.05, '#1F3A4D', { pos: [0.55, 0.7, 1.51] });
      for (const z of [-0.6, 0.6]) for (const x of [0.15, 0.95]) b.cyl(0.18, 0.18, 0.16, 8, C.black, { pos: [x, 0.18, z * 1.2], rot: [0, 0, P / 2], centered: true });
      b.box(0.65, 0.6, 0.65, C.wood, { pos: [-0.65, 0.3, 0.5] });
      b.box(0.55, 0.5, 0.55, C.wood, { pos: [-0.65, 0.85, 0.5], rot: [0, 0.3, 0] });
      b.box(0.65, 0.6, 0.65, C.woodDark, { pos: [-0.7, 0.3, -0.4] });
      b.box(0.3, 0.12, 0.02, C.hazard, { pos: [-0.65, 0.35, 0.83] });
      b.cyl(0.04, 0.04, 1.6, 5, C.gunmetal, { pos: [-1.05, 0.0, -0.95] });
    }));
    const bob = part('flag', (b) => {
      b.box(0.6, 0.38, 0.03, C.gold, { pos: [-0.75, 1.4, -0.95] });
      b.box(0.2, 0.16, 0.04, C.olive, { pos: [-0.75, 1.42, -0.95] });
    }, [-1.05, 1.4, -0.95]);
    g.add(bob);
    return { group: g, parts: { sway: bob }, muzzle: new THREE.Vector3(0, 1.4, 0) };
  },

  mine_layer() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      b.cyl(1.0, 1.05, 0.2, 8, C.gunmetal, { pos: [0, -0.08, 0] });
      b.box(0.6, 0.5, 0.6, C.wood, { pos: [-0.5, 0.25, -0.4] });
      b.box(0.5, 0.4, 0.5, C.woodDark, { pos: [-0.5, 0.7, -0.4], rot: [0, 0.4, 0] });
      for (let i = 0; i < 3; i++) b.cyl(0.18, 0.2, 0.08, 8, C.oliveDark, { pos: [0.45, 0.12 + i * 0.09, -0.45] });
      b.box(0.24, 0.06, 0.04, C.hazard, { pos: [-0.5, 0.3, -0.09] });
    }));
    const turret = part('turret', (b) => {
      soldier(b, 0.1, 0.12, 0.2);
      b.cyl(0.02, 0.02, 0.9, 4, C.gunmetal, { pos: [0.4, 0.4, 0.55], rot: [0.9, 0, 0] });
      b.cyl(0.14, 0.14, 0.03, 8, C.steel, { pos: [0.4, 0.02, 1.05], rot: [0.1, 0, 0] });
      b.box(0.04, 0.04, 0.04, C.crimson, { glow: true, pos: [0.4, 0.75, 0.25] });
    }, [0.1, 0, 0.2]);
    g.add(turret);
    return { group: g, parts: { turret }, muzzle: new THREE.Vector3(0.4, 0.1, 1.0) };
  },

  frost_weaver() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      stonePlinth(b, C.cyan);
      for (const [x, z, s] of [[0.6, 0.4, 1], [-0.55, 0.45, 0.8], [0.1, -0.7, 0.9]]) b.octa(0.22 * s, C.ice, { pos: [x, 0.45, z], scale: [0.7, 1.6, 0.7] });
    }));
    const turret = part('turret', (b) => {
      b.cyl(0.42, 0.2, 0.95, 8, '#3A86FF', { pos: [0, 0.38, 0] });
      b.cyl(0.43, 0.43, 0.07, 8, C.ice, { pos: [0, 0.38, 0] });
      b.box(0.48, 0.28, 0.3, C.night, { pos: [0, 1.22, 0] });
      b.box(0.32, 0.3, 0.3, C.skin, { pos: [0, 1.45, 0.02] });
      for (const x of [-0.07, 0.07]) b.box(0.06, 0.06, 0.02, C.black, { pos: [x, 1.47, 0.18] });
      b.cone(0.3, 0.62, 8, '#3A86FF', { pos: [0, 1.58, 0] });
      b.box(0.5, 0.06, 0.5, C.ice, { pos: [0, 1.6, 0], rot: [0, P / 4, 0] });
      b.cyl(0.035, 0.035, 1.5, 6, C.stoneLight, { pos: [0.36, 0.4, 0.15] });
      b.octa(0.13, C.cyan, { glow: true, pos: [0.36, 2.0, 0.15], scale: [0.8, 1.6, 0.8] });
    }, [0, 0.38, 0]);
    const spin = part('shards', (b) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        b.octa(0.1, i % 2 ? C.cyan : C.ice, { glow: i % 2 === 1, intensity: 1.6, pos: [Math.cos(a) * 0.95, 1.1, Math.sin(a) * 0.95], scale: [0.6, 1.5, 0.6] });
      }
    }, [0, 1.1, 0]);
    g.add(turret, spin);
    return { group: g, parts: { turret, spinY: [spin], bob: spin }, muzzle: new THREE.Vector3(0.36, 2.0, 0.15) };
  },

  storm_caller() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      stonePlinth(b, C.storm);
      b.cyl(0.45, 0.6, 1.5, 6, C.stone, { pos: [0, 0.3, 0] });
      for (let i = 0; i < 3; i++) b.torus(0.5 - i * 0.04, 0.05, 4, 14, C.gunmetal, { pos: [0, 0.65 + i * 0.4, 0], rot: [P / 2, 0, 0] });
      b.cyl(0.6, 0.45, 0.25, 6, C.stoneLight, { pos: [0, 1.8, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + P / 4;
        b.cone(0.07, 0.6, 4, C.stoneLight, { pos: [Math.cos(a) * 0.45, 2.0, Math.sin(a) * 0.45], rot: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] });
      }
    }));
    const orb = part('orb', (b) => {
      b.ico(0.26, 1, C.storm, { glow: true, intensity: 1.45, pos: [0, 2.75, 0] });
      b.torus(0.5, 0.03, 3, 16, C.glowViolet, { glow: true, pos: [0, 2.75, 0], rot: [P / 2, 0.4, 0] });
      b.torus(0.45, 0.03, 3, 16, C.storm, { glow: true, pos: [0, 2.75, 0], rot: [0.3, 0, 0.6] });
    }, [0, 2.75, 0]);
    g.add(orb);
    return { group: g, parts: { spinY: [orb], bob: orb }, muzzle: new THREE.Vector3(0, 2.75, 0) };
  },

  rune_totem() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      stonePlinth(b, C.glowViolet);
      b.box(0.6, 2.4, 0.6, C.stone, { pos: [0, 1.3, 0] });
      b.box(0.75, 0.3, 0.75, C.stoneLight, { pos: [0, 2.55, 0] });
      b.box(0.75, 0.25, 0.75, C.stoneDark, { pos: [0, 0.3, 0] });
      for (const [y, s] of [[0.9, 1], [1.5, 0.8], [2.1, 0.9]]) {
        for (const [x, z, ry] of [[0, 0.31, 0], [0, -0.31, 0], [0.31, 0, P / 2], [-0.31, 0, P / 2]]) {
          b.box(0.3 * s, 0.08, 0.02, C.glowViolet, { glow: true, pos: [x, y, z], rot: [0, ry, 0] });
          b.box(0.08, 0.3 * s, 0.02, C.glowViolet, { glow: true, pos: [x, y, z], rot: [0, ry, 0] });
        }
      }
      b.octa(0.25, C.gold, { glow: true, intensity: 1.8, pos: [0, 3.0, 0], scale: [1, 1.5, 1] });
    }));
    const rings = part('rings', (b) => {
      b.torus(0.85, 0.04, 3, 20, C.glowViolet, { glow: true, pos: [0, 1.0, 0], rot: [P / 2, 0, 0] });
      b.torus(0.7, 0.04, 3, 20, C.cyan, { glow: true, pos: [0, 1.8, 0], rot: [P / 2, 0, 0] });
      for (let i = 0; i < 6; i++) b.box(0.12, 0.12, 0.03, C.glowViolet, { glow: true, pos: [Math.cos(i * P / 3) * 0.85, 1.0, Math.sin(i * P / 3) * 0.85], rot: [0, -i * P / 3, 0] });
    }, [0, 1.4, 0]);
    g.add(rings);
    return { group: g, parts: { spinY: [rings] }, muzzle: new THREE.Vector3(0, 3.0, 0) };
  },

  spirit_summoner() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      stonePlinth(b, C.teal);
      b.torus(1.25, 0.05, 3, 24, C.teal, { glow: true, intensity: 1.6, pos: [0, 0.32, 0], rot: [P / 2, 0, 0] });
    }));
    const turret = part('turret', (b) => {
      b.cyl(0.42, 0.22, 0.95, 8, '#2D6A4F', { pos: [0, 0.38, 0] });
      b.box(0.55, 0.3, 0.32, '#1B4332', { pos: [0, 1.22, 0] });
      b.box(0.32, 0.3, 0.3, C.skin, { pos: [0, 1.46, 0.02] });
      for (const x of [-0.07, 0.07]) b.box(0.06, 0.06, 0.02, C.black, { pos: [x, 1.48, 0.18] });
      b.box(0.4, 0.22, 0.36, C.bone, { pos: [0, 1.7, -0.02] });
      for (const s of [-1, 1]) b.cone(0.06, 0.28, 4, C.bone, { pos: [s * 0.15, 1.82, 0.0], rot: [-0.2, 0, s * -0.5] });
      b.cyl(0.04, 0.04, 1.7, 6, C.woodDark, { pos: [-0.38, 0.35, 0.15] });
      b.box(0.22, 0.2, 0.32, C.teal, { pos: [-0.38, 2.1, 0.2] });
      b.box(0.06, 0.05, 0.02, C.cyan, { glow: true, pos: [-0.33, 2.15, 0.37] });
      b.box(0.06, 0.05, 0.02, C.cyan, { glow: true, pos: [-0.43, 2.15, 0.37] });
    }, [0, 0.38, 0]);
    const spin = part('wisps', (b) => {
      for (let i = 0; i < 3; i++) b.ico(0.09, 0, C.cyan, { glow: true, pos: [Math.cos(i * TAU / 3) * 0.9, 1.3, Math.sin(i * TAU / 3) * 0.9] });
    }, [0, 1.3, 0]);
    g.add(turret, spin);
    return { group: g, parts: { turret, spinY: [spin], bob: spin }, muzzle: new THREE.Vector3(-0.38, 2.1, 0.2) };
  },
  titan_railgun() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      b.cyl(1.15, 1.25, 0.3, 8, C.gunmetal, { pos: [0, -0.05, 0] });
      b.cyl(0.95, 1.05, 0.25, 8, C.steel, { pos: [0, 0.22, 0] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        b.box(0.34, 0.08, 0.08, i % 2 ? C.hazard : C.black, { pos: [Math.cos(a) * 1.08, 0.12, Math.sin(a) * 1.08], rot: [0, -a + P / 2, 0] });
      }
      for (const s of [-1, 1]) b.box(0.4, 0.5, 1.2, C.gunmetal, { pos: [s * 0.7, 0.55, -0.2] });
      b.box(0.2, 0.14, 0.2, C.cyan, { glow: true, pos: [0.7, 0.85, 0.3] });
    }));
    const turret = part('turret', (b) => {
      b.box(1.05, 0.55, 1.25, C.gunmetal, { pos: [0, 1.15, -0.25] });
      b.box(0.9, 0.12, 1.1, C.steel, { pos: [0, 1.48, -0.25] });
      // twin rails with glowing coils
      for (const s of [-1, 1]) b.box(0.12, 0.2, 2.6, C.black, { pos: [s * 0.2, 1.25, 1.15] });
      for (let i = 0; i < 5; i++) b.box(0.62, 0.36, 0.1, i % 2 ? C.gunmetal : C.steel, { pos: [0, 1.25, 0.45 + i * 0.42] });
      for (let i = 0; i < 4; i++) b.box(0.1, 0.06, 0.06, C.cyan, { glow: true, pos: [0, 1.25, 0.66 + i * 0.42] });
      b.box(0.38, 0.3, 0.5, C.hazard, { pos: [0, 1.2, -0.95] });
      b.cyl(0.07, 0.07, 0.6, 6, C.steel, { pos: [0.42, 1.65, -0.5] });
      b.box(0.08, 0.08, 0.08, C.crimson, { glow: true, pos: [0.42, 1.98, -0.5] });
    }, [0, 1.15, 0]);
    g.add(turret);
    return { group: g, parts: { turret, recoil: turret }, muzzle: new THREE.Vector3(0, 1.25, 2.45) };
  },

  starfall_oracle() {
    const g = new THREE.Group();
    g.add(part('base', (b) => {
      stonePlinth(b, C.glowViolet);
      b.cyl(0.42, 0.58, 0.5, 6, C.stoneLight, { pos: [0, 0.45, 0] });
      // robed oracle
      b.cone(0.55, 1.5, 8, C.night, { pos: [0, 0.7, 0] });
      b.cyl(0.36, 0.5, 0.25, 8, C.violet, { pos: [0, 1.2, 0] });
      b.sphere(0.24, 8, 6, C.skin, { pos: [0, 1.92, 0.02] });
      b.cone(0.34, 0.55, 8, C.night, { pos: [0, 2.15, -0.04], rot: [-0.15, 0, 0] });
      for (const x of [-0.08, 0.08]) b.box(0.06, 0.05, 0.03, C.cyan, { glow: true, pos: [x, 1.94, 0.22] });
      for (const s of [-1, 1]) b.box(0.14, 0.62, 0.14, C.night, { pos: [s * 0.42, 1.5, 0.12], rot: [0.6, 0, s * -0.5] });
      for (let i = 0; i < 5; i++) b.octa(0.05, C.gold, { glow: true, pos: [Math.cos(i * 1.26) * 0.34, 1.0 + (i % 2) * 0.3, Math.sin(i * 1.26) * 0.34] });
    }));
    const orb = part('orb', (b) => {
      b.octa(0.3, C.gold, { glow: true, intensity: 1.6, pos: [0, 2.95, 0], scale: [1, 1.4, 1] });
      b.torus(0.62, 0.035, 3, 18, C.glowViolet, { glow: true, pos: [0, 2.95, 0], rot: [P / 2, 0, 0.3] });
      b.torus(0.5, 0.03, 3, 18, C.cyan, { glow: true, pos: [0, 2.95, 0], rot: [0.5, 0.2, 0] });
      for (let i = 0; i < 4; i++) b.octa(0.08, C.pink, { glow: true, pos: [Math.cos(i * P / 2) * 0.62, 2.95, Math.sin(i * P / 2) * 0.62] });
    }, [0, 2.95, 0]);
    g.add(orb);
    return { group: g, parts: { spinY: [orb], bob: orb }, muzzle: new THREE.Vector3(0, 2.95, 0) };
  },
};

/** Small mine (mine layer) */
export function mineModel() {
  const b = new ModelBuilder();
  b.cyl(0.26, 0.3, 0.1, 8, C.oliveDark, {});
  b.cyl(0.08, 0.08, 0.06, 6, C.gunmetal, { pos: [0, 0.1, 0] });
  b.box(0.06, 0.03, 0.06, C.crimson, { glow: true, pos: [0, 0.17, 0] });
  return b.build();
}
