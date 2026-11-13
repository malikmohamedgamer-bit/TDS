// Loads all JSON content listed in data/index.json and validates cross references. Pure: the
// caller injects readJson(path) (fetch in the browser, fs in Node tests / the balance bot).

const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function loadMany(readJson, files, key) {
  const out = new Map();
  for (const f of list(files)) {
    const doc = await readJson(f);
    for (const item of doc[key]) {
      if (out.has(item.id)) throw new Error(`Duplicate ${key} id "${item.id}" in ${f}`);
      out.set(item.id, { ...item, $file: f });
    }
  }
  return out;
}

export async function loadContent(readJson) {
  const index = await readJson('index.json');
  const props = await loadMany(readJson, index.props, 'props');
  const maps = new Map();
  for (const file of list(index.maps)) {
    const m = await readJson(file);
    maps.set(m.id, m);
  }
  const waves = new Map();
  for (const file of list(index.waves)) {
    const w = await readJson(file);
    waves.set(w.id, w);
  }
  const content = {
    index,
    props,
    maps,
    waves,
    towers: await loadMany(readJson, index.towers, 'towers'),
    enemies: await loadMany(readJson, index.enemies, 'enemies'),
    damageTypes: await loadMany(readJson, index.damageTypes, 'types'),
    difficulties: await loadMany(readJson, index.difficulties, 'difficulties'),
    abilities: await loadMany(readJson, index.abilities, 'abilities'),
    heroes: await loadMany(readJson, index.heroes, 'heroes'),
    progression: index.progression ? await readJson(index.progression) : null,
    tuning: index.tuning ? await readJson(index.tuning) : null,
    meta: index.meta ? await readJson(index.meta) : null,
    // quests: one file or a list (hand-written quests.json + generated tiers); lists are concatenated
    quests: index.quests ? await (async () => {
      const files = Array.isArray(index.quests) ? index.quests : [index.quests];
      const out = { daily: [], weekly: [], story: [], achievements: [] };
      for (const f of files) { const q = await readJson(f); for (const k of Object.keys(out)) out[k].push(...(q[k] || [])); }
      return out;
    })() : null,
    music: index.music ? await readJson(index.music) : null,
    help: await readJson(index.help || 'help.json').catch(() => null),
    // {mapId: {difficultyId: enemy health factor}}; missing = 1
    difficultyHp: index.difficultyHp ? (await readJson(index.difficultyHp)).maps || {} : {},
    cosmetics: await readJson(index.cosmetics || 'cosmetics.json').catch(() => null),
    palettes: index.palettes ? await readJson(index.palettes) : null,
    themes: index.themes ? (await readJson(index.themes)).themes : {},
    vfx: index.vfx ? await readJson(index.vfx) : null,
    ...(await (async () => {
      const m = index.modes ? await readJson(index.modes) : { modes: [], modifiers: [] };
      return { modes: new Map(m.modes.map((x) => [x.id, x])), modifiers: new Map(m.modifiers.map((x) => [x.id, x])) };
    })()),
    models: new Map(Object.entries(index.models ? (await readJson(index.models)).models : {})),
  };
  content.version = contentVersion(content);
  return content;
}

