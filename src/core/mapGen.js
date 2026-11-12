// Seeded map generator (pure: no DOM, no Three). Same seed + options = the same map and wave table.
// Roads follow the existing maps' grammar: 5 m wide axis-aligned serpentines from portals at the
// west edge (x -57) to the keep at the east (x 50.5) on a 110 x 80 frame. Templates:
//   serpentine: 1 road winding through the whole valley
//   fork:       2 portals (north / south halves), each road winds in its half and merges into one trunk
//   trident:    3 portals; the straight middle road is the trunk, north and south roads wind and merge into it
//   diamond:    1 portal; the road splits into a north and a south lane that wind apart and rejoin
//               near the keep (2 paths sharing the first and the last stretch: groups alternate lanes)
//   crossover:  1 road that winds along the north, runs down the east side past the keep row, back
//               west along the south, then up and east to the keep, crossing its own east column once
//               (towers at the crossing reach enemies twice)
// Every road includes every merge point on the shared trunk, so shared stretches are identical
// segments (the sim treats each road separately; the bot counts shared road twice, as it should).
import { Rng } from './rng.js';

export const FRAME = Object.freeze({ w: 110, d: 80, xIn: -57, xPortal: -51.5, xKeep: 50.5, xEnd: 45, zMax: 30, minSep: 11 });

const r05 = (v) => Math.round(v * 2) / 2;

/** Band of z values each road may wind in, per template and road count. */
const BANDS = {
  serpentine: [[-30, 30]],
  fork: [[12, 30], [-30, -12]],
  trident: [[17, 30], [-5, 5], [-30, -17]],
};

/** One serpentine: columns 13-18 m apart, alternating to the top / bottom of the band. */
function serpentine(rng, { zStart, band: [lo, hi], xTo }) {
  const pts = [[FRAME.xIn, zStart]];
  let x = r05(rng.range(-42, -36));
  let z = zStart;
  let up = z < (lo + hi) / 2;
  const span = hi - lo;
  while (x < xTo - 13) {
    pts.push([x, z]);
    // next level: the far side of the band, with some variety; at least 10 m of travel when the band allows
    let nz = up ? rng.range(hi - Math.min(5, span * 0.25), hi) : rng.range(lo, lo + Math.min(5, span * 0.25));
    // consecutive runs must leave room for towers between them: travel at least minSep
    if (Math.abs(nz - z) < FRAME.minSep) nz = Math.abs(hi - z) > Math.abs(lo - z) ? hi : lo;
    z = r05(nz);
    pts.push([x, z]);
    up = !up;
    x = r05(x + rng.range(13, 18));
  }
  return { pts, zLast: z };
}

/** Winding run from (x0, z0): columns 13-18 m apart, alternating far / near side of the band. */
function wind(rng, { x0, z0, band: [lo, hi], xTo, upFirst }) {
  const pts = [[x0, z0]];
  let x = x0;
  let z = z0;
  let up = upFirst;
  const span = hi - lo;
  while (x < xTo - 13) {
    pts.push([x, z]);
    let nz = up ? rng.range(hi - Math.min(5, span * 0.25), hi) : rng.range(lo, lo + Math.min(5, span * 0.25));
    if (Math.abs(nz - z) < FRAME.minSep) nz = Math.abs(hi - z) > Math.abs(lo - z) ? hi : lo;
    z = r05(nz);
    pts.push([x, z]);
    up = !up;
    x = r05(x + rng.range(13, 18));
  }
  return { pts, zLast: z };
}

