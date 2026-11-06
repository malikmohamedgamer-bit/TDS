// node tools/gen-enemies.mjs [--check]: enemy batch "mechanics_b1" (ROADMAP Chunk 2). 158 enemies, each a body
// from the boss kit (src/engine/bossKit.js, shrunk with model.scale) plus 1-3 traits: heal, shield, stealth,
// split, summon, armor, regen, flying, blink (teleport), burst (speed surge), stun (attack), immune (one damage
// type does nothing). Every trait set is used once, so no two enemies share a mechanic set; the part that shows
// each trait is fixed, so no two share a model either. Health is divided by the traits' effective-health cost,
// so a wave's health budget stays comparable. Writes data/enemies/mechanics_b1.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Rng } from '../src/core/rng.js';

const BODIES = { brute: { h: 3.3, speed: 3.4, hp: 1.15, noun: ['Brute', 'Ogre', 'Hulk'] }, strider: { h: 3.0, speed: 5.6, hp: 0.8, noun: ['Stalker', 'Runner', 'Charger'] }, wraith: { h: 3.4, speed: 4.4, hp: 0.9, noun: ['Wraith', 'Specter', 'Phantom'] }, colossus: { h: 3.6, speed: 2.7, hp: 1.5, noun: ['Golem', 'Bulwark', 'Titan'] }, crawler: { h: 2.4, speed: 4.6, hp: 0.95, noun: ['Crawler', 'Broodling', 'Skulker'] } };
const IMMUNE_TYPES = ['physical', 'fire', 'ice', 'lightning', 'arcane', 'poison', 'explosive', 'holy', 'dark'];
const TIER_HP = [30, 45, 65, 90, 125, 170, 230, 310, 420];

/** trait: stat patch, kit part, adjective, effective-health cost, archetype if it leads, preferred bodies. */
const TRAITS = {
  heal: { part: 'crystals', adj: 'Mending', cost: 0.2, arch: 'healer', bodies: ['crawler', 'brute'], patch: () => ({ heal: { radius: 6, amount: 0.06, interval: 3 } }) },
  shield: { part: 'shieldRing', adj: 'Warded', cost: 0.25, arch: 'shielded', bodies: ['colossus', 'brute'], patch: (e) => ({ shield: Math.round(e.hp * 0.8) }) },
  stealth: { part: 'veil', adj: 'Veiled', cost: 0.1, arch: 'stealth', bodies: ['wraith'], patch: () => ({ stealth: true }) },
  split: { part: 'eggSacs', adj: 'Brooding', cost: 0.15, arch: 'splitter', bodies: ['crawler'], patch: () => ({ split: { into: 'mite', count: 3 } }) },
  summon: { part: 'totems', adj: 'Calling', cost: 0.2, arch: 'summoner', bodies: ['crawler', 'wraith', 'brute'], patch: () => ({ summon: { into: 'mite', count: 2, interval: 6 } }) },
  armor: { part: 'armor', adj: 'Plated', cost: 0.3, arch: 'armored', bodies: ['colossus', 'brute'], patch: () => ({ armor: 0.4 }) },
  regen: { part: 'skulls', adj: 'Undying', cost: 0.15, arch: 'regenerating', bodies: ['brute', 'colossus'], patch: () => ({ regen: 0.03 }) },
  flying: { part: 'wings', adj: 'Winged', cost: 0.1, arch: 'flying', bodies: ['wraith'], patch: () => ({ flying: true, altitude: 3.5 }) },
  blink: { part: 'riftShards', adj: 'Rift', cost: 0.15, arch: 'fast', bodies: ['wraith', 'strider'], patch: () => ({ blink: { every: 6, distance: 7 } }) },
  burst: { part: 'horns', adj: 'Raging', cost: 0.1, arch: 'fast', bodies: ['strider'], patch: () => ({ burst: { every: 7, mul: 2.2, duration: 1.5 } }) },
  stun: { part: 'hammer', adj: 'Stunning', cost: 0.1, arch: 'summoner', bodies: ['colossus', 'brute'], patch: () => ({ attack: { range: 9, damage: 0, interval: 7, stun: 1.5 } }) },
  immune: { part: 'ward', adj: 'Hexed', cost: 0.15, arch: 'ground', bodies: ['colossus', 'wraith', 'strider'], patch: null },
};
const ORDER = Object.keys(TRAITS);
// leading archetype: the first trait in this priority (so one trait set has exactly one archetype)
const LEAD = ['flying', 'stealth', 'split', 'summon', 'heal', 'shield', 'armor', 'regen', 'blink', 'burst', 'stun', 'immune'];
const ACCENTS = ['crimson', 'magenta', 'violet', 'toxic', 'ember', 'frost'];
const TINTS = ['ash', 'bog', 'rust', 'glacier', 'dusk', 'sand'];
const ACCENT_BY_TYPE = { physical: 'crimson', fire: 'ember', ice: 'frost', lightning: 'magenta', arcane: 'violet', poison: 'toxic', explosive: 'ember', holy: 'frost', dark: 'violet' };

