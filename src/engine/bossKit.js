// Modular code-built boss models (ROADMAP Chunk 1): a few base bodies plus attachable parts whose
// silhouette hints at the boss mechanic (armour plates = armour, orbiting plates = shield, totems =
// summoner, hammer = tower stun, long lance = sniper, crystals + ring = healer, veil = cloak, crown and
// coin sack = cash thief, rift shards = teleport / portals, skulls = revives, egg sacs = splits).
// Pure: no Three.js import. Returns rig definitions in the ENEMY_RIGS format (built by a ModelBuilder
// `b` and baked by instancedRig.js), so Node tests can check every combination. Front = +Z, up = +Y.
// Data: enemy `model.kit = { body, parts: [...], accent }` (written by tools/gen-bosses.mjs).

const P = Math.PI;
const TAU = P * 2;
const S = (u, k = 1) => Math.sin(u * TAU * k);

const BASE = { hide: '#3A3D5C', dark: '#2B2D42', deep: '#1E1B4B', bone: '#D6CFC7', metal: '#3D4451', steel: '#8A939E', gold: '#FFD166' };
/** Glow accents (emissive only, docs/art-style.md). */
export const ACCENTS = { crimson: '#E63946', magenta: '#FF3CAC', violet: '#C9A7FF', toxic: '#9BE564', ember: '#FF6B35', frost: '#7FF6FF' };

const deathPose = (u, o) => { const k = Math.min(1, u * 1.5); o._root = { r: [0, 0, k * 1.3], p: [0, -0.5 * k, 0] }; };