/** Templates beyond the band grammar: diamond (split and rejoin) and crossover (one self-crossing). */
const SPECIAL = {
  diamond(rng) {
    const zKeep = r05(rng.range(-2, 2));
    const zStart = r05(rng.range(-4, 4));
    const xs = r05(rng.range(-42, -36));
    const xm = r05(rng.range(18, 26));
    const lane = (band, upFirst) => {
      const w = wind(rng, { x0: xs, z0: zStart, band, xTo: xm, upFirst });
      return dedupe([[FRAME.xIn, zStart], ...w.pts, [xm, w.zLast], [xm, zKeep], [FRAME.xEnd, zKeep]]);
    };
    const north = lane([13, 30], true);
    const south = lane([-30, -13], false);
    return { paths: [{ id: 'north', width: 5, points: north }, { id: 'south', width: 5, points: south }], zKeep, starts: [zStart] };
  },
  crossover(rng) {
    const zKeep = r05(rng.range(-3, 3));
    // enter at the low edge of the north band so the first turn up can travel minSep
    const zA = r05(rng.range(15, 17));
    const xR = r05(rng.range(33, 37));
    const zB = r05(rng.range(-28, -24));
    const xW = r05(rng.range(-30, -20));
    const w = wind(rng, { x0: r05(rng.range(-42, -36)), z0: zA, band: [15, 30], xTo: xR, upFirst: true });
    const pts = dedupe([[FRAME.xIn, zA], ...w.pts, [xR, w.zLast], [xR, zB], [xW, zB], [xW, zKeep], [FRAME.xEnd, zKeep]]);
    return { paths: [{ id: 'main', width: 5, points: pts }], zKeep, starts: [zA], crossings: 1 };
  },
};

/** Road counts per template (the wave table to vary depends on it). */
export const TEMPLATE_ROADS = { serpentine: 1, fork: 2, trident: 3, diamond: 2, crossover: 1 };

/** Road polylines for a template. Returns {paths:[{id,width,points}], zKeep, starts:[z], crossings?}. */
export function generateRoads(rng, template) {
  if (SPECIAL[template]) return SPECIAL[template](rng);
  const bands = BANDS[template];
  if (!bands) throw new Error(`unknown map template "${template}"`);
  const n = bands.length;
  const zKeep = r05(n === 1 ? rng.range(-12, 12) : rng.range(-1, 1));
  const names = n === 1 ? ['main'] : n === 2 ? ['north', 'south'] : ['north', 'middle', 'south'];
  // merge x per side road (the middle road of a trident is the trunk and merges nowhere)
  // side roads join the trunk at one shared junction, or the second one 11-14 m further east
  const x1 = r05(rng.range(10, 15));
  const x2 = rng.chance(0.3) ? x1 : r05(x1 + rng.range(11, 14));
  const firstNorth = rng.chance(0.5);
  const sides = bands.map((_, i) => !(n === 1 || (n === 3 && i === 1)));
  const merges = bands.map((_, i) => (!sides[i] ? null : (i === 0) === firstNorth ? x1 : x2));
  const mergeXs = [...new Set(merges.filter((m) => m !== null))].sort((a, b) => a - b);
  const paths = [];
  const starts = [];
  bands.forEach(([lo, hi], i) => {
    // narrow bands (trident sides) start at a band edge so the first turn can travel minSep
    const zStart = r05(n === 1 ? rng.range(-24, 24) : n === 3 && i === 1 ? zKeep : hi - lo < 2 * FRAME.minSep ? (rng.chance(0.5) ? lo : hi) : rng.range(lo + 4, hi - 2));
    starts.push(zStart);
    let pts;
    if (n === 1) {
      const s = serpentine(rng, { zStart, band: [lo, hi], xTo: 30 });
      pts = s.pts;
      const xLast = r05(Math.max(pts.at(-1)[0] + 13, 30));
      pts.push([xLast, s.zLast], [xLast, zKeep], [FRAME.xEnd, zKeep]);
    } else if (n === 3 && i === 1) {
      // middle road: the straight central trunk (jogs inside its narrow band would leave no room
      // for towers); the side roads do the winding and merge into it
      pts = [[FRAME.xIn, zKeep]];
      for (const mx of mergeXs) pts.push([mx, zKeep]);
      pts.push([FRAME.xEnd, zKeep]);
    } else {
      const xm = merges[i];
      const s = serpentine(rng, { zStart, band: [lo, hi], xTo: xm });
      pts = s.pts;
      pts.push([xm, s.zLast], [xm, zKeep]);
      for (const mx of mergeXs) if (mx > xm) pts.push([mx, zKeep]);
      pts.push([FRAME.xEnd, zKeep]);
    }
    paths.push({ id: names[i], width: 5, points: dedupe(pts) });
  });
  return { paths, zKeep, starts };
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out.at(-1);
    if (q && q[0] === p[0] && q[1] === p[1]) continue;
    // drop a middle point that lies on a straight line between its neighbours
    const r = out.at(-2);
    if (q && r && ((r[0] === q[0] && q[0] === p[0]) || (r[1] === q[1] && q[1] === p[1]))) out.pop();
    out.push(p);
  }
  return out;
}

