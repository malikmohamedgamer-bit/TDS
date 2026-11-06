// node tools/gen-bosses.mjs [--check]: writes data/bosses/mechanics_b1.json, 40 bosses that each use a
// different SET of phase mechanics (src/sim/match.js _bossPhases / _bossAction). Deterministic: the
// same command always writes the same file. Never edit the output by hand; change this script.
// Every boss: 3 phases (75 / 50 / 25 % health), 3-4 mechanic types, at least 2 of them from the new
// pool. Health is lowered for mechanics that add effective health (regen, shield, revive ...), so a
// boss kit changes how the fight plays, not how long it lasts. Models: the existing boss models
// recoloured through palette schemes (Kenney) or as-is (Quaternius, Gravemaw).
import { readFileSync, writeFileSync } from 'node:fs';
import { Rng } from '../src/core/rng.js';
import { MECHANIC_BODY, MECHANIC_PART } from '../src/engine/bossKit.js';

const NEW = ['teleport', 'regen', 'cloak', 'immune', 'armor', 'dash', 'drainCash', 'portal', 'healPulse', 'snipe', 'undying', 'splitOnDeath'];
const OLD = ['telegraph', 'summon', 'shield', 'speed'];
// batch health before the effective-health discount; tuned with the Boss Rush bot (BUGS.md #46)
const BASE_HP = 7500;

const TITLE = {
  teleport: 'the Rift Strider', regen: 'the Ever-Green Rot', cloak: 'the Veiled', immune: 'the Unbroken', armor: 'the Ironhide',
  dash: 'the Stampede', drainCash: 'the Tithe-Taker', portal: 'the Gatecaller', healPulse: 'the Rotmother', snipe: 'the Tower-Breaker',
  undying: 'the Twice-Dead', splitOnDeath: 'the Hive Heart',
};
const PHRASE = {
  teleport: 'blinks forward along the road', regen: 'regrows its health unless it burns', cloak: 'vanishes from towers without detection',
  immune: 'shrugs off one kind of damage for a while', armor: 'hardens its hide', dash: 'charges in a sudden burst',
  drainCash: 'steals a share of your cash', portal: 'opens portals on the other roads', healPulse: 'heals the Blight around it',
  snipe: 'marks your best tower for a stunning strike', undying: 'gets back up once', splitOnDeath: 'bursts into minions when it dies',
  telegraph: 'stomps towers near it into silence', summon: 'calls the swarm', shield: 'raises a shield', speed: 'speeds up for good',
};
// extra effective health each mechanic gives the boss (HP is divided by 1 + sum)
const EHP = { regen: 0.15, shield: 0.2, undying: 0.3, immune: 0.12, armor: 0.1, cloak: 0.06, healPulse: 0.03 };
const IMMUNE_SETS = [['physical'], ['fire', 'ice'], ['arcane', 'lightning'], ['explosive', 'physical'], ['poison', 'dark', 'holy']];
const MINIONS = ['mite', 'husk', 'skitter'];
const MODELS = [
  { glb: 'k_siege_tower', palettes: ['blight', 'blight_frost', 'blight_scrap', 'blight_pale'] },
  { glb: 'k_siege_ram', palettes: ['blight_ember', 'blight_toxic', 'blight_pale'] },
  { glb: 'k_truck', palettes: ['blight', 'blight_ember', 'blight_scrap'] },
  { glb: 'k_tractor_shovel', palettes: ['blight', 'blight_frost', 'blight_toxic'] },
  { glb: 'k_garbage_truck', palettes: ['blight_toxic', 'blight_ember', 'blight_pale'] },
  { glb: 'q_big_orc_skull' }, { glb: 'q_big_demon' }, { glb: 'q_big_mushroom_king' }, { glb: 'q_tank3' }, { glb: 'q_stan' }, { glb: 'q_big_yeti' }, { glb: 'q_big_ninja' },
  { glb: 'gravemaw', builder: 'gravemaw' },
];
// the first KIT_BOSSES bosses get code-built kit bodies (src/engine/bossKit.js): body from the lead mechanic,
// one part per mechanic, glow accent from the resist profile (dark, poison, fire, lightning, ice resist)
const KIT_BOSSES = 40;
const KIT_TINT = ['ash', 'bog', 'rust', 'glacier', 'dusk', 'sand'];
const KIT_ACCENT = ['violet', 'toxic', 'ember', 'magenta', 'frost'];
const RESISTS = [
  { dark: 0.5, poison: 0.7, holy: 1.35, lightning: 1.15 },
  { poison: 0.4, ice: 0.5, fire: 1.3, arcane: 1.1 },
  { fire: 0.5, ice: 1.3, holy: 1.2 },
  { lightning: 0.6, physical: 1.15, arcane: 1.2 },
  { ice: 0.5, fire: 1.3, dark: 1.1 },
];
const SYL1 = ['Vor', 'Mal', 'Kael', 'Zhur', 'Ost', 'Grim', 'Nyx', 'Thal', 'Brak', 'Sul', 'Dra', 'Vex', 'Mor', 'Ash', 'Kry', 'Ul', 'Rhaz', 'Gol'];
const SYL2 = ['gath', 'moth', 'ris', 'kar', 'vane', 'drel', 'thos', 'ruun', 'mire', 'zek', 'lith', 'vorn'];