/** Stable short hash of all gameplay data; saves and match logs record it (server validation). */
export function contentVersion(content) {
  const parts = [];
  for (const k of ['towers', 'enemies', 'damageTypes', 'difficulties', 'abilities', 'heroes', 'waves', 'maps']) {
    const m = content[k];
    if (!m) continue;
    for (const [id, v] of [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) parts.push(k, id, JSON.stringify(v));
  }
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Returns a list of human-readable problems (empty when content is consistent). */
/** Boss phase action types the simulation knows (src/sim/match.js _bossPhases / _bossAction). */
export const BOSS_ACTIONS = ['telegraph', 'summon', 'shield', 'speed', 'teleport', 'regen', 'cloak', 'immune', 'armor', 'dash', 'drainCash', 'portal', 'healPulse', 'snipe', 'undying', 'splitOnDeath'];

export function validateContent(c) {
  const errs = [];
  const dmg = (t, where) => { if (t && !c.damageTypes.has(t)) errs.push(`${where}: unknown damage type "${t}"`); };
  for (const e of c.enemies.values()) {
    for (const k of ['hp', 'speed', 'reward', 'leak']) if (!(typeof e[k] === 'number' && e[k] >= 0)) errs.push(`enemy ${e.id}: bad ${k}`);
    for (const t of Object.keys(e.resist || {})) dmg(t, `enemy ${e.id} resist`);
    for (const ref of [e.split?.into, e.summon?.into]) if (ref && !c.enemies.has(ref)) errs.push(`enemy ${e.id}: unknown enemy "${ref}"`);
    for (const ph of e.phases || []) for (const a of ph.actions) if (a.into && !c.enemies.has(a.into)) errs.push(`boss ${e.id}: unknown enemy "${a.into}"`);
    for (const ph of e.phases || []) for (const a of ph.actions) if (!BOSS_ACTIONS.includes(a.type)) errs.push(`boss ${e.id}: unknown phase action "${a.type}"`);
  }
  for (const t of c.towers.values()) {
    if (!(t.cost > 0)) errs.push(`tower ${t.id}: bad cost`);
    dmg(t.stats.damageType, `tower ${t.id}`);
    const steps = [...(t.upgrades?.linear || [])];
    for (const b of Object.values(t.upgrades?.branches || {})) steps.push(...b.steps);
    for (const s of steps) {
      if (!(s.cost > 0)) errs.push(`tower ${t.id} upgrade ${s.name}: bad cost`);
      if (s.set?.damageType) dmg(s.set.damageType, `tower ${t.id} upgrade ${s.name}`);
    }
  }
  for (const w of c.waves.values()) {
    w.waves.forEach((wave, i) => {
      for (const g of wave.groups) {
        if (!c.enemies.has(g.enemy)) errs.push(`waves ${w.id} #${i + 1}: unknown enemy "${g.enemy}"`);
        if (!(g.count > 0)) errs.push(`waves ${w.id} #${i + 1}: bad count`);
      }
    });
  }
  for (const m of c.maps.values()) {
    if (m.waves && !c.waves.has(m.waves)) errs.push(`map ${m.id}: unknown wave set "${m.waves}"`);
    for (const p of m.props || []) if (!c.props.has(p.kind)) errs.push(`map ${m.id}: unknown prop "${p.kind}"`);
    // an air route starts where a road starts (a portal) and ends where a road ends (the keep)
    const ends = (m.paths || []).map((p) => [p.points[0], p.points[p.points.length - 1]]);
    const near = (q, r) => Math.hypot(q[0] - r[0], q[1] - r[1]) < 6;
    for (const a of m.airPaths || []) {
      const pts = a.points || [];
      if (pts.length < 2 || !pts.every((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))) errs.push(`map ${m.id}: air route ${a.id} needs 2+ [x, z] points`);
      else if (!ends.some(([s0]) => near(pts[0], s0)) || !ends.some(([, e0]) => near(pts[pts.length - 1], e0))) errs.push(`map ${m.id}: air route ${a.id} must run from a portal to the keep`);
    }
  }
  for (const h of c.heroes.values()) {
    for (const a of h.abilities || []) if (!c.abilities.has(a)) errs.push(`hero ${h.id}: unknown ability "${a}"`);
    dmg(h.attack?.damageType, `hero ${h.id}`);
  }
  for (const a of c.abilities.values()) dmg(a.effects?.damageType, `ability ${a.id}`);
  for (const mo of c.modes?.values() || []) if (mo.waves && !c.waves.has(mo.waves)) errs.push(`mode ${mo.id}: unknown wave set "${mo.waves}"`);
  for (const id of c.meta?.starterTowers || []) if (!c.towers.has(id)) errs.push(`meta: unknown starter tower "${id}"`);
  for (const t of c.towers.values()) if (c.meta && !(t.rarity in c.meta.shop.towerPrices)) errs.push(`tower ${t.id}: rarity "${t.rarity}" has no shop price`);
  for (const [kind, map] of [['tower', c.towers], ['enemy', c.enemies]]) {
    for (const x of map.values()) if (x.model?.glb && c.models && !c.models.has(x.model.glb)) errs.push(`${kind} ${x.id}: unknown model "${x.model.glb}"`);
  }
  return errs;
}

// The built site ships every data file in one data/bundle.json (tools/build-site.mjs): one
// request instead of about 170. Without it (dev server) each file is fetched on its own.
const bundles = new Map();
function dataBundle(base) {
  if (!bundles.has(base)) {
    bundles.set(base, fetch(`${base}bundle.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return bundles.get(base);
}

export function browserReadJson(base = 'data/') {
  return async (path) => {
    const bundle = await dataBundle(base);
    if (bundle && Object.hasOwn(bundle, path)) return structuredClone(bundle[path]);
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`Failed to load ${base + path}: ${res.status}`);
    return res.json();
  };
}
