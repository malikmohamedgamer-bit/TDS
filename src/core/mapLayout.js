// Deterministic map layout: explicit props + seeded scatter rules -> placed instances, and the
// collision world built from them. Pure; the renderer and the simulation share the same result.
import { Rng } from './rng.js';
import { createTerrain } from './terrain.js';
import { CollisionWorld } from './collision.js';

/** Footprint radius used for spacing checks. */
export function propRadius(def, scale = 1) {
  if (def.colliders) {
    let r = 0;
    for (const c of def.colliders) r = Math.max(r, Math.hypot(c.x ?? 0, c.z ?? 0) + (c.r ?? Math.hypot(c.hw, c.hd)));
    return r * scale;
  }
  const c = def.collider;
  return (c.shape === 'circle' ? c.r : Math.hypot(c.hw, c.hd)) * scale;
}

export function buildLayout(map, props, terrain) {
  const rng = new Rng(`${map.seed}:scatter`);
  const placed = [];
  const W = map.size.w;
  const D = map.size.d;
  const spawn = map.playerSpawn;

  for (const p of map.props || []) {
    const def = props.get(p.kind);
    if (!def) throw new Error(`Map ${map.id}: unknown prop kind "${p.kind}"`);
    placed.push({ kind: p.kind, x: p.x, z: p.z, rot: p.rot ?? 0, scale: p.scale ?? 1, r: propRadius(def, p.scale ?? 1) });
  }

  for (const rule of map.scatter || []) {
    const def = props.get(rule.kind);
    if (!def) throw new Error(`Map ${map.id}: unknown scatter kind "${rule.kind}"`);
    const [x0, z0, x1, z1] = rule.area;
    let made = 0;
    for (let attempt = 0; attempt < rule.count * 40 && made < rule.count; attempt++) {
      const x = rng.range(x0, x1);
      const z = rng.range(z0, z1);
      const scale = rule.scale ? rng.range(rule.scale[0], rule.scale[1]) : 1;
      const rot = rng.range(0, Math.PI * 2);
      const r = propRadius(def, scale);
      const edge = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
      if (edge < 1.5) continue;
      if (rule.edgeBand && edge > rule.edgeBand) continue;
      const pi = terrain.pathInfo(x, z);
      if (pi.d < (rule.minPathDist ?? 4) + r) continue;
      if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < 5 + r) continue;
      const spacing = rule.spacing ?? 2;
      let ok = true;
      for (const q of placed) {
        const min = Math.max(spacing, r + q.r);
        if ((q.x - x) ** 2 + (q.z - z) ** 2 < min * min) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ kind: rule.kind, x, z, rot, scale, r });
      made++;
    }
  }
  return placed;
}

/** Adds colliders for every placed prop. Returns the CollisionWorld. */
export function buildCollisionWorld(map, props, terrain, layout) {
  const margin = 1.2;
  const world = new CollisionWorld({
    terrain,
    bounds: {
      minX: -map.size.w / 2 + margin,
      maxX: map.size.w / 2 - margin,
      minZ: -map.size.d / 2 + margin,
      maxZ: map.size.d / 2 - margin,
    },
  });
  for (const inst of layout) {
    const def = props.get(inst.kind);
    const shapes = def.colliders || [{ ...def.collider, x: 0, z: 0 }];
    const cos = Math.cos(inst.rot);
    const sin = Math.sin(inst.rot);
    for (const s of shapes) {
      const lx = (s.x ?? 0) * inst.scale;
      const lz = (s.z ?? 0) * inst.scale;
      // rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos (matches Three.js)
      const wx = inst.x + lx * cos + lz * sin;
      const wz = inst.z - lx * sin + lz * cos;
      const ground = terrain.height(wx, wz);
      // bottom = lowest terrain under the footprint, so nothing can be walked under on slopes
      const ext = s.shape === 'circle' ? (s.r ?? 0) * inst.scale : Math.hypot(s.hw ?? 0, s.hd ?? 0) * inst.scale;
      let low = ground;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        low = Math.min(low, terrain.height(wx + Math.cos(a) * ext, wz + Math.sin(a) * ext));
      }
      world.add({
        y0: low - 0.5,
        shape: s.shape,
        x: wx,
        z: wz,
        r: (s.r ?? 0) * inst.scale,
        hw: (s.hw ?? 0) * inst.scale,
        hd: (s.hd ?? 0) * inst.scale,
        rot: inst.rot,
        top: ground + (s.h ?? def.h) * inst.scale,
        solid: def.solid ?? true,
        blocksPlacement: def.blocksPlacement ?? true,
        tag: def.landmark ? 'landmark' : 'prop',
        ref: inst,
      });
    }
  }
  return world;
}

/** Everything the game needs to stand on a map. */
export function buildMapWorld(map, props) {
  const terrain = createTerrain(map);
  const layout = buildLayout(map, props, terrain);
  const world = buildCollisionWorld(map, props, terrain, layout);
  return { map, terrain, layout, world };
}
