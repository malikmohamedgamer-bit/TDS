// Soak test: a bot walks, sprints and jumps around a map for a long simulated time and checks
// the character never leaves the map, sinks into terrain, overlaps a solid, or gets stuck.
// Pure: runs in Node (npm run soak) and in unit tests (short version).
import { Character } from './character.js';
import { Rng } from './rng.js';

function canEscape(world, ch) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const t = new Character(world, { x: ch.x, z: ch.z, yaw: 0 }, ch.p);
    t.y = ch.y; t.grounded = ch.grounded;
    for (let i = 0; i < 60; i++) t.step(1 / 60, { mx: Math.cos(a), mz: Math.sin(a), jump: i === 0 });
    if (Math.hypot(t.x - ch.x, t.z - ch.z) > 0.5) return true;
  }
  return false;
}

export function soakMap(mapWorld, { seconds = 600, seed = 'soak', dt = 1 / 60 } = {}) {
  const { world, terrain, map } = mapWorld;
  const rng = new Rng(`${map.id}:${seed}`);
  const ch = new Character(world, map.playerSpawn);
  const b = world.bounds;
  const report = { map: map.id, seconds, steps: 0, targetsReached: 0, retargets: 0, jumps: 0, failures: [], rescues: 0, distance: 0 };
  let target = null;
  let sinceProgress = 0;
  let lastX = ch.x;
  let lastZ = ch.z;
  let bestD = Infinity;
  const fail = (why) => {
    if (report.failures.length < 20) report.failures.push({ t: +(report.steps * dt).toFixed(2), x: +ch.x.toFixed(2), y: +ch.y.toFixed(2), z: +ch.z.toFixed(2), why });
  };
  const total = Math.round(seconds / dt);
  for (let i = 0; i < total; i++) {
    if (!target || sinceProgress > 4) {
      if (target) report.retargets++;
      target = { x: rng.range(b.minX, b.maxX), z: rng.range(b.minZ, b.maxZ) };
      sinceProgress = 0;
      bestD = Infinity;
    }
    const dx = target.x - ch.x;
    const dz = target.z - ch.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) { report.targetsReached++; target = null; continue; }
    if (d < bestD - 0.25) { bestD = d; sinceProgress = 0; } else sinceProgress += dt;
    // wobble the heading a little and jump now and then (and when blocked)
    const wob = Math.sin(i * 0.013) * 0.35;
    const ang = Math.atan2(dz, dx) + wob;
    const jump = rng.chance(0.004) || (sinceProgress > 1 && rng.chance(0.05));
    ch.step(dt, { mx: Math.cos(ang), mz: Math.sin(ang), sprint: rng.chance(0.5), jump });
    report.steps++;
    report.distance += Math.hypot(ch.x - lastX, ch.z - lastZ);
    lastX = ch.x;
    lastZ = ch.z;

    if (!(ch.x >= b.minX - 1e-6 && ch.x <= b.maxX + 1e-6 && ch.z >= b.minZ - 1e-6 && ch.z <= b.maxZ + 1e-6)) fail('outside bounds');
    if (ch.y < terrain.height(ch.x, ch.z) - 0.05) fail('below terrain');
    if (world.overlapsWall(ch.x, ch.z, ch.p.radius * 0.9, ch.y, ch.p.height, ch.p.stepUp)) fail('inside a solid');
    if (sinceProgress > 3.9 && !canEscape(world, ch)) fail('stuck: cannot move in any direction');
  }
  report.jumps = ch.jumps;
  report.rescues = ch.rescues;
  report.rescueLog = ch.rescueLog;
  report.distance = Math.round(report.distance);
  return report;
}