function params(type, i, rng) {
  switch (type) {
    case 'telegraph': return { type, effect: 'stunTowers', radius: 11, duration: 3, delay: 1.8 };
    case 'summon': return { type, into: MINIONS[i % 3], count: 6 };
    case 'shield': return { type, amount: 0.2 };
    case 'speed': return { type, mul: 1.4 };
    case 'teleport': return { type, distance: 14 };
    case 'regen': return { type, amount: 0.15, duration: 6 };
    case 'cloak': return { type, duration: 5 };
    case 'immune': return { type, types: IMMUNE_SETS[rng.int(0, IMMUNE_SETS.length - 1)], duration: 6 };
    case 'armor': return { type, add: 0.3, duration: 8 };
    case 'dash': return { type, mul: 2, duration: 3 };
    case 'drainCash': return { type, pct: 0.15 };
    case 'portal': return { type, into: MINIONS[(i + 1) % 3], count: 3 };
    case 'healPulse': return { type, radius: 9, amount: 0.25 };
    case 'snipe': return { type, radius: 4, duration: 4, delay: 2 };
    case 'undying': return { type, hp: 0.3 };
    case 'splitOnDeath': return { type, into: MINIONS[(i + 2) % 3], count: 4 };
    default: throw new Error(type);
  }
}

const PHASE_NAMES = {
  teleport: 'Rift Step', regen: 'Rotbloom', cloak: 'Shroud', immune: 'Warded Hide', armor: 'Iron Shell', dash: 'Stampede', drainCash: 'Tithe',
  portal: 'Gateburst', healPulse: 'Mending Pulse', snipe: 'Marked Strike', undying: 'Grave Pact', splitOnDeath: 'Brood Heart',
  telegraph: 'Rift Stomp', summon: 'Swarm Call', shield: 'Stone Skin', speed: 'Enraged',
};

/** All 3-type sets with >= 2 new mechanics, in a seeded order that spreads every new mechanic evenly. */
function kits(n, rng) {
  const all = [];
  const pool = [...NEW, ...OLD];
  for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) for (let c = b + 1; c < pool.length; c++) {
    const set = [pool[a], pool[b], pool[c]];
    if (set.filter((x) => NEW.includes(x)).length >= 2) all.push(set);
  }
  // shuffle, then greedily pick the kit whose mechanics are used least so far
  for (let i = all.length - 1; i > 0; i--) { const j = rng.int(0, i); [all[i], all[j]] = [all[j], all[i]]; }
  const use = Object.fromEntries(pool.map((x) => [x, 0]));
  const out = [];
  while (out.length < n) {
    let best = null;
    let bestScore = Infinity;
    for (const k of all) {
      if (out.includes(k)) continue;
      const s = k.reduce((acc, x) => acc + use[x] * (NEW.includes(x) ? 1 : 1.6), 0);
      if (s < bestScore) { bestScore = s; best = k; }
    }
    out.push(best);
    for (const x of best) use[x]++;
  }
  return out;
}