// ---------------------------------------------------------------------------------------- bodies
// anchors: where parts attach: { part, pos } in model space (part = the rig part that carries it)
export const BOSS_BODIES = {
  // hulking biped: wide torso, big arms, short legs
  brute: {
    height: 3.3,
    anchors: { head: { part: 'head', pos: [0, 3.05, 0.25] }, back: { part: 'body', pos: [0, 2.3, -0.75] }, handR: { part: 'armR', pos: [1.35, 1.15, 0.35] }, handL: { part: 'armL', pos: [-1.35, 1.15, 0.35] }, shoulder: { part: 'body', pos: [1.05, 2.55, 0] }, chest: { part: 'body', pos: [0, 2.0, 0.62] }, belt: { part: 'body', pos: [0, 1.35, 0] } },
    parts: (c, a) => [
      { name: 'body', pivot: [0, 1.4, 0], build: (b) => {
        b.box(1.7, 1.3, 1.1, c.hide, { pos: [0, 2.05, 0] });
        b.box(1.3, 0.55, 0.95, c.dark, { pos: [0, 1.25, 0] });
        b.box(0.9, 0.5, 0.12, c.bone, { pos: [0, 2.1, 0.58] });
        for (const x of [-0.3, 0, 0.3]) b.box(0.18, 0.08, 0.06, a, { glow: true, pos: [x, 1.7, 0.56] });
      } },
      { name: 'head', pivot: [0, 2.7, 0.1], build: (b) => {
        b.box(0.7, 0.62, 0.7, c.dark, { pos: [0, 2.95, 0.2] });
        b.box(0.62, 0.18, 0.32, c.bone, { pos: [0, 2.7, 0.45] });
        for (const x of [-0.16, 0.16]) b.box(0.12, 0.07, 0.04, a, { glow: true, pos: [x, 3.02, 0.56] });
      } },
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'armL' : 'armR', pivot: [s * 1.0, 2.5, 0], build: (b) => {
        b.box(0.62, 0.62, 0.62, c.dark, { pos: [s * 1.12, 2.5, 0] });
        b.box(0.42, 1.1, 0.42, c.hide, { pos: [s * 1.25, 1.85, 0.1] });
        b.box(0.55, 0.5, 0.55, c.dark, { pos: [s * 1.3, 1.15, 0.3] });
      } })),
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'legL' : 'legR', pivot: [s * 0.45, 1.05, 0], build: (b) => {
        b.box(0.5, 1.0, 0.55, c.dark, { pos: [s * 0.45, 0.55, 0] });
        b.box(0.62, 0.18, 0.8, c.hide, { pos: [s * 0.45, 0.09, 0.1] });
      } })),
    ],
    clips: {
      move: { duration: 1.1, pose: (u, o) => { o.legL = { r: [0.45 * S(u), 0, 0] }; o.legR = { r: [-0.45 * S(u), 0, 0] }; o.armL = { r: [-0.3 * S(u), 0, 0] }; o.armR = { r: [0.3 * S(u), 0, 0] }; o.body = { p: [0, 0.06 * Math.abs(S(u)), 0], r: [0, 0.06 * S(u), 0] }; o.head = { p: [0, 0.06 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 2.2, pose: (u, o) => { o.body = { r: [0.03 * S(u), 0, 0] }; o.head = { r: [0.06 * S(u), 0.1 * S(u, 0.5), 0] }; } },
      attack: { duration: 0.9, loop: false, pose: (u, o) => { const k = Math.sin(u * P); o.armR = { r: [-1.6 * k, 0, 0] }; o.armL = { r: [-1.2 * k, 0, 0] }; o.body = { r: [0.2 * k, 0, 0] }; } },
      death: { duration: 1.4, loop: false, pose: deathPose },
    },
  },

  // long-legged quadruped beast with a forward head: built to charge
  strider: {
    height: 3.0,
    anchors: { head: { part: 'head', pos: [0, 2.75, 1.75] }, back: { part: 'body', pos: [0, 2.75, -0.3] }, handR: { part: 'body', pos: [0.75, 2.6, 0.4] }, handL: { part: 'body', pos: [-0.75, 2.6, 0.4] }, shoulder: { part: 'body', pos: [0.75, 2.5, 0.6] }, chest: { part: 'body', pos: [0, 2.0, 1.05] }, belt: { part: 'body', pos: [0, 1.85, -0.2] } },
    parts: (c, a) => [
      { name: 'body', pivot: [0, 2.2, 0], build: (b) => {
        b.ico(0.9, 1, c.hide, { pos: [0, 2.3, 0], scale: [0.9, 0.7, 1.45] });
        b.box(1.0, 0.25, 1.6, c.dark, { pos: [0, 2.85, -0.1] });
        for (let i = 0; i < 5; i++) b.cone(0.1, 0.45, 4, c.bone, { centered: true, pos: [0, 2.95, -0.9 + i * 0.4], rot: [-0.5, 0, 0] });
        b.cone(0.2, 1.1, 5, c.dark, { centered: true, pos: [0, 2.2, -1.6], rot: [-1.9, 0, 0] });
      } },
      { name: 'head', pivot: [0, 2.5, 1.0], build: (b) => {
        b.box(0.45, 0.5, 0.8, c.hide, { pos: [0, 2.45, 1.05], rot: [-0.5, 0, 0] });
        b.box(0.62, 0.55, 0.72, c.dark, { pos: [0, 2.65, 1.6] });
        b.box(0.5, 0.16, 0.45, c.bone, { pos: [0, 2.38, 1.85] });
        for (const x of [-0.18, 0.18]) b.box(0.1, 0.07, 0.04, a, { glow: true, pos: [x, 2.75, 1.97] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 2.1, 0], build: (b) => {
        const legs = g === 'A' ? [[1, 0.75], [-1, -0.75]] : [[-1, 0.75], [1, -0.75]];
        for (const [s, z] of legs) {
          b.box(0.3, 1.1, 0.34, c.hide, { pos: [s * 0.62, 1.6, z], rot: [0.25, 0, 0] });
          b.box(0.22, 1.2, 0.24, c.dark, { pos: [s * 0.66, 0.6, z + 0.1], rot: [-0.2, 0, 0] });
          b.box(0.34, 0.14, 0.42, c.bone, { pos: [s * 0.66, 0.07, z + 0.2] });
        }
      } })),
    ],
    clips: {
      move: { duration: 0.7, pose: (u, o) => { o.legsA = { r: [0.5 * S(u), 0, 0] }; o.legsB = { r: [-0.5 * S(u), 0, 0] }; o.body = { p: [0, 0.08 * Math.abs(S(u)), 0], r: [0.04 * S(u, 2), 0, 0] }; o.head = { r: [0.08 * S(u, 2), 0, 0], p: [0, 0.08 * Math.abs(S(u)), 0] }; } },
      idle: { duration: 2, pose: (u, o) => { o.head = { r: [0.1 * S(u), 0.15 * S(u, 0.5), 0] }; o.body = { p: [0, 0.03 * S(u), 0] }; } },
      attack: { duration: 0.7, loop: false, pose: (u, o) => { const k = Math.sin(u * P); o.head = { r: [0.5 * k, 0, 0], p: [0, -0.2 * k, 0.4 * k] }; o.body = { r: [0.12 * k, 0, 0] }; } },
      death: { duration: 1.4, loop: false, pose: deathPose },
    },
  },

  // floating hooded caster, no legs; bobs and sways
  wraith: {
    height: 3.4,
    anchors: { head: { part: 'body', pos: [0, 3.15, 0.05] }, back: { part: 'body', pos: [0, 2.4, -0.55] }, handR: { part: 'armR', pos: [0.95, 1.75, 0.55] }, handL: { part: 'armL', pos: [-0.95, 1.75, 0.55] }, shoulder: { part: 'body', pos: [0.6, 2.55, 0] }, chest: { part: 'body', pos: [0, 2.2, 0.45] }, belt: { part: 'body', pos: [0, 1.55, 0] } },
    parts: (c, a) => [
      { name: 'body', pivot: [0, 1.8, 0], build: (b) => {
        b.cyl(0.35, 1.0, 1.9, 7, c.deep, { centered: true, pos: [0, 1.35, 0] });
        b.cyl(0.55, 0.35, 0.7, 7, c.hide, { centered: true, pos: [0, 2.55, 0] });
        b.cone(0.5, 0.9, 6, c.deep, { centered: true, pos: [0, 3.15, -0.08], rot: [-0.25, 0, 0] });
        b.ico(0.3, 0, c.dark, { pos: [0, 2.95, 0.12] });
        for (const x of [-0.11, 0.11]) b.box(0.1, 0.06, 0.04, a, { glow: true, pos: [x, 2.98, 0.4] });
        for (let i = 0; i < 6; i++) { const ang = (i / 6) * TAU; b.cone(0.2, 0.45, 4, c.deep, { centered: true, pos: [Math.cos(ang) * 0.9, 0.42, Math.sin(ang) * 0.9], rot: [P, 0, 0] }); }
      } },
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'armL' : 'armR', pivot: [s * 0.6, 2.5, 0], build: (b) => {
        b.cyl(0.14, 0.28, 0.95, 6, c.deep, { centered: true, pos: [s * 0.8, 2.1, 0.25], rot: [0.6, 0, s * 0.35] });
        b.box(0.2, 0.22, 0.2, c.bone, { pos: [s * 0.95, 1.72, 0.55] });
      } })),
    ],
    clips: {
      move: { duration: 2, pose: (u, o) => { o._root = { p: [0, 0.18 + 0.12 * S(u), 0] }; o.body = { r: [0.08, 0.06 * S(u), 0] }; o.armL = { r: [0.1 * S(u), 0, 0] }; o.armR = { r: [-0.1 * S(u), 0, 0] }; } },
      idle: { duration: 2.4, pose: (u, o) => { o._root = { p: [0, 0.18 + 0.1 * S(u), 0] }; } },
      attack: { duration: 0.9, loop: false, pose: (u, o) => { const k = Math.sin(u * P); o._root = { p: [0, 0.18 + 0.3 * k, 0] }; o.armL = { r: [-1.1 * k, 0, 0] }; o.armR = { r: [-1.1 * k, 0, 0] }; } },
      death: { duration: 1.4, loop: false, pose: (u, o) => { o._root = { p: [0, -1.2 * u, 0], s: Math.max(0.05, 1 - 0.6 * u), r: [0, u * P, 0] }; } },
    },
  },

  // blocky stone-and-iron golem: very wide, slow
  colossus: {
    height: 3.6,
    anchors: { head: { part: 'body', pos: [0, 3.35, 0.15] }, back: { part: 'body', pos: [0, 2.5, -0.9] }, handR: { part: 'armR', pos: [1.6, 0.95, 0.35] }, handL: { part: 'armL', pos: [-1.6, 0.95, 0.35] }, shoulder: { part: 'body', pos: [1.25, 2.85, 0] }, chest: { part: 'body', pos: [0, 2.25, 0.82] }, belt: { part: 'body', pos: [0, 1.4, 0] } },
    parts: (c, a) => [
      { name: 'body', pivot: [0, 1.5, 0], build: (b) => {
        b.box(2.1, 1.5, 1.5, c.metal, { pos: [0, 2.3, 0] });
        b.box(1.5, 0.6, 1.2, c.dark, { pos: [0, 1.3, 0] });
        b.box(0.75, 0.6, 0.7, c.hide, { pos: [0, 3.3, 0.15] });
        b.box(0.6, 0.12, 0.04, a, { glow: true, pos: [0, 3.35, 0.51] });
        b.box(0.5, 0.5, 0.06, a, { glow: true, pos: [0, 2.3, 0.77], rot: [0, 0, P / 4], scale: 0.7 });
        for (const s of [-1, 1]) b.box(0.08, 1.2, 0.08, c.steel, { pos: [s * 0.7, 2.3, 0.77] });
      } },
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'armL' : 'armR', pivot: [s * 1.2, 2.8, 0], build: (b) => {
        b.box(0.8, 0.75, 0.8, c.hide, { pos: [s * 1.35, 2.8, 0] });
        b.box(0.55, 1.2, 0.55, c.metal, { pos: [s * 1.5, 1.95, 0.1] });
        b.box(0.8, 0.7, 0.8, c.dark, { pos: [s * 1.6, 1.0, 0.3] });
      } })),
      ...[-1, 1].map((s) => ({ name: s < 0 ? 'legL' : 'legR', pivot: [s * 0.55, 1.1, 0], build: (b) => {
        b.box(0.7, 1.1, 0.75, c.metal, { pos: [s * 0.55, 0.55, 0] });
        b.box(0.85, 0.2, 1.0, c.dark, { pos: [s * 0.55, 0.1, 0.1] });
      } })),
    ],
    clips: {
      move: { duration: 1.4, pose: (u, o) => { o.legL = { r: [0.35 * S(u), 0, 0] }; o.legR = { r: [-0.35 * S(u), 0, 0] }; o.armL = { r: [-0.2 * S(u), 0, 0] }; o.armR = { r: [0.2 * S(u), 0, 0] }; o.body = { p: [0, 0.05 * Math.abs(S(u)), 0], r: [0, 0, 0.04 * S(u)] }; } },
      idle: { duration: 2.6, pose: (u, o) => { o.body = { p: [0, 0.03 * S(u), 0] }; } },
      attack: { duration: 1.0, loop: false, pose: (u, o) => { const k = Math.sin(u * P); o.armR = { r: [-2.0 * k, 0, 0] }; o.armL = { r: [-2.0 * k, 0, 0] }; o.body = { r: [-0.15 * k, 0, 0] }; } },
      death: { duration: 1.6, loop: false, pose: deathPose },
    },
  },

  // low armoured crawler with a raised tail: the brood beast
  crawler: {
    height: 2.4,
    anchors: { head: { part: 'body', pos: [0, 1.75, 1.45] }, back: { part: 'body', pos: [0, 2.05, -0.2] }, handR: { part: 'tail', pos: [0, 3.0, -1.0] }, handL: { part: 'body', pos: [-0.9, 1.6, 0.9] }, shoulder: { part: 'body', pos: [0.9, 1.75, 0.5] }, chest: { part: 'body', pos: [0, 1.25, 1.55] }, belt: { part: 'body', pos: [0, 1.5, -0.9] } },
    parts: (c, a) => [
      { name: 'body', pivot: [0, 1.2, 0], build: (b) => {
        b.ico(1.0, 1, c.hide, { pos: [0, 1.35, -0.2], scale: [1.25, 0.65, 1.5] });
        b.ico(0.6, 1, c.dark, { pos: [0, 1.35, 1.2], scale: [1.2, 0.8, 0.9] });
        for (let i = 0; i < 4; i++) b.box(2.0 - i * 0.25, 0.12, 0.3, c.dark, { pos: [0, 1.95 - i * 0.04, 0.5 - i * 0.45] });
        for (const s of [-1, 1]) b.cone(0.1, 0.7, 4, c.bone, { centered: true, pos: [s * 0.35, 1.05, 1.75], rot: [1.4, 0, s * -0.4] });
        for (const x of [-0.25, -0.08, 0.08, 0.25]) b.box(0.08, 0.06, 0.04, a, { glow: true, pos: [x, 1.55, 1.71] });
      } },
      { name: 'tail', pivot: [0, 1.5, -1.3], build: (b) => {
        for (let i = 0; i < 4; i++) b.ico(0.28 - i * 0.03, 0, i % 2 ? c.dark : c.hide, { pos: [0, 1.7 + i * 0.38, -1.45 - Math.sin(i * 0.5) * 0.25] });
        b.cone(0.16, 0.5, 4, c.bone, { centered: true, pos: [0, 3.15, -1.2], rot: [0.9, 0, 0] });
      } },
      ...['A', 'B'].map((g) => ({ name: `legs${g}`, pivot: [0, 1.2, 0], build: (b) => {
        const legs = g === 'A' ? [[1, 0.8], [-1, 0], [1, -0.8]] : [[-1, 0.8], [1, 0], [-1, -0.8]];
        for (const [s, z] of legs) {
          b.box(0.85, 0.16, 0.16, c.dark, { pos: [s * 1.25, 1.35, z], rot: [0, 0, s * 0.5] });
          b.box(0.16, 1.1, 0.16, c.hide, { pos: [s * 1.7, 0.6, z], rot: [0, 0, s * -0.2] });
        }
      } })),
    ],
    clips: {
      move: { duration: 0.9, pose: (u, o) => { o.legsA = { r: [0, 0.3 * S(u), 0] }; o.legsB = { r: [0, -0.3 * S(u), 0] }; o.body = { p: [0, 0.04 * Math.abs(S(u)), 0] }; o.tail = { r: [0.1 * S(u), 0.15 * S(u, 0.5), 0] }; } },
      idle: { duration: 2.2, pose: (u, o) => { o.tail = { r: [0.12 * S(u), 0, 0] }; } },
      attack: { duration: 0.8, loop: false, pose: (u, o) => { const k = Math.sin(u * P); o.tail = { r: [0.9 * k, 0, 0] }; o.body = { p: [0, 0, 0.2 * k] }; } },
      death: { duration: 1.4, loop: false, pose: deathPose },
    },
  },
};