function sets(n, rng) {
  const all = [];
  for (let a = 0; a < ORDER.length; a++) {
    all.push([ORDER[a]]);
    for (let b = a + 1; b < ORDER.length; b++) {
      all.push([ORDER[a], ORDER[b]]);
      for (let c = b + 1; c < ORDER.length; c++) all.push([ORDER[a], ORDER[b], ORDER[c]]);
    }
  }
  // flying conflicts with stealth-cloak bodies' lead only by archetype; heal + summon + split triples are pointless
  const ok = all.filter((s) => !(s.includes('flying') && s.includes('split')) && !(s.includes('heal') && s.includes('regen')));
  for (let i = ok.length - 1; i > 0; i--) { const j = rng.int(0, i); [ok[i], ok[j]] = [ok[j], ok[i]]; }
  const use = Object.fromEntries(ORDER.map((t) => [t, 0]));
  const out = [];
  const taken = new Set();
  while (out.length < n) {
    let best = null;
    let bestScore = Infinity;
    for (const s of ok) {
      const key = s.join('+');
      if (taken.has(key)) continue;
      // prefer smaller sets early (lower tiers) and rarely used traits
      const score = s.reduce((acc, t) => acc + use[t], 0) + s.length * 0.4;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    taken.add(best.join('+'));
    out.push(best);
    for (const t of best) use[t]++;
  }
  return out;
}

const ADJ_NAMES = new Set();
function nameFor(traits, body, i) {
  const ordered = LEAD.filter((t) => traits.includes(t));
  const nouns = BODIES[body].noun;
  const adjs = ordered.map((t) => TRAITS[t].adj);
  for (let k = 0; k < 12; k++) {
    const noun = nouns[(i + k) % nouns.length];
    const nm = adjs.length === 1 ? `${adjs[0]} ${noun}` : adjs.length === 2 ? `${adjs[0]} ${adjs[1]} ${noun}` : `${adjs[0]} ${noun} of the ${adjs[1]} ${adjs[2]}`;
    if (!ADJ_NAMES.has(nm)) { ADJ_NAMES.add(nm); return nm; }
  }
  const nm = `${adjs.join(' ')} ${nouns[0]} ${i}`;
  ADJ_NAMES.add(nm);
  return nm;
}

export function buildEnemies(count = 158) {
  ADJ_NAMES.clear();
  const rng = new Rng('enemies_mechanics_b1');
  const all = sets(count, rng);
  // spread over tiers by set size and index: small sets weak, big sets strong
  const order = all.map((s, i) => ({ s, i })).sort((a, b) => a.s.length - b.s.length || a.i - b.i);
  const kitSeen = new Set();
  const list = order.map(({ s }, idx) => {
    const traits = LEAD.filter((t) => s.includes(t));
    const lead = traits[0];
    const tier = Math.min(TIER_HP.length - 1, Math.floor((idx / count) * TIER_HP.length));
    const pref = TRAITS[lead].bodies;
    // body: lead's preferred bodies, rotating; flying and stealth need the floating wraith
    let body = pref[idx % pref.length];
    if (traits.includes('flying') || traits.includes('stealth')) body = 'wraith';
    if (traits.includes('split')) body = 'crawler';
    const B = BODIES[body];
    const cost = traits.reduce((acc, t) => acc + TRAITS[t].cost, 0);
    const hp = Math.max(8, Math.round((TIER_HP[tier] * B.hp) / (1 + cost)));
    const e = {
      id: `mech_${String(idx + 1).padStart(3, '0')}`,
      name: nameFor(traits, body, idx),
      archetype: TRAITS[lead].arch,
      hp,
      speed: +(B.speed * (0.9 + (tier % 3) * 0.08)).toFixed(2),
      reward: Math.max(2, Math.round(hp / 8)),
      leak: Math.max(1, Math.ceil(hp / 45)),
      size: +(0.8 + tier * 0.07).toFixed(2),
    };
    let immuneType = null;
    for (const t of traits) {
      if (t === 'immune') { immuneType = IMMUNE_TYPES[(idx * 5 + 2) % IMMUNE_TYPES.length]; e.resist = { ...(e.resist || {}), [immuneType]: 0 }; } else Object.assign(e, TRAITS[t].patch(e));
    }
    if (traits.includes('flying')) e.altitude = 3.5;
    const parts = traits.map((t) => TRAITS[t].part);
    const height = 1.0 + tier * 0.11;
    const accent = immuneType ? ACCENT_BY_TYPE[immuneType] : ACCENTS[idx % ACCENTS.length];
    const tint = TINTS[(idx + Math.floor(idx / 6)) % TINTS.length];
    const kit = { body, parts, accent, tint };
    const key = `${body}|${[...parts].sort().join(',')}`;
    if (kitSeen.has(key)) throw new Error(`duplicate enemy model ${key}`);
    kitSeen.add(key);
    e.model = { kit, scale: +(height / B.h).toFixed(3) };
    e.resist = { ...(e.resist || {}), dark: e.resist?.dark ?? 1 };
    if (e.resist.dark === 1) delete e.resist.dark;
    e.description = `${e.name}: ${traits.map((t) => ({ heal: 'mends nearby enemies', shield: 'carries a ward shield', stealth: 'hides from towers without detection', split: 'bursts into mites when killed', summon: 'calls mites', armor: 'wears heavy plate', regen: 'regrows health', flying: 'flies over the road', blink: 'blinks forward along the road', burst: 'surges in sudden bursts of speed', stun: 'stuns towers from range', immune: `ignores ${immuneType} damage` }[t])).join(', ')}.`;
    e.generated = { batch: 'mechanics_e1', traits: [...traits].sort(), tier: tier + 1 };
    return e;
  });
  return list;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const enemies = buildEnemies(158);
  const out = { $doc: `GENERATED by tools/gen-enemies.mjs (do not edit by hand). ${enemies.length} enemies: boss-kit bodies plus 1-3 mechanics, each trait set used once.`, enemies };
  const json = `${JSON.stringify(out, null, 1)}\n`;
  const path = new URL('../data/enemies/mechanics_b1.json', import.meta.url);
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(path, 'utf8'); } catch { /* missing */ }
    if (cur !== json) { console.error('data/enemies/mechanics_b1.json is out of date: run node tools/gen-enemies.mjs'); process.exit(1); }
    console.log('enemies mechanics_b1 up to date');
  } else {
    writeFileSync(path, json);
    const use = {};
    for (const e of enemies) for (const t of e.generated.traits) use[t] = (use[t] || 0) + 1;
    console.log(`wrote ${enemies.length} enemies`, JSON.stringify(use));
  }
}