export function buildBosses(count = 40) {
  const rng = new Rng('mechanics_b1');
  const names = new Set();
  return kits(count, rng).map((kit, i) => {
    // order: the signature mechanic first (it names the boss), finishers (undying / split) last
    const order = [...kit].sort((a, b) => Number(['undying', 'splitOnDeath'].includes(a)) - Number(['undying', 'splitOnDeath'].includes(b)));
    const lead = order.find((x) => NEW.includes(x));
    let name;
    do name = `${SYL1[rng.int(0, SYL1.length - 1)]}${SYL2[rng.int(0, SYL2.length - 1)]}`; while (names.has(name));
    names.add(name);
    const phases = [0.75, 0.5, 0.25].map((at, p) => ({ at, name: PHASE_NAMES[order[p]], actions: [params(order[p], i + p, rng)] }));
    // a little pressure in the middle phase so every fight still has adds
    if (!kit.includes('summon') && !kit.includes('portal') && !kit.includes('splitOnDeath')) phases[1].actions.push({ type: 'summon', into: MINIONS[i % 3], count: 4 });
    const types = new Set(phases.flatMap((ph) => ph.actions.map((a) => a.type)));
    const ehp = [...types].reduce((acc, t) => acc + (EHP[t] || 0), 0);
    const fast = types.has('dash') || types.has('teleport');
    const kitModel = i < KIT_BOSSES ? { kit: { body: MECHANIC_BODY[lead], parts: [...new Set(order.concat([...types].filter((t) => !order.includes(t))).map((t) => MECHANIC_PART[t]))], accent: KIT_ACCENT[i % KIT_ACCENT.length], tint: KIT_TINT[(Math.floor(i / 5) + i) % KIT_TINT.length] } } : null;
    const m = MODELS[i % MODELS.length];
    const palette = m.palettes ? m.palettes[Math.floor(i / MODELS.length) % m.palettes.length] : undefined;
    return {
      id: `boss_mech_${String(i + 1).padStart(2, '0')}`,
      name: `${name}, ${TITLE[lead]}`,
      archetype: 'boss',
      boss: true,
      hp: Math.round(BASE_HP / (1 + ehp) / 10) * 10,
      speed: fast ? 1.35 : 1.55,
      armor: types.has('armor') ? 0.15 : 0.25,
      reward: 300,
      leak: 1000,
      size: 3.2,
      resist: RESISTS[i % RESISTS.length],
      model: kitModel || (m.builder ? { glb: m.glb, builder: m.builder } : { glb: m.glb, ...(palette ? { palette } : {}) }),
      description: `${name} ${order.map((x) => PHRASE[x]).join(', then ')}.`,
      phases,
      generated: { batch: 'mechanics_b1', kit: [...types].sort() },
    };
  });
}

const bosses = buildBosses(40);
const out = { $doc: 'GENERATED by tools/gen-bosses.mjs (do not edit by hand). 40 bosses, each with a different set of phase mechanics.', enemies: bosses };
const json = `${JSON.stringify(out, null, 1)}\n`;
const path = new URL('../data/bosses/mechanics_b1.json', import.meta.url);
if (process.argv.includes('--check')) {
  const cur = readFileSync(path, 'utf8');
  if (cur !== json) { console.error('data/bosses/mechanics_b1.json is out of date: run node tools/gen-bosses.mjs'); process.exit(1); }
  console.log('mechanics_b1.json up to date');
} else {
  writeFileSync(path, json);
  const sets = new Set(bosses.map((b) => b.generated.kit.join('+')));
  const use = {};
  for (const b of bosses) for (const t of b.generated.kit) use[t] = (use[t] || 0) + 1;
  console.log(`wrote ${bosses.length} bosses, ${sets.size} distinct kits`);
  console.log(Object.entries(use).map(([k, v]) => `${k} ${v}`).join(', '));
}