// ---------------------------------------------------------------------------------------- parts
// Each part adds geometry to anchored rig parts (fn(b) per part name) and may add its own animated part.
const at = (an, dx = 0, dy = 0, dz = 0) => [an.pos[0] + dx, an.pos[1] + dy, an.pos[2] + dz];
export const BOSS_PARTS = {
  // dash: big forward ram horns
  horns: (A, c, a, add) => add(A.head.part, (b) => {
    for (const s of [-1, 1]) {
      b.cone(0.16, 0.9, 5, c.bone, { centered: true, pos: at(A.head, s * 0.42, 0.15, 0.1), rot: [1.1, 0, s * -0.7] });
      b.cone(0.1, 0.45, 4, c.bone, { centered: true, pos: at(A.head, s * 0.75, 0.42, 0.45), rot: [1.6, 0, s * -0.3] });
    }
  }),
  // armor: layered steel plates on shoulders, chest and back
  armor: (A, c, a, add) => add(A.shoulder.part, (b) => {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.box(0.8 - i * 0.12, 0.14, 0.9 - i * 0.1, i % 2 ? c.metal : c.steel, { pos: [s * A.shoulder.pos[0], A.shoulder.pos[1] + 0.25 - i * 0.16, A.shoulder.pos[2]], rot: [0, 0, s * -0.35] });
    b.box(1.1, 0.8, 0.14, c.steel, { pos: at(A.chest, 0, 0, 0.06) });
    for (const x of [-0.4, 0, 0.4]) b.box(0.1, 0.1, 0.06, c.gold, { pos: at(A.chest, x, 0.3, 0.14) });
    b.box(1.2, 0.9, 0.14, c.metal, { pos: at(A.back, 0, 0, -0.05) });
  }),
  // shield: hexagonal plates orbiting the boss on their own ring part
  shieldRing: (A, c, a, add) => add('ring', (b) => {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU;
      b.cyl(0.38, 0.38, 0.08, 6, c.steel, { centered: true, pos: [Math.cos(ang) * 1.9, 1.6, Math.sin(ang) * 1.9], rot: [P / 2, 0, -ang + P / 2] });
      b.box(0.18, 0.18, 0.05, a, { glow: true, pos: [Math.cos(ang) * 1.96, 1.6, Math.sin(ang) * 1.96], rot: [0, -ang + P / 2, P / 4] });
    }
  }),
  // summon: two banner totems with glowing skull lanterns on the back
  totems: (A, c, a, add) => add(A.back.part, (b) => {
    for (const s of [-1, 1]) {
      b.box(0.12, 1.6, 0.12, c.dark, { pos: at(A.back, s * 0.45, 0.5, -0.1), rot: [-0.15, 0, s * 0.12] });
      b.box(0.45, 0.65, 0.05, c.deep, { pos: at(A.back, s * 0.62, 1.0, -0.25), rot: [-0.15, 0, s * 0.12] });
      b.ico(0.16, 0, c.bone, { pos: at(A.back, s * 0.58, 1.4, -0.2) });
      b.ico(0.08, 0, a, { glow: true, pos: at(A.back, s * 0.58, 1.4, -0.06) });
    }
  }),
  // telegraph (tower stun): two-handed stone maul
  hammer: (A, c, a, add) => add(A.handR.part, (b) => {
    b.box(0.12, 1.8, 0.12, c.dark, { pos: at(A.handR, 0, 0.3, 0.1) });
    b.box(0.7, 0.55, 0.55, c.metal, { pos: at(A.handR, 0, 1.25, 0.1) });
    b.box(0.74, 0.12, 0.59, a, { glow: true, pos: at(A.handR, 0, 1.25, 0.1) });
  }),
  // snipe: long aimed lance with a glowing tip
  lance: (A, c, a, add) => add(A.handR.part, (b) => {
    b.cyl(0.05, 0.08, 2.2, 5, c.steel, { centered: true, pos: at(A.handR, 0, 0.1, 0.75), rot: [P / 2, 0, 0] });
    b.cone(0.12, 0.45, 4, a, { centered: true, glow: true, pos: at(A.handR, 0, 0.1, 2.0), rot: [P / 2, 0, 0] });
    b.box(0.35, 0.35, 0.2, c.metal, { pos: at(A.handR, 0, 0.1, 0.0) });
  }),
  // regen / heal pulse: crystal growths on the back and a slow ground ring
  crystals: (A, c, a, add) => {
    add(A.back.part, (b) => { for (const [x, y, r] of [[-0.35, 0.3, 0.3], [0.3, 0.45, -0.25], [0, 0.75, 0.1], [0.55, 0.05, -0.5]]) b.octa(0.28, a, { glow: true, pos: at(A.back, x, y, -0.15), rot: [0.2, 0, r], scale: [0.6, 1.6, 0.6] }); });
    add('aura', (b) => { for (let i = 0; i < 10; i++) { const ang = (i / 10) * TAU; b.box(0.5, 0.05, 0.16, a, { glow: true, pos: [Math.cos(ang) * 2.1, 0.06, Math.sin(ang) * 2.1], rot: [0, -ang, 0] }); } });
  },
  // cloak: tattered cape and hood rim, with drifting wisps
  veil: (A, c, a, add) => add(A.back.part, (b) => {
    for (let i = 0; i < 5; i++) b.box(0.3, 1.9 - (i % 2) * 0.4, 0.05, c.deep, { pos: at(A.back, -0.6 + i * 0.3, -0.7 + (i % 2) * 0.2, -0.1), rot: [0.15, 0, (i - 2) * 0.05] });
    for (const s of [-1, 1]) b.ico(0.07, 0, a, { glow: true, pos: at(A.back, s * 0.7, 0.5, -0.3) });
  }),
  // drain cash: spiked gold crown and a coin sack at the belt
  crown: (A, c, a, add) => {
    add(A.head.part, (b) => { b.cyl(0.36, 0.36, 0.16, 8, c.gold, { centered: true, pos: at(A.head, 0, 0.42, -0.05) }); for (let i = 0; i < 5; i++) { const ang = (i / 5) * TAU; b.cone(0.07, 0.3, 4, c.gold, { centered: true, pos: at(A.head, Math.cos(ang) * 0.3, 0.62, -0.05 + Math.sin(ang) * 0.3) }); } });
    add(A.belt.part, (b) => { b.ico(0.35, 0, '#A0703C', { pos: at(A.belt, 0.75, -0.2, 0.3) }); for (let i = 0; i < 3; i++) b.cyl(0.12, 0.12, 0.04, 8, c.gold, { centered: true, pos: at(A.belt, 0.75, 0.15 + i * 0.05, 0.3) }); });
  },
  // teleport / portals: floating rift shards on their own orbit part
  riftShards: (A, c, a, add) => add('ring', (b) => {
    for (let i = 0; i < 5; i++) { const ang = (i / 5) * TAU + 0.3; b.octa(0.22, a, { glow: true, pos: [Math.cos(ang) * 1.4, 2.6 + (i % 2) * 0.5, Math.sin(ang) * 1.4], scale: [0.5, 1.4, 0.5] }); }
  }),
  // undying: skull pauldrons and a rib cage
  skulls: (A, c, a, add) => add(A.shoulder.part, (b) => {
    for (const s of [-1, 1]) { b.ico(0.3, 0, c.bone, { pos: [s * A.shoulder.pos[0], A.shoulder.pos[1] + 0.2, A.shoulder.pos[2]] }); for (const x of [-0.1, 0.1]) b.box(0.08, 0.08, 0.03, a, { glow: true, pos: [s * A.shoulder.pos[0] + x, A.shoulder.pos[1] + 0.22, A.shoulder.pos[2] + 0.29] }); }
    for (let i = 0; i < 4; i++) b.box(0.95 - i * 0.12, 0.07, 0.07, c.bone, { pos: at(A.chest, 0, 0.3 - i * 0.2, 0.08) });
  }),
  // split on death: pulsing egg sacs on the back
  eggSacs: (A, c, a, add) => add(A.back.part, (b) => {
    for (const [x, y, r] of [[-0.4, 0, 0.32], [0.35, 0.15, 0.36], [0, 0.45, 0.28], [0.1, -0.3, 0.24]]) { b.ico(r, 1, c.hide, { pos: at(A.back, x, y, -0.2) }); b.ico(r * 0.45, 0, a, { glow: true, pos: at(A.back, x, y, -0.2 + r * 0.7) }); }
  }),
  // immune: warding halo behind the head
  ward: (A, c, a, add) => add(A.head.part, (b) => {
    b.torus(0.6, 0.05, 4, 12, a, { glow: true, pos: at(A.head, 0, 0.3, -0.45) });
    for (let i = 0; i < 4; i++) { const ang = (i / 4) * TAU; b.box(0.14, 0.14, 0.05, c.steel, { pos: at(A.head, Math.cos(ang) * 0.6, 0.3 + Math.sin(ang) * 0.6, -0.45), rot: [0, 0, ang + P / 4] }); }
  }),
  // speed: swept-back blade wings on their own flapping part
  wings: (A, c, a, add) => add('wings', (b) => {
    for (const s of [-1, 1]) {
      b.box(1.6, 0.08, 0.5, c.dark, { pos: at(A.back, s * 0.95, 0.35, -0.2), rot: [0, s * 0.45, s * 0.35] });
      b.box(1.2, 0.06, 0.35, c.hide, { pos: at(A.back, s * 0.8, 0.05, -0.35), rot: [0, s * 0.55, s * 0.2] });
      b.box(1.4, 0.04, 0.06, a, { glow: true, pos: at(A.back, s * 0.95, 0.4, 0.04), rot: [0, s * 0.45, s * 0.35] });
    }
  }),
};