function segDist(a, b, c, d) {
  // axis-aligned and general segments: sample-free exact distance between two segments
  const dist = (p, s0, s1) => {
    const vx = s1[0] - s0[0];
    const vz = s1[1] - s0[1];
    const l2 = vx * vx + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - s0[0]) * vx + (p[1] - s0[1]) * vz) / l2));
    return Math.hypot(p[0] - s0[0] - t * vx, p[1] - s0[1] - t * vz);
  };
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(dist(a, c, d), dist(b, c, d), dist(c, a, b), dist(d, a, b));
}

/**
 * Checks a road network: inside the frame, starts at the west edge, ends at the keep, and any two
 * road segments that do not touch stay at least FRAME.minSep apart (room for towers, no overlaps).
 * Returns a list of problems (empty = fine).
 */
export function validateRoads(paths, zKeep, { crossings = 0 } = {}) {
  let crossed = 0;
  const problems = [];
  const key = (s) => s.map((p) => p.join(',')).sort().join('|');
  const segs = new Map();
  for (const p of paths) {
    const pts = p.points;
    if (pts[0][0] !== FRAME.xIn) problems.push(`${p.id}: does not start at the west edge`);
    const end = pts.at(-1);
    if (end[0] !== FRAME.xEnd || end[1] !== zKeep) problems.push(`${p.id}: does not end at the keep`);
    for (const [x, z] of pts) if (x < FRAME.xIn || x > FRAME.xEnd || Math.abs(z) > FRAME.zMax + 1) problems.push(`${p.id}: point ${x},${z} outside the frame`);
    for (let i = 1; i < pts.length; i++) {
      const s = [pts[i - 1], pts[i]];
      if (s[0][0] !== s[1][0] && s[0][1] !== s[1][1]) problems.push(`${p.id}: diagonal segment`);
      segs.set(key(s), s);
    }
  }
  const list = [...segs.values()];
  // touching = sharing a point or a T-junction (an end of one lies on the other)
  const onSeg = (p, t) => segDist(p, p, t[0], t[1]) < 1e-6;
  const touches = (s, t) => s.some((p) => onSeg(p, t)) || t.some((p) => onSeg(p, s));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (touches(list[i], list[j])) continue;
      const d = segDist(list[i][0], list[i][1], list[j][0], list[j][1]);
      // a planned crossover: one vertical and one horizontal segment that cross at a right angle
      const perp = (list[i][0][0] === list[i][1][0]) !== (list[j][0][0] === list[j][1][0]);
      if (d < 1e-6 && perp && crossed < crossings) { crossed++; continue; }
      if (d < FRAME.minSep) problems.push(`segments ${JSON.stringify(list[i])} and ${JSON.stringify(list[j])} only ${d.toFixed(1)} m apart`);
    }
  }
  if (crossed < crossings) problems.push(`expected ${crossings} crossing(s), found ${crossed}`);
  return problems;
}

/** Distance from a point to the road network. */
function roadDist(paths, x, z) {
  let best = Infinity;
  for (const p of paths) {
    for (let i = 1; i < p.points.length; i++) {
      const [a, b] = [p.points[i - 1], p.points[i]];
      const vx = b[0] - a[0];
      const vz = b[1] - a[1];
      const l2 = vx * vx + vz * vz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
      best = Math.min(best, Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz));
    }
  }
  return best;
}

/**
 * Generate a complete map + its wave table.
 * opts: {id, name, seed, template, roads?, theme (tools/map-themes.json entry), unlockLevel, baseWaves
 *        (an existing wave set to vary), enemies (Map id -> def, for themed swaps), hpMul, description}
 */
