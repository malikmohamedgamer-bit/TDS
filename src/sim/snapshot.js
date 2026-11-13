// Match snapshots: the complete mutable state of a Match as plain JSON, and the way back.
// Pure (no DOM / Three.js). Used by the lockstep session to resync a client that drifted and to
// bring late joiners in (docs/multiplayer.md, Contract 1).
//
// Object references become ids and are re-linked on restore:
//   defs (towers, enemies, heroes, abilities) -> content ids     paths -> index in match.routes (roads, then air routes)
//   enemy.burnSrc (a tower, maybe already sold) -> tower uid, sold towers as small "ghosts"
// Everything derived from data (tower base stats, mine points, colliders) is rebuilt instead of
// stored, so a snapshot stays small and cannot disagree with the content it is restored against.
// Transient output (events) and per-tick scratch caches (ally path lookups) are not part of it.

export const SNAPSHOT_VERSION = 1;

// tower fields rebuilt by Match._refreshTower / _addCollider on restore
const TOWER_DERIVED = ['def', 'base', 'name', 'tier', 'evolved', 'lobbyLevel', 'minePoints', 'collider'];

const omit = (o, keys) => {
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
};

// JSON has no Infinity: finite numbers pass, the rest become null (and back to Infinity on restore)
const finite = (v) => (Number.isFinite(v) ? v : null);
const orInfinity = (v) => (v === null || v === undefined ? Infinity : v);

/** Complete mutable state of match m as a JSON-serialisable object. */
export function snapshotMatch(m) {
  const pathIdx = (p) => m.routes.indexOf(p);
  const live = new Set(m.towers);
  // burn sources that were sold while the burn still ticks: keep what the burn still reads
  const ghosts = new Map();
  for (const e of m.enemies) {
    const t = e.burnSrc;
    if (t && !live.has(t) && !ghosts.has(t.uid)) ghosts.set(t.uid, { uid: t.uid, owner: t.owner, bounty: t.base?.bounty || 0, damage: t.damage, kills: t.kills });
  }
  const raw = {
    v: SNAPSHOT_VERSION,
    contentVersion: m.content.version ?? null,
    map: m.map.id,
    config: m.config,
    tick: m.tick,
    time: m.time,
    phase: m.phase,
    wave: m.wave,
    waveStartTime: m.waveStartTime,
    nextWaveAt: finite(m.nextWaveAt),
    paidWaves: m.paidWaves,
    baseMax: m.baseMax,
    baseHp: m.baseHp,
    nextId: m.nextId,
    auraDirty: m.auraDirty,
    colliderSeq: m.colliderSeq,
    clearedAt: m._clearedAt ?? null,
    clearedWave: m._clearedWave ?? null,
    rng: m.rng.getState(),
    wallets: m.wallets.slice(),
    playerStats: m.playerStats,
    stats: m.stats,
    heroes: m.heroes.map((h) => ({ ...omit(h, ['def']), def: h.def.id })),
    abilities: m.abilitySets.map((list) => list.map((a) => omit(a, ['def']))),
    towers: m.towers.map((t) => omit(t, TOWER_DERIVED)),
    ghosts: [...ghosts.values()],
    enemies: m.enemies.map((e) => ({ ...omit(e, ['def', 'path', 'burnSrc']), path: pathIdx(e.path), burnSrc: e.burnSrc ? e.burnSrc.uid : null })),
    projectiles: m.projectiles,
    allies: m.allies.map((a) => ({ ...omit(a, ['path', 'onTick', 'onPath']), path: pathIdx(a.path) })),
    mines: m.mines,
    telegraphs: m.telegraphs,
    pendingAbilities: m.pendingAbilities.map((p) => omit(p, ['def'])),
    spawnQueue: m.spawnQueue,
    queue: m.queue,
    log: m.log,
    seen: [...m.seen],
    genWaves: [...m.genWaves.entries()],
    bossRushOrder: m.bossRushOrder ?? null,
    mutations: m._mut ? [...m._mut.entries()].map(([n, mu]) => [n, mu ? mu.id : null]) : null,
  };
  // one JSON pass: a deep copy that shares nothing with the live match, and exactly what a
  // transport delivers (undefined fields dropped, -0 as 0)
  return JSON.parse(JSON.stringify(raw));
}

