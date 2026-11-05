// Procedural hero ("Commander"): chibi proportions, separate pivoting parts for code-driven
// idle / walk / sprint / jump animation. Replaced by a rigged GLB when one is provided.
import * as THREE from 'three';
import { ModelBuilder } from './geo.js';
import { sharedMaterials } from './mapView.js';
import { damp } from '../core/math.js';

const COL = {
  coat: '#2A2766', coatTrim: '#FFD166', vest: '#5B6B3A', pants: '#4A5530', boot: '#2B2420',
  skin: '#F1C7A0', hair: '#3B2A20', glove: '#3D4451', cape: '#7B4DFF', capeIn: '#1E1B4B',
  blade: '#C9A7FF', hilt: '#FFD166', eye: '#1A1A22',
};

function partMesh(build) {
  const b = new ModelBuilder();
  build(b);
  const geo = b.build();
  const mats = sharedMaterials();
  const g = new THREE.Group();
  if (geo.body) {
    const m = new THREE.Mesh(geo.body, mats.body);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  if (geo.glow) g.add(new THREE.Mesh(geo.glow, mats.glow));
  return g;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class HeroView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'hero';
    this.body = new THREE.Group();
    this.root.add(this.body);

    // legs (pivot at hip)
    this.legs = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.16, 0.82, 0);
      pivot.add(partMesh((b) => {
        b.box(0.24, 0.62, 0.26, COL.pants, { pos: [0, -0.33, 0] });
        b.box(0.28, 0.24, 0.4, COL.boot, { pos: [0, -0.7, 0.05] });
        b.box(0.3, 0.06, 0.42, '#1A1612', { pos: [0, -0.8, 0.05] });
      }));
      this.body.add(pivot);
      return pivot;
    });

    // torso
    this.torso = partMesh((b) => {
      b.box(0.6, 0.18, 0.36, COL.pants, { pos: [0, 0.86, 0] });
      b.box(0.62, 0.6, 0.38, COL.coat, { pos: [0, 1.2, 0] });
      b.box(0.36, 0.5, 0.06, COL.vest, { pos: [0, 1.2, 0.2] });
      b.box(0.64, 0.08, 0.4, '#3B2A20', { pos: [0, 0.96, 0] });
      b.box(0.12, 0.1, 0.05, COL.coatTrim, { pos: [0, 0.96, 0.21] });
      b.box(0.04, 0.5, 0.04, COL.coatTrim, { pos: [-0.2, 1.2, 0.2] });
      b.box(0.04, 0.5, 0.04, COL.coatTrim, { pos: [0.2, 1.2, 0.2] });
      for (const s of [-1, 1]) b.box(0.22, 0.1, 0.4, COL.coatTrim, { pos: [s * 0.33, 1.5, 0], rot: [0, 0, -s * 0.2] });
      b.octa(0.07, COL.blade, { glow: true, pos: [-0.17, 1.35, 0.235] });
    });
    this.body.add(this.torso);

    // head
    this.head = new THREE.Group();
    this.head.position.set(0, 1.52, 0);
    this.head.add(partMesh((b) => {
      b.box(0.5, 0.46, 0.46, COL.skin, { pos: [0, 0.24, 0] });
      b.box(0.08, 0.1, 0.03, COL.eye, { pos: [-0.11, 0.25, 0.235] });
      b.box(0.08, 0.1, 0.03, COL.eye, { pos: [0.11, 0.25, 0.235] });
      b.box(0.52, 0.16, 0.48, COL.hair, { pos: [0, 0.45, -0.01] });
      b.box(0.52, 0.32, 0.12, COL.hair, { pos: [0, 0.32, -0.2] });
      // officer cap with glowing badge
      b.cyl(0.29, 0.27, 0.16, 8, COL.coat, { pos: [0, 0.5, 0] });
      b.cyl(0.33, 0.33, 0.04, 8, '#1A1840', { pos: [0, 0.5, 0.04] });
      b.box(0.3, 0.03, 0.14, '#1A1840', { pos: [0, 0.51, 0.27] });
      b.octa(0.06, COL.coatTrim, { glow: true, intensity: 2, pos: [0, 0.6, 0.27] });
    }));
    this.body.add(this.head);

    // arms (pivot at shoulder)
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 1.44, 0);
      pivot.add(partMesh((b) => {
        b.box(0.19, 0.5, 0.21, COL.coat, { pos: [0, -0.22, 0] });
        b.box(0.21, 0.08, 0.23, COL.coatTrim, { pos: [0, -0.43, 0] });
        b.box(0.18, 0.16, 0.2, COL.glove, { pos: [0, -0.54, 0] });
        if (side === 1) {
          // spellblade saber held in the right hand
          b.box(0.07, 0.24, 0.07, COL.hilt, { pos: [0, -0.62, 0.06], rot: [0.5, 0, 0] });
          b.box(0.26, 0.05, 0.07, COL.hilt, { pos: [0, -0.72, 0.14], rot: [0.5, 0, 0] });
          b.box(0.07, 0.9, 0.035, COL.blade, { glow: true, intensity: 1.8, pos: [0, -1.06, 0.36], rot: [0.5, 0, 0] });
          b.box(0.035, 0.9, 0.04, '#E9DDFF', { pos: [0, -1.06, 0.34], rot: [0.5, 0, 0] });
        }
      }));
      this.body.add(pivot);
      return pivot;
    });

    // cape (pivot at the shoulders)
    this.cape = new THREE.Group();
    this.cape.position.set(0, 1.5, -0.2);
    this.cape.add(partMesh((b) => {
      b.box(0.6, 0.95, 0.04, COL.cape, { pos: [0, -0.47, -0.02] });
      b.box(0.56, 0.9, 0.02, COL.capeIn, { pos: [0, -0.46, 0.01] });
      b.box(0.62, 0.06, 0.06, COL.coatTrim, { pos: [0, -0.94, -0.02] });
    }));
    this.body.add(this.cape);

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    );
    this.blob.renderOrder = 2;
    scene.add(this.root, this.blob);

    this.phase = 0;
    this.speed = 0;
    this.air = 0;
    this.t = 0;
  }

  setVisible(v) {
    this.body.visible = v;
  }

  /** state: {x,y,z,yaw,grounded,vy,hSpeed,sprinting}, groundY: height under the hero. */
  update(dt, state, groundY, reducedMotion) {
    this.t += dt;
    this.root.position.set(state.x, state.y, state.z);
    this.root.rotation.y = state.yaw;
    this.speed += (state.hSpeed - this.speed) * damp(12, dt);
    this.air += ((state.grounded ? 0 : 1) - this.air) * damp(14, dt);
    const s = Math.min(this.speed / 11.5, 1);
    this.phase += dt * (4 + this.speed * 1.15);
    const swing = Math.sin(this.phase) * (0.15 + 0.75 * s) * (1 - this.air);
    const motion = reducedMotion ? 0.5 : 1;

    this.legs[0].rotation.x = swing - this.air * 0.6;
    this.legs[1].rotation.x = -swing + this.air * 0.25;
    this.arms[0].rotation.x = -swing * 0.9 - this.air * 1.2;
    this.arms[1].rotation.x = swing * 0.6 - this.air * 0.6 - 0.25;
    this.arms[0].rotation.z = -0.08 - this.air * 0.4;
    this.arms[1].rotation.z = 0.08 + this.air * 0.4;
    const bob = Math.abs(Math.sin(this.phase)) * 0.07 * s * motion;
    const breathe = Math.sin(this.t * 2.2) * 0.012 * (1 - s) * motion;
    this.body.position.y = bob + breathe;
    this.torso.rotation.x = s * 0.12 * (state.sprinting ? 1.6 : 1);
    this.head.rotation.x = -s * 0.06;
    this.cape.rotation.x = -(0.08 + s * 0.65 + this.air * 0.5) + Math.sin(this.t * 3 + this.phase * 0.5) * 0.05 * motion;

    const gy = groundY ?? state.y;
    this.blob.position.set(state.x, gy + 0.03, state.z);
    const h = Math.max(0, state.y - gy);
    const k = Math.max(0.35, 1 - h * 0.18);
    this.blob.scale.setScalar(k);
    this.blob.material.opacity = k;
  }
}