export function generateMap(opts) {
  const { id, seed, template, theme } = opts;
  const rng = new Rng(`${seed}:map`);
  let roads;
  let problems = [];
  // re-roll (deterministically) until the layout validates; the seed fixes the whole sequence
  // opts.roads: hand-authored roads {paths, zKeep} (flagship maps); otherwise generated
  for (let attempt = 0; attempt < 40; attempt++) {
    roads = opts.roads ? { ...opts.roads, starts: opts.roads.paths.map((pa) => pa.points[0][1]) } : generateRoads(rng.fork(`roads${attempt}`), template);
    problems = validateRoads(roads.paths, roads.zKeep, { crossings: roads.crossings || 0 });
    if (!problems.length) break;
  }
  if (problems.length) throw new Error(`map ${id}: no valid layout: ${problems[0]}`);
  const { paths, zKeep, starts } = roads;
  const drng = rng.fork('decor');

  // portals, keep, then theme decorations clear of roads, landmarks and each other
  const props = starts.map((z) => ({ kind: 'enemy_portal', x: FRAME.xPortal, z, rot: 0 }));
  props.push({ kind: 'base_keep', x: FRAME.xKeep, z: zKeep, rot: 0 });
  const taken = props.map((p) => ({ x: p.x, z: p.z, r: p.kind === 'base_keep' ? 10 : 6 }));
  const free = (x, z, r, pathGap) => roadDist(paths, x, z) >= pathGap + r && taken.every((q) => Math.hypot(q.x - x, q.z - z) >= q.r + r);
  for (const [kind, count, r = 1.5] of theme.decor) {
    let made = 0;
    for (let a = 0; a < count * 60 && made < count; a++) {
      const x = r05(drng.range(-46, 42));
      const z = r05(drng.range(-33, 33));
      if (!free(x, z, r, 4.5)) continue;
      props.push({ kind, x, z, rot: +drng.range(0, Math.PI * 2).toFixed(2) });
      taken.push({ x, z, r: r + 1.5 });
      made++;
    }
  }
  // lamp posts beside the road, about one per 25 m of road
  const lamps = Math.round(paths.reduce((n, p) => n + p.points.length, 0) * 0.6);
  for (let a = 0, made = 0; a < lamps * 80 && made < lamps; a++) {
    const x = r05(drng.range(-46, 44));
    const z = r05(drng.range(-31, 31));
    const d = roadDist(paths, x, z);
    if (d < 3.5 || d > 4.5 || !taken.every((q) => Math.hypot(q.x - x, q.z - z) >= q.r + 3)) continue;
    props.push({ kind: 'lamp_post', x, z, rot: 0 });
    taken.push({ x, z, r: 1 });
    made++;
  }

  // player spawn: a free spot a few metres in front of the keep, off the road
  let spawn = null;
  for (let a = 0; a < 400 && !spawn; a++) {
    const x = r05(drng.range(18, 40));
    const z = r05(drng.range(-28, 28));
    if (roadDist(paths, x, z) >= 5 && taken.every((q) => Math.hypot(q.x - x, q.z - z) >= q.r + 2)) spawn = { x, z, yaw: 1.5708 };
  }
  if (!spawn) throw new Error(`map ${id}: no player spawn`);

  // gentle hills away from the roads
  const hills = [];
  for (let a = 0; a < 300 && hills.length < 7; a++) {
    const r = r05(drng.range(5, 10));
    const x = r05(drng.range(-48, 46));
    const z = r05(drng.range(-36, 36));
    if (roadDist(paths, x, z) < r + 5 || Math.hypot(x - FRAME.xKeep, z - zKeep) < r + 12 || starts.some((s) => Math.hypot(x - FRAME.xPortal, z - s) < r + 8)) continue;
    hills.push({ x, z, r, h: +drng.range(1.2, 3).toFixed(1) });
  }

  const map = {
    id,
    name: opts.name,
    description: opts.description || `${theme.label}: ${paths.length} road${paths.length > 1 ? 's' : ''}.`,
    seed: `${seed}`,
    scatterGap: 1.3,
    waves: `${id}_waves`,
    unlockLevel: opts.unlockLevel,
    theme: theme.id,
    ...(opts.timeOfDay ? { timeOfDay: opts.timeOfDay } : {}), // visual only (src/engine/mapView.js TIME_OF_DAY)
    generated: { template: opts.roads ? 'hand' : template, seed: `${seed}`, theme: theme.id, ...(roads.crossings ? { crossings: roads.crossings } : {}) },
    size: { w: FRAME.w, d: FRAME.d },
    sky: theme.sky,
    sun: theme.sun,
    ground: theme.ground,
    terrain: {
      baseHeight: 0,
      pathBlend: 3,
      rim: theme.rim,
      flats: [{ x: FRAME.xKeep, z: zKeep, r: 8, height: 0, blend: 5 }, ...starts.map((z) => ({ x: FRAME.xPortal, z, r: 5.5, height: 0, blend: 4 }))],
      hills,
    },
    paths,
    base: { x: 50, z: zKeep },
    playerSpawn: spawn,
    props,
    scatter: theme.scatter.map((s) => ({ ...s })),
  };
  const waves = opts.baseWaves ? generateWaves(rng.fork('waves'), opts.baseWaves, { id: `${id}_waves`, roads: paths.length, theme, enemies: opts.enemies, hpMul: opts.hpMul ?? 1, swaps: opts.swaps, boss: opts.boss, featureBosses: opts.featureBosses }) : null;
  return { map, waves };
}

