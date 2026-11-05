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
    quests: index.quests ? await readJson(index.quests) : null,
    music: index.music ? await readJson(index.music) : null,
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
export function validateContent(c) {
  const errs = [];
  const dmg = (t, where) => { if (t && !c.damageTypes.has(t)) errs.push(`${where}: unknown damage type "${t}"`); };
  for (const e of c.enemies.values()) {
    for (const k of ['hp', 'speed', 'reward', 'leak']) if (!(typeof e[k] === 'number' && e[k] >= 0)) errs.push(`enemy ${e.id}: bad ${k}`);
    for (const t of Object.keys(e.resist || {})) dmg(t, `enemy ${e.id} resist`);
    for (const ref of [e.split?.into, e.summon?.into]) if (ref && !c.enemies.has(ref)) errs.push(`enemy ${e.id}: unknown enemy "${ref}"`);
    for (const ph of e.phases || []) for (const a of ph.actions) if (a.into && !c.enemies.has(a.into)) errs.push(`boss ${e.id}: unknown enemy "${a.into}"`);
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

export function browserReadJson(base = 'data/') {
  return async (path) => {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`Failed to load ${base + path}: ${res.status}`);
    return res.json();
  };
}