/** Which part a mechanic shows (tools/gen-bosses.mjs uses this to build each boss kit). */
export const MECHANIC_PART = {
  dash: 'horns', armor: 'armor', shield: 'shieldRing', summon: 'totems', telegraph: 'hammer', snipe: 'lance', regen: 'crystals',
  healPulse: 'crystals', cloak: 'veil', drainCash: 'crown', teleport: 'riftShards', portal: 'riftShards', undying: 'skulls',
  splitOnDeath: 'eggSacs', immune: 'ward', speed: 'wings',
};
/** Which body a lead mechanic gets. */
export const MECHANIC_BODY = {
  dash: 'strider', speed: 'strider', cloak: 'wraith', teleport: 'wraith', portal: 'wraith', armor: 'colossus', shield: 'colossus',
  immune: 'colossus', telegraph: 'colossus', summon: 'crawler', splitOnDeath: 'crawler', regen: 'crawler', healPulse: 'crawler',
  snipe: 'brute', drainCash: 'brute', undying: 'brute',
};

// animation of the extra parts (shared by every clip; integer cycles so loops stay seamless)
const EXTRA = {
  ring: { pivot: [0, 1.6, 0], pose: (u, o) => { o.ring = { r: [0, u * TAU, 0] }; } },
  aura: { pivot: [0, 0, 0], pose: (u, o) => { o.aura = { r: [0, -u * TAU, 0], s: 1 + 0.06 * S(u, 2) }; } },
  wings: { pivot: null, pose: (u, o) => { o.wings = { r: [0.12 * S(u, 2), 0, 0] }; } },
};