/**
 * Vary an existing wave set: groups spread over the map's roads (round robin, boss on road 0),
 * themed enemy swaps (a group's enemy may become a generated variant of the same template with
 * the theme's palette: same HP x speed budget), and one HP multiplier for calibration.
 * featured: {enemyId: replacementId} explicit swaps (same chance; e.g. a map that shows off new
 * units; a value may be {enemy, countMul} to keep the health budget); boss: the final boss id;
 * featureBosses: {mid, final} boss ids for the boss waves, scaled to the base boss's health.
 */
export function generateWaves(rng, base, { id, roads, theme, enemies, hpMul = 1, swaps: featured = null, boss = null, featureBosses = null }) {
  const swaps = new Map();
  if (enemies && theme.enemyScheme) {
    for (const e of enemies.values()) {
      // only the batches a theme names (default kenney_b1): a new content batch must not silently
      // change the waves of maps that were already balanced
      if (!(theme.swapBatches || ['kenney_b1']).includes(e.generated?.batch)) continue;
      // a swap must keep the mechanic: some variants fly where their template walks (Rift Bastion)
      const tpl = enemies.get(e.generated?.template);
      if (!tpl || !!tpl.flying !== !!e.flying) continue;
      if (e.model?.palette === theme.enemyScheme) swaps.set(e.generated.template, e.id);
    }
  }
  const out = JSON.parse(JSON.stringify(base));
  out.id = id;
  out.$doc = `Generated from ${base.id} by src/core/mapGen.js (theme ${theme.id}, ${roads} road${roads > 1 ? 's' : ''}).`;
  out.waves.forEach((w, wi) => {
    w.groups.forEach((g, gi) => {
      const def = enemies?.get(g.enemy);
      g.path = def?.boss ? 0 : (gi + wi) % roads;
      const f = featured?.[g.enemy];
      if (!def?.boss && f && rng.chance(theme.swapChance ?? 0.5)) {
        if (typeof f === 'string') g.enemy = f;
        else {
          // a featured unit with other health: keep the group's health budget and its duration
          const count = Math.max(1, Math.round(g.count * (f.countMul ?? 1)));
          if (g.interval) g.interval = +((g.interval * g.count) / count).toFixed(2);
          g.count = count;
          g.enemy = f.enemy;
        }
      } else if (!def?.boss && swaps.has(g.enemy) && rng.chance(theme.swapChance ?? 0.5)) g.enemy = swaps.get(g.enemy);
      const last = wi === out.waves.length - 1;
      if (def?.boss && boss && last) g.enemy = boss;
      // featureBosses {mid, final}: other bosses at the base boss's health (their own mechanics)
      const fb = def?.boss && featureBosses ? (last ? featureBosses.final : featureBosses.mid) : null;
      if (fb && enemies.get(fb)) { g.enemy = fb; g.hpMul = +((g.hpMul ?? 1) * def.hp / enemies.get(fb).hp).toFixed(3); }
      if (hpMul !== 1) g.hpMul = +((g.hpMul ?? 1) * hpMul).toFixed(3);
    });
  });
  return out;
}
