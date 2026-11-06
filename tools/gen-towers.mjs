// node tools/gen-towers.mjs [--check]: tower batch "mechanics_b1" (ROADMAP Chunk 2). 63 towers, each a core
// template plus one or two of the new tower mechanics (execute, crit, ramp, shred, pushback, bounty, multishot),
// a damage type and a code-built kit model (src/engine/towerKit.js: base + head + add-on, glow accent).
// Price comes from the bot's value measure (src/sim/bot.js value, which prices the new mechanics too) times
// PRICE_MUL; upgrade trees are the template's with costs scaled the same way. Writes data/towers/mechanics_b1.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { value as botValue } from '../src/sim/bot.js';

const read = (p) => JSON.parse(readFileSync(`data/${p}`, 'utf8'));
const towers = new Map([...read('towers/war.json').towers, ...read('towers/magic.json').towers].map((t) => [t.id, t]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const PRICE_MUL = Number(process.env.PRICE_MUL || 1.4);
const round25 = (n) => Math.max(100, Math.round(n / 25) * 25);
const towerValue = (s) => botValue(s, Math.pow(Math.min(1, (s.range || 8) / 32), 0.9), 10);

/** The new mechanics: stat set + trade-off, the kit add-on that shows it, and its adjective per faction. */
const MECH = {
  execute: { set: { execute: { below: 0.3, mul: 2.2 } }, mul: { damage: 0.9 }, addon: 'skull', adj: ['Reaper', 'Soulreaper'], text: 'Deals 2.2x damage to enemies below 30% health (not bosses).' },
  crit: { set: { crit: { every: 4, mul: 3 } }, mul: { damage: 0.85 }, addon: 'gem', adj: ['Gambler', 'Fortune'], text: 'Every 4th shot hits for triple damage.' },
  ramp: { set: { ramp: { perHit: 0.12, max: 1 } }, mul: { damage: 0.8 }, addon: 'spool', adj: ['Focus', 'Mindlock'], text: 'Damage builds up to double while it keeps the same target.' },
  shred: { set: { shred: { amount: 0.6, duration: 4 } }, mul: { damage: 0.9 }, addon: 'drill', adj: ['Sunder', 'Rend'], text: 'Hits strip 60% of the target\'s armour for 4 seconds.' },
  pushback: { set: { pushback: 2.5 }, mul: { damage: 0.8 }, addon: 'ram', adj: ['Concussion', 'Gale'], text: 'Hits shove enemies back along the road (bosses a quarter as far).' },
  bounty: { set: { bounty: 0.4 }, mul: { damage: 0.85 }, addon: 'coinbox', adj: ['Bounty', 'Tithe'], text: 'Kills pay 40% more cash.' },
  multishot: { set: { multishot: { count: 2, falloff: 0.6 } }, mul: { damage: 0.85 }, addon: 'fan', adj: ['Volley', 'Barrage'], text: 'Also strikes the two nearest other enemies for 60% damage.' },
};
const MECHS = Object.keys(MECH);

/** Templates: faction, class, noun, heads / bases the kit draws from, damage types the variants rotate through. */
const TPL = {
  rifleman: { faction: 'war', cls: 'ground', noun: 'Rifle', heads: ['single', 'twin', 'drum'], bases: ['bunker', 'pad', 'mast'], types: ['physical', 'explosive', 'poison', 'physical', 'holy', 'dark', 'arcane'] },
  marksman: { faction: 'war', cls: 'sniper', noun: 'Sniper', heads: ['long', 'single', 'dish'], bases: ['mast', 'bunker', 'pad'], types: ['physical', 'lightning', 'ice', 'physical', 'fire', 'poison', 'physical'] },
  gunner: { faction: 'war', cls: 'ground', noun: 'Gatling', heads: ['quad', 'drum', 'twin'], bases: ['pad', 'bunker', 'mast'], types: ['physical', 'fire', 'physical', 'lightning', 'physical', 'ice', 'poison'] },
  rocket_battery: { faction: 'war', cls: 'area', noun: 'Launcher', heads: ['rack', 'mortar', 'dish'], bases: ['pad', 'mast', 'bunker'], types: ['explosive', 'fire', 'explosive', 'ice', 'poison', 'explosive', 'lightning'] },
  ember_adept: { faction: 'magic', cls: 'area', noun: 'Pyre', heads: ['cauldron', 'orb', 'staff'], bases: ['plinth', 'menhir', 'obelisk'], types: ['fire', 'dark', 'fire', 'holy', 'fire', 'arcane', 'poison'] },
  frost_weaver: { faction: 'magic', cls: 'support', noun: 'Frostspire', heads: ['prism', 'staff', 'orb'], bases: ['obelisk', 'plinth', 'menhir'], types: ['ice', 'arcane', 'ice', 'holy', 'ice', 'dark', 'ice'] },
  storm_caller: { faction: 'magic', cls: 'hybrid', noun: 'Storm Coil', heads: ['coil', 'orb', 'dish'], bases: ['menhir', 'obelisk', 'plinth'], types: ['lightning', 'arcane', 'lightning', 'holy', 'lightning', 'dark', 'lightning'] },
};
const WAR_ADJ = 0;
const MAGIC_ADJ = 1;
const ACCENTS = ['cyan', 'gold', 'crimson', 'toxic', 'violet', 'ember', 'magenta', 'ice'];
const TYPE_ACCENT = { fire: 'ember', ice: 'ice', lightning: 'gold', poison: 'toxic', dark: 'violet', holy: 'gold', arcane: 'magenta', explosive: 'ember', physical: 'cyan' };

// 49 single-mechanic towers (every template x every mechanic) + 14 pairs
const PAIRS = [
  ['rifleman', ['execute', 'crit']], ['marksman', ['ramp', 'shred']], ['gunner', ['multishot', 'bounty']], ['rocket_battery', ['pushback', 'shred']],
  ['ember_adept', ['execute', 'ramp']], ['frost_weaver', ['pushback', 'crit']], ['storm_caller', ['multishot', 'execute']],
  ['rifleman', ['pushback', 'bounty']], ['marksman', ['crit', 'execute']], ['gunner', ['ramp', 'pushback']], ['rocket_battery', ['bounty', 'multishot']],
  ['ember_adept', ['shred', 'bounty']], ['frost_weaver', ['ramp', 'multishot']], ['storm_caller', ['crit', 'shred']],
];
const SPECS = [];
for (const [tpl, T] of Object.entries(TPL)) MECHS.forEach((m, i) => SPECS.push({ tpl, mechs: [m], typeIdx: i, T }));
PAIRS.forEach(([tpl, mechs], i) => SPECS.push({ tpl, mechs, typeIdx: i + 3, T: TPL[tpl], pair: true }));

const PAIR_NAMES = {
  'rifleman:execute+crit': 'Headsman Rifle', 'marksman:ramp+shred': 'Anvil Sniper', 'gunner:multishot+bounty': 'Prospector Gatling', 'rocket_battery:pushback+shred': 'Breaker Launcher',
  'ember_adept:execute+ramp': 'Cremator Pyre', 'frost_weaver:pushback+crit': 'Avalanche Spire', 'storm_caller:multishot+execute': 'Tempest Coil',
  'rifleman:pushback+bounty': 'Marshal Rifle', 'marksman:crit+execute': 'Assassin Sniper', 'gunner:ramp+pushback': 'Juggernaut Gatling', 'rocket_battery:bounty+multishot': 'Salvage Launcher',
  'ember_adept:shred+bounty': 'Smelter Pyre', 'frost_weaver:ramp+multishot': 'Shardstorm Spire', 'storm_caller:crit+shred': 'Thunderbolt Coil',
};

function setPath(o, path, v) {
  const keys = path.split('.');
  let t = o;
  while (keys.length > 1) { const k = keys.shift(); t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; t = t[k]; }
  t[keys[0]] = clone(v);
}

const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const seenKits = new Set();
const seenNames = new Set();

function build(spec, n) {
  const { tpl, mechs, T } = spec;
  const base = towers.get(tpl);
  const t = clone(base);
  const ai = T.faction === 'war' ? WAR_ADJ : MAGIC_ADJ;
  const name = spec.pair ? PAIR_NAMES[`${tpl}:${mechs.join('+')}`] : `${MECH[mechs[0]].adj[ai]} ${T.noun}`;
  if (seenNames.has(name)) throw new Error(`duplicate name ${name}`);
  seenNames.add(name);
  const id = name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
  const damageType = T.types[spec.typeIdx % T.types.length];
  for (const m of mechs) {
    for (const [k, v] of Object.entries(MECH[m].mul)) t.stats[k] = +(t.stats[k] * v).toFixed(3);
    for (const [k, v] of Object.entries(MECH[m].set)) setPath(t.stats, k, v);
  }
  // pairs trade a little more damage for two mechanics
  if (spec.pair) t.stats.damage = +(t.stats.damage * 0.9).toFixed(3);
  t.stats.damageType = damageType;
  // kit: head and base rotate through the template's pieces; the add-on shows the lead mechanic
  const head = T.heads[n % T.heads.length];
  const basePiece = T.bases[Math.floor(n / T.heads.length) % T.bases.length];
  const addon = MECH[mechs[0]].addon;
  let accent = TYPE_ACCENT[damageType] || ACCENTS[n % ACCENTS.length];
  let key = `${basePiece}|${head}|${addon}|${accent}`;
  for (let k = 0; seenKits.has(key) && k < 20; k++) { accent = ACCENTS[(ACCENTS.indexOf(accent) + 1) % ACCENTS.length]; key = `${basePiece}|${head}|${addon}|${accent}`; }
  if (seenKits.has(key)) throw new Error(`duplicate kit ${key}`);
  seenKits.add(key);
  Object.assign(t, {
    id, name, faction: T.faction, class: T.cls,
    description: `${base.description.replace(/\.$/, '')}. ${mechs.map((m) => MECH[m].text).join(' ')}`,
    model: { kit: { base: basePiece, head, addon, accent } },
  });
  // priced like the template by the bot's value estimate, times PRICE_MUL (generated towers ran too strong: BUGS #37)
  const tv = towerValue(base.stats);
  const ratio = tv > 0 ? (towerValue(t.stats) / tv) * PRICE_MUL : PRICE_MUL;
  t.cost = round25(base.cost * ratio);
  const scaleUp = (st) => { st.cost = round25(st.cost * ratio); };
  for (const st of t.upgrades.linear) scaleUp(st);
  for (const br of Object.values(t.upgrades.branches)) for (const st of br.steps) { scaleUp(st); if (st.evolve) st.evolve = `${name} ${br.name}`; }
  const ri = RARITY.indexOf(base.rarity);
  t.rarity = RARITY[Math.min(3, ri + (spec.pair ? 1 : 0))] || base.rarity;
  t.generated = { batch: 'mechanics_b1', template: tpl, mechanics: [...mechs].sort(), valueRatio: +ratio.toFixed(3) };
  return t;
}

export function buildTowers() {
  seenKits.clear();
  seenNames.clear();
  return SPECS.map(build);
}

import { pathToFileURL } from 'node:url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = { $doc: `GENERATED by tools/gen-towers.mjs (do not edit by hand). ${SPECS.length} towers: a core template plus new mechanics, kit models.`, towers: buildTowers() };
  const json = `${JSON.stringify(out, null, 1)}\n`;
  const path = new URL('../data/towers/mechanics_b1.json', import.meta.url);
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(path, 'utf8'); } catch { /* missing */ }
    if (cur !== json) { console.error('data/towers/mechanics_b1.json is out of date: run node tools/gen-towers.mjs'); process.exit(1); }
    console.log('towers mechanics_b1 up to date');
  } else {
    writeFileSync(path, json);
    const by = {};
    for (const t of out.towers) by[t.faction] = (by[t.faction] || 0) + 1;
    console.log(`wrote ${out.towers.length} towers`, by, `kits ${seenKits.size}`);
  }
}
