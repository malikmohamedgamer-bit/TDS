// Walking character physics (hero / commander). Pure and deterministic for a given input stream.
import { clamp, wrapAngle } from './math.js';

export const CHARACTER_DEFAULTS = Object.freeze({
  radius: 0.45,
  height: 1.8,
  walkSpeed: 7,
  sprintSpeed: 11.5,
  groundAccel: 70,
  airAccel: 20,
  jumpVelocity: 9.2,
  gravity: 28,
  maxFall: 40,
  stepUp: 0.55,
  snapDown: 0.35,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  turnRate: 14,
  fallLimit: 6, // metres below the terrain before the safety net teleports back
});

export class Character {
  constructor(world, spawn = { x: 0, z: 0, yaw: 0 }, params = {}) {
    this.world = world;
    this.p = { ...CHARACTER_DEFAULTS, ...params };
    this.spawn = { ...spawn };
    this.reset(spawn);
  }

  reset(spawn = this.spawn) {
    const g = this.world.groundHeight(spawn.x, spawn.z, this.p.radius);
    this.x = spawn.x;
    this.z = spawn.z;
    this.y = g;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = spawn.yaw ?? 0; // facing, radians, 0 = +Z
    this.grounded = true;
    this.coyote = 0;
    this.jumpQueued = 0;
    this.sprinting = false;
    this.moving = false;
    this.jumps = 0;
    this.rescues = 0;
    this.rescueLog = [];
    this.safe = { x: this.x, y: this.y, z: this.z };
  }

  /**
   * @param {number} dt
   * @param {object} input {mx, mz} world-space wish direction (length <= 1), jump (bool, edge),
   *   sprint (bool), faceYaw (optional: lock facing, e.g. first person)
   */
  step(dt, input) {
    const p = this.p;
    const w = this.world;
    let mx = input.mx || 0;
    let mz = input.mz || 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    this.sprinting = !!input.sprint && len > 0.1;
    const speed = this.sprinting ? p.sprintSpeed : p.walkSpeed;

    // horizontal acceleration towards target velocity
    const tvx = mx * speed;
    const tvz = mz * speed;
    const accel = (this.grounded ? p.groundAccel : p.airAccel) * dt;
    const dvx = tvx - this.vx;
    const dvz = tvz - this.vz;
    const dl = Math.hypot(dvx, dvz);
    if (dl <= accel || dl === 0) { this.vx = tvx; this.vz = tvz; }
    else { this.vx += (dvx / dl) * accel; this.vz += (dvz / dl) * accel; }

    // jumping with coyote time and input buffering
    if (input.jump) this.jumpQueued = p.jumpBuffer;
    else this.jumpQueued = Math.max(0, this.jumpQueued - dt);
    this.coyote = this.grounded ? p.coyoteTime : Math.max(0, this.coyote - dt);
    if (this.jumpQueued > 0 && this.coyote > 0) {
      this.vy = p.jumpVelocity;
      this.grounded = false;
      this.coyote = 0;
      this.jumpQueued = 0;
      this.jumps++;
    }

    this.vy = Math.max(this.vy - p.gravity * dt, -p.maxFall);

    // sub-step so fast motion never tunnels through thin colliders
    const travel = Math.hypot(this.vx, this.vz) * dt + Math.abs(this.vy) * dt;
    const n = clamp(Math.ceil(travel / (p.radius * 0.5)), 1, 12);
    const h = dt / n;
    const wasGrounded = this.grounded;
    let grounded = false;
    const startX = this.x;
    const startZ = this.z;
    for (let i = 0; i < n; i++) {
      let nx = this.x + this.vx * h;
      let nz = this.z + this.vz * h;
      const r = w.resolve(nx, nz, p.radius, this.y, p.height, p.stepUp);
      nx = r.x;
      nz = r.z;
      this.x = nx;
      this.z = nz;

      const feet0 = this.y; // classify step/wall with the same feet height resolve() used
      this.y += this.vy * h;
      const g = w.groundHeight(this.x, this.z, p.radius, Math.max(feet0, this.y), p.stepUp);
      if (this.y <= g) {
        this.y = g;
        if (this.vy < 0) this.vy = 0;
        grounded = true;
      } else if (wasGrounded && this.vy <= 0 && this.y - g <= p.snapDown) {
        this.y = g; // stick to slopes and step-downs instead of hopping
        this.vy = 0;
        grounded = true;
      }
    }
    this.grounded = grounded;
    // keep only the velocity that actually happened: sliding along walls keeps the tangential part,
    // pushing straight into a wall stops (no moonwalking animation, no stored momentum)
    if (dt > 0) {
      const ax = (this.x - startX) / dt;
      const az = (this.z - startZ) / dt;
      if (Math.hypot(ax, az) < Math.hypot(this.vx, this.vz)) { this.vx = ax; this.vz = az; }
    }

    // facing
    const moveLen = Math.hypot(this.vx, this.vz);
    this.moving = moveLen > 0.3;
    if (input.faceYaw !== undefined && input.faceYaw !== null) {
      this.yaw = input.faceYaw;
    } else if (len > 0.1) {
      const target = Math.atan2(mx, mz);
      const d = wrapAngle(target - this.yaw);
      this.yaw = wrapAngle(this.yaw + d * clamp(p.turnRate * dt, 0, 1));
    }

    this._safety();
  }

  _safety() {
    const w = this.world;
    const p = this.p;
    const bad = !Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this.z);
    const terrainY = bad ? 0 : w.terrain.height(this.x, this.z);
    if (bad || this.y < terrainY - p.fallLimit) {
      this._rescue(this.safe, bad ? 'invalid position' : 'fell below terrain');
      return;
    }
    // still inside a wall (e.g. a tower was placed on top of us): move to nearest free spot
    if (w.overlapsWall(this.x, this.z, p.radius * 0.9, this.y, p.height, p.stepUp)) {
      const spot = w.findFreeSpot(this.x, this.z, p.radius, p.height);
      if (spot) this._rescue(spot, 'inside a solid');
      return;
    }
    if (this.grounded) this.safe = { x: this.x, y: this.y, z: this.z };
  }

  _rescue(spot, why = 'rescue') {
    if (this.rescueLog.length < 10) this.rescueLog.push({ why, x: +this.x.toFixed(2), y: +this.y.toFixed(2), z: +this.z.toFixed(2) });
    this.x = spot.x;
    this.z = spot.z;
    this.y = this.world.groundHeight(spot.x, spot.z, this.p.radius);
    this.vx = this.vy = this.vz = 0;
    this.grounded = true;
    this.rescues++;
  }

  snapshot() {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, grounded: this.grounded, moving: this.moving, sprinting: this.sprinting, vy: this.vy };
  }
}
