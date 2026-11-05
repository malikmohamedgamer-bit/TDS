// Camera modes: orbit (third person), first person, free fly, top-down overview.
// Pure-ish: works on a THREE camera but all decisions are plain maths so it is easy to reason about.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';

export const CAMERA_MODES = ['orbit', 'first', 'free', 'top'];
export const CAMERA_LABELS = { orbit: 'Third person', first: 'First person', free: 'Free camera', top: 'Overview' };

export class CameraRig {
  constructor(camera, mapWorld, settings) {
    this.cam = camera;
    this.mw = mapWorld;
    this.settings = settings;
    this.mode = 'orbit';
    this.yaw = Math.PI; // camera looks along -Z initially (behind a hero facing +Z)
    this.pitch = 0.42;
    this.distance = 11;
    this.minDist = 2.5;
    this.maxDist = 30;
    this.pos = new THREE.Vector3(0, 10, 10);
    this.look = new THREE.Vector3();
    this.free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0.3, speed: 18 };
    this.top = { x: 0, z: 0, height: 92, pitch: 1.18, yaw: 0 };
    this._target = new THREE.Vector3();
    this._snap = true;
    this.fov = 60;
  }

  setMode(mode, hero) {
    if (!CAMERA_MODES.includes(mode) || mode === this.mode) return;
    if (mode === 'free') {
      this.free.pos.copy(this.pos);
      this.free.yaw = this.yaw;
      this.free.pitch = this.pitch;
    }
    if (mode === 'top') {
      // whole map, spawn (west) on the left and the base (east) on the right
      this.top.x = 0;
      this.top.z = 4;
      this.top.yaw = 0;
    }
    if (mode === 'first' && hero) {
      this.pitch = 0.05;
    }
    if (this.mode === 'first' && mode === 'orbit') this.pitch = 0.42;
    this.mode = mode;
    this._snap = mode === 'first';
  }

  /** Yaw/pitch deltas in radians from mouse / touch look. */
  rotate(dYaw, dPitch) {
    const inv = this.settings.invertY ? -1 : 1;
    if (this.mode === 'free') {
      this.free.yaw -= dYaw;
      this.free.pitch = clamp(this.free.pitch + dPitch * inv, -1.45, 1.45);
    } else if (this.mode === 'top') {
      this.top.yaw -= dYaw;
      this.top.pitch = clamp(this.top.pitch + dPitch * inv, 0.6, 1.5);
    } else {
      this.yaw -= dYaw;
      const lo = this.mode === 'first' ? -1.45 : -0.45;
      const hi = this.mode === 'first' ? 1.45 : 1.35;
      this.pitch = clamp(this.pitch + dPitch * inv, lo, hi);
    }
  }

  zoom(delta) {
    if (this.mode === 'orbit') this.distance = clamp(this.distance * Math.exp(delta * 0.0012), this.minDist, this.maxDist);
    else if (this.mode === 'top') this.top.height = clamp(this.top.height * Math.exp(delta * 0.0012), 25, 140);
    else if (this.mode === 'free') this.free.speed = clamp(this.free.speed * Math.exp(-delta * 0.0015), 3, 80);
  }

  /** Horizontal forward/right unit vectors of the current view (for movement input). */
  basis() {
    const yaw = this.mode === 'free' ? this.free.yaw : this.mode === 'top' ? this.top.yaw : this.yaw;
    // camera looks towards -forward of its offset; forward = direction the view faces on the ground
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    return { fx, fz, rx: -fz, rz: fx, yaw };
  }

  /** Heading the hero should face in first person (radians, 0 = +Z). */
  faceYaw() {
    return this.yaw + Math.PI;
  }

  /** move: {x, y, up} local input for free / top modes. */
  update(dt, hero, move, sprint) {
    const terrain = this.mw.terrain;
    const world = this.mw.world;
    const b = this.mw.map.size;
    let desired;
    let lookAt;
    if (this.mode === 'orbit' || this.mode === 'first') {
      const eye = this.mode === 'first' ? 1.55 : 1.7;
      this._target.set(hero.x, hero.y + eye, hero.z);
      if (this.mode === 'first') {
        desired = this._target.clone();
        const cp = Math.cos(this.pitch);
        lookAt = desired.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp));
      } else {
        const cp = Math.cos(this.pitch);
        const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
        // pull the camera in if terrain or a tall prop is between it and the hero
        let dist = this.distance;
        const steps = 14;
        for (let i = 1; i <= steps; i++) {
          const d = (this.distance * i) / steps;
          const px = this._target.x + off.x * d;
          const py = this._target.y + off.y * d;
          const pz = this._target.z + off.z * d;
          const ground = Math.max(terrain.height(px, pz), world.groundHeight(px, pz, 0.3)) + 0.45;
          if (py < ground) { dist = Math.max(this.minDist * 0.6, d - this.distance / steps); break; }
        }
        desired = this._target.clone().addScaledVector(off, dist);
        lookAt = this._target;
      }
    } else if (this.mode === 'free') {
      const f = this.free;
      const cp = Math.cos(f.pitch);
      const fwd = new THREE.Vector3(-Math.sin(f.yaw) * cp, -Math.sin(f.pitch), -Math.cos(f.yaw) * cp);
      const right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
      const sp = f.speed * (sprint ? 3 : 1) * dt;
      f.pos.addScaledVector(fwd, move.y * sp).addScaledVector(right, move.x * sp);
      f.pos.y += (move.up || 0) * sp;
      const lim = 1.6;
      f.pos.x = clamp(f.pos.x, (-b.w / 2) * lim, (b.w / 2) * lim);
      f.pos.z = clamp(f.pos.z, (-b.d / 2) * lim, (b.d / 2) * lim);
      f.pos.y = clamp(f.pos.y, terrain.height(f.pos.x, f.pos.z) + 0.6, 160);
      desired = f.pos.clone();
      lookAt = desired.clone().add(fwd);
    } else {
      const t = this.top;
      const sp = (t.height * 0.9) * (sprint ? 2 : 1) * dt;
      const fx = -Math.sin(t.yaw);
      const fz = -Math.cos(t.yaw);
      t.x = clamp(t.x + (fx * move.y + -fz * move.x) * sp, -b.w / 2, b.w / 2);
      t.z = clamp(t.z + (fz * move.y + fx * move.x) * sp, -b.d / 2, b.d / 2);
      const cp = Math.cos(t.pitch);
      const off = new THREE.Vector3(Math.sin(t.yaw) * cp, Math.sin(t.pitch), Math.cos(t.yaw) * cp).multiplyScalar(t.height);
      lookAt = new THREE.Vector3(t.x, 0, t.z);
      desired = lookAt.clone().add(off);
    }

    const k = this._snap ? 1 : damp(this.mode === 'first' ? 40 : 16, dt);
    this.pos.lerp(desired, k);
    this.look.lerp(lookAt, this._snap ? 1 : damp(20, dt));
    this._snap = this.mode === 'first';
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    const fov = this.mode === 'first' ? 72 : this.mode === 'top' ? 50 : 60 + (sprint && this.mode === 'orbit' && !this.settings.reducedMotion ? 4 : 0);
    this.fov = lerp(this.fov, fov, damp(8, dt));
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }

  snap() {
    this._snap = true;
  }
}