/**
 * Rebuilds a Match from snapshotMatch() output. mapWorld must be a fresh buildMapWorld() of the
 * same map (or the old match's world after old.dispose()): tower colliders are added to it.
 */
export function restoreMatch(MatchClass, snap, { content, mapWorld }) {
  if (!snap || snap.v !== SNAPSHOT_VERSION) throw new Error(`Unsupported match snapshot version ${snap?.v}`);
  if ((content.version ?? null) !== snap.contentVersion) throw new Error(`Snapshot is for content ${snap.contentVersion}, this game has ${content.version}`);
  if (mapWorld.map.id !== snap.map) throw new Error(`Snapshot is for map ${snap.map}, not ${mapWorld.map.id}`);
  const s = JSON.parse(JSON.stringify(snap)); // never alias the caller's object
  const m = new MatchClass({ content, mapWorld, ...s.config });
  const def = (map, id, what) => {
    const d = map.get(id);
    if (!d) throw new Error(`Snapshot needs unknown ${what} "${id}"`);
    return d;
  };

  Object.assign(m, {
    tick: s.tick, time: s.time, phase: s.phase, wave: s.wave, waveStartTime: s.waveStartTime,
    nextWaveAt: orInfinity(s.nextWaveAt), paidWaves: s.paidWaves, baseMax: s.baseMax, baseHp: s.baseHp,
    nextId: s.nextId, auraDirty: s.auraDirty, colliderSeq: s.colliderSeq,
    wallets: s.wallets, playerStats: s.playerStats, stats: s.stats,
    projectiles: s.projectiles, mines: s.mines, telegraphs: s.telegraphs, spawnQueue: s.spawnQueue,
    queue: s.queue, log: s.log, events: [],
  });
  if (s.clearedAt !== null) m._clearedAt = s.clearedAt;
  if (s.clearedWave !== null) m._clearedWave = s.clearedWave;
  m.rng.setState(s.rng);
  m.seen = new Set(s.seen);
  m.genWaves = new Map(s.genWaves);
  if (s.bossRushOrder) m.bossRushOrder = s.bossRushOrder;
  if (s.mutations) {
    const list = m.mode.mutations || [];
    m._mut = new Map(s.mutations.map(([n, id]) => [n, id === null ? null : list.find((x) => x.id === id) || null]));
  }

  m.heroes = s.heroes.map((h) => ({ ...h, def: def(content.heroes, h.def, 'hero') }));
  m.abilitySets = s.abilities.map((list) => list.map((a) => ({ ...a, def: def(content.abilities, a.id, 'ability') })));
  m.pendingAbilities = s.pendingAbilities.map((p) => ({ ...p, def: def(content.abilities, p.id, 'ability') }));

  // towers: stats, mine points and colliders come back from data; colliders in their original order
  m.towers = s.towers.map((t) => {
    const tw = { ...t, def: def(content.towers, t.defId, 'tower') };
    m._refreshTower(tw);
    return tw;
  });
  for (const t of [...m.towers].sort((a, b) => a.cseq - b.cseq)) m._addCollider(t);

  const byUid = new Map(m.towers.map((t) => [t.uid, t]));
  for (const g of s.ghosts) byUid.set(g.uid, { uid: g.uid, owner: g.owner, base: { bounty: g.bounty }, damage: g.damage, kills: g.kills, ghost: true });
  const path = (i) => {
    const p = m.routes[i];
    if (!p) throw new Error(`Snapshot path ${i} is not on map ${snap.map}`);
    return p;
  };
  m.enemies = s.enemies.map((e) => ({ ...e, def: def(content.enemies, e.defId, 'enemy'), path: path(e.path), burnSrc: e.burnSrc === null ? null : byUid.get(e.burnSrc) || null }));
  m.allies = s.allies.map((a) => ({ ...a, path: path(a.path) }));
  return m;
}