/**
 * Build a rig definition (ENEMY_RIGS format) from a kit `{ body, parts: [...], accent }`.
 * Throws on unknown bodies or parts so bad data fails tests, not players.
 */
export function buildBossRig(kit) {
  const body = BOSS_BODIES[kit.body];
  if (!body) throw new Error(`Unknown boss body "${kit.body}"`);
  const accent = ACCENTS[kit.accent] || ACCENTS.crimson;
  const c = BASE;
  const extra = {};
  const add = (name, fn) => { (extra[name] ||= []).push(fn); };
  const used = [...new Set(kit.parts || [])];
  let handFull = false;
  for (const p of used) {
    if (!BOSS_PARTS[p]) throw new Error(`Unknown boss part "${p}"`);
    // a second hand weapon goes to the left hand
    const weapon = p === 'hammer' || p === 'lance';
    BOSS_PARTS[p](weapon && handFull ? { ...body.anchors, handR: body.anchors.handL } : body.anchors, c, accent, add);
    if (weapon) handFull = true;
  }
  const parts = body.parts(c, accent).map((pd) => {
    const more = extra[pd.name];
    return more ? { ...pd, build: (b) => { pd.build(b); for (const f of more) f(b); } } : pd;
  });
  const own = new Set(parts.map((pd) => pd.name));
  const extraNames = Object.keys(extra).filter((n) => !own.has(n));
  for (const n of extraNames) {
    if (!EXTRA[n]) throw new Error(`Boss part targets unknown rig part "${n}"`);
    parts.push({ name: n, pivot: EXTRA[n].pivot || body.anchors.back.pos, build: (b) => { for (const f of extra[n]) f(b); } });
  }
  const clips = {};
  for (const [name, clip] of Object.entries(body.clips)) {
    clips[name] = name === 'death' || !extraNames.length ? clip : { ...clip, pose: (u, o) => { clip.pose(u, o); for (const n of extraNames) EXTRA[n].pose(u, o); } };
  }
  return { height: body.height, parts, clips, kit: { body: kit.body, parts: used, accent: kit.accent || 'crimson' } };
}
