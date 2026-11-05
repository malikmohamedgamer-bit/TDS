// node tools/gen-content.mjs: content batch generator. Every new unit is derived from an existing,
// balanced template (data/towers, data/enemies, data/bosses) plus a pack model and a palette:
// - towers: stat multipliers; the price is recomputed from the same value measure the balance work
//   used (DPS x splash x road coverage), so a variant keeps its template's cost-efficiency; the
//   upgrade tree is the template's with costs scaled the same way;
// - enemies: HP x speed kept close to the template's, so wave budgets stay comparable;
// - bosses: template phases, HP and speed variants.
// Writes data/towers/kenney_b1.json, data/enemies/kenney_b1.json, data/bosses/kenney_b1.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { value as botValue } from '../src/sim/bot.js';

const read = (p) => JSON.parse(readFileSync(`data/${p}`, 'utf8'));
const towers = new Map([...read('towers/war.json').towers, ...read('towers/magic.json').towers].map((t) => [t.id, t]));
const enemies = new Map(read('enemies/blight.json').enemies.map((e) => [e.id, e]));
const bosses = new Map([...read('bosses/gravemaw.json').enemies, ...read('bosses/thornmother.json').enemies].map((e) => [e.id, e]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const PRICE_MUL = Number(process.env.PRICE_MUL || 1);
const round25 = (n) => Math.max(100, Math.round(n / 25) * 25);

/** Value as the balance bot sees it (road coverage ~ range on these maps, saturating near 32 m). */
function towerValue(s) {
  return botValue(s, Math.pow(Math.min(1, (s.range || 8) / 32), 0.9), 10);
}


// [id, name, template, glb, faction, palette, class, desc, stat ops {mul, set, add}]
const TOWERS = [
  ['spellbolt_ballista', 'Spellbolt Ballista', 'marksman', 'k_weapon_ballista', 'magic', 'magic', 'sniper', 'Enchanted bolts that pierce armour at long range.', { set: { damageType: 'arcane' } }],
  ['repeater_ballista', 'Repeater Ballista', 'marksman', 'k_weapon_ballista', 'war', 'war', 'sniper', 'Lighter bolts, twice as fast.', { mul: { damage: 0.5, rate: 2.1 }, add: { range: -4 } }],
  ['field_cannon', 'Field Cannon', 'rocket_battery', 'k_weapon_cannon', 'war', 'war', 'area', 'Iron balls that burst on the road. Ground only.', { mul: { damage: 1.25, rate: 0.85 }, set: { 'targets.air': false, projectile: { kind: 'grenade', speed: 24 } }, add: { splash: -1 } }],
  ['heavy_mortar', 'Heavy Mortar', 'rocket_battery', 'k_weapon_cannon', 'war', 'war', 'area', 'Slow, huge craters. Ground only.', { mul: { damage: 2.2, rate: 0.5 }, set: { 'targets.air': false, projectile: { kind: 'grenade', speed: 20 } }, add: { range: 4, splash: 0.5 } }],
  ['boulder_catapult', 'Boulder Catapult', 'ember_adept', 'k_weapon_catapult', 'war', 'war', 'area', 'Lobs boulders into groups.', { mul: { damage: 1.6, rate: 0.7 }, set: { damageType: 'physical', burn: null, projectile: { kind: 'grenade', speed: 18 } }, add: { range: 3 } }],
  ['firepot_catapult', 'Firepot Catapult', 'ember_adept', 'k_weapon_catapult', 'magic', 'magic', 'area', 'Flaming pots that leave the road burning.', { mul: { damage: 1.3, rate: 0.75 }, add: { range: 3 } }],
  ['auto_turret', 'Auto Turret', 'gunner', 'k_weapon_turret', 'war', 'war', 'ground', 'Belt-fed turret. Shreds swarms and flyers.', {}],
  ['twin_turret', 'Twin Turret', 'gunner', 'k_weapon_turret', 'war', 'war', 'ground', 'Two barrels, longer reach, a little weaker per shot.', { mul: { damage: 0.75, rate: 1.4 }, add: { range: 2 } }],
  ['bolt_thrower', 'Bolt Thrower', 'rifleman', 'k_siege_ballista', 'war', 'war', 'ground', 'Siege bolts that punch through armour.', { mul: { damage: 2.6, rate: 0.45 }, set: { armorPierce: 0.5 }, add: { range: 3 } }],
  ['siege_bolter', 'Siege Bolter', 'rifleman', 'k_siege_ballista', 'magic', 'magic', 'ground', 'Rune-charged bolts. Sees hidden enemies.', { mul: { damage: 2.2, rate: 0.5 }, set: { damageType: 'arcane', detection: true }, add: { range: 3 } }],
  ['frost_catapult', 'Frost Catapult', 'frost_weaver', 'k_siege_catapult', 'magic', 'magic', 'support', 'Hurls ice that slows a crowd.', { mul: { damage: 1.6, rate: 0.7 }, add: { range: 3, splash: 0.6 } }],
  ['hex_catapult', 'Hex Catapult', 'frost_weaver', 'k_siege_catapult', 'magic', 'magic', 'support', 'Cursed stones: struck enemies take more damage.', { mul: { damage: 1.4, rate: 0.7 }, set: { damageType: 'dark', slow: null, mark: { amount: 0.15, duration: 3 } }, add: { range: 3 } }],
  ['trebuchet', 'Trebuchet', 'marksman', 'k_siege_trebuchet', 'war', 'war', 'sniper', 'Enormous range, heavy splash, slow. Ground only.', { mul: { damage: 1.8, rate: 0.55 }, set: { splash: 2.5, 'targets.air': false, projectile: { kind: 'grenade', speed: 22 } }, add: { range: 6 } }],
  ['fire_trebuchet', 'Fire Trebuchet', 'marksman', 'k_siege_trebuchet', 'war', 'war', 'sniper', 'Burning payloads at extreme range. Ground only.', { mul: { damage: 1.4, rate: 0.55 }, set: { splash: 2.5, damageType: 'fire', burn: { dps: 12, duration: 3 }, 'targets.air': false, projectile: { kind: 'fireball', speed: 22 } }, add: { range: 6 } }],
  ['arcane_spire', 'Arcane Spire', 'storm_caller', 'k_tower_round_build_c', 'magic', 'magic', 'hybrid', 'A mage tower whose bolts leap between enemies.', { set: { damageType: 'arcane' } }],
  ['sun_spire', 'Sun Spire', 'storm_caller', 'k_tower_round_build_c', 'magic', 'magic', 'hybrid', 'Holy light, fewer leaps, much harder hits.', { mul: { damage: 1.9 }, set: { damageType: 'holy', 'chain.count': 2 } }],
  ['guard_tower', 'Guard Tower', 'rifleman', 'k_tower_square_build_c', 'war', 'war', 'ground', 'Riflemen behind stone walls: steady, long reach.', { mul: { damage: 1.25, rate: 1.0 }, add: { range: 3 } }],
  ['watch_tower', 'Watch Tower', 'rifleman', 'k_tower_square_build_c', 'war', 'war', 'ground', 'Spotters see hidden enemies and hit flyers.', { set: { detection: true, 'targets.air': true } }],
  // boss killer (BUGS.md #35): the batch had splash and chip damage but nothing that deletes a boss
  ['lancer_mech', 'Lancer Mech', 'marksman', 'q_leela', 'war', 'war', 'sniper', 'Walking rail lance: armour-piercing shots at the strongest enemy, triple damage to bosses. Ground only.', { mul: { damage: 1.6, rate: 0.6 }, set: { armorPierce: 0.8, bossDamage: 3 }, add: { range: 2 }, price: 500 }],
];

function setPath(o, path, v) {
  const keys = path.split('.');
  let t = o;
  while (keys.length > 1) { const k = keys.shift(); t[k] = t[k] && typeof t[k] === 'object' ? t[k] : {}; t = t[k]; }
  if (v === null) delete t[keys[0]]; else t[keys[0]] = clone(v);
}

const outTowers = TOWERS.map(([id, name, tpl, glb, faction, palette, cls, desc, ops]) => {
  const T = towers.get(tpl);
  if (!T) throw new Error(`no template ${tpl}`);
  const t = clone(T);
  Object.assign(t, { id, name, faction, class: cls, description: desc, model: { glb, palette } });
  for (const [k, v] of Object.entries(ops.mul || {})) t.stats[k] = +(t.stats[k] * v).toFixed(3);
  for (const [k, v] of Object.entries(ops.add || {})) t.stats[k] = +((t.stats[k] || 0) + v).toFixed(2);
  for (const [k, v] of Object.entries(ops.set || {})) setPath(t.stats, k, v);
  // priced by the bot's own value estimate: every variant is exactly as cost-efficient as its template
  // to the balance bot (PRICE_MUL stays 1; it exists for experiments)
  // ops.price: a deliberate role price instead (the boss killer is efficient on purpose, like the
  // core Marksman; the bot buys greedily and never saves up for an expensive specialist)
  const ratio = ops.price ? ops.price / T.cost : (towerValue(t.stats) / towerValue(T.stats)) * PRICE_MUL;
  t.cost = round25(T.cost * ratio);
  const scaleUp = (st) => { st.cost = round25(st.cost * ratio); };
  for (const st of t.upgrades.linear) scaleUp(st);
  for (const br of Object.values(t.upgrades.branches)) for (const st of br.steps) { scaleUp(st); if (st.evolve) st.evolve = `${st.evolve === T.upgrades.branches.A.steps.at(-1).evolve || st.evolve === T.upgrades.branches.B.steps.at(-1).evolve ? `${name} ${br.name}` : st.evolve}`; }
  t.generated = { batch: 'kenney_b1', template: tpl, valueRatio: +ratio.toFixed(3) };
  return t;
});

// enemies: [base model, template, name, scheme variants]
const VARIANTS = {
  blight: { prefix: 'Blighted', hp: 1, speed: 1 },
  blight_frost: { prefix: 'Frostbitten', hp: 1.25, speed: 0.8, resist: { ice: 0.5, fire: 1.3 } },
  blight_ember: { prefix: 'Cinder', hp: 0.8, speed: 1.25, resist: { fire: 0.5, ice: 1.3 } },
  blight_toxic: { prefix: 'Toxic', hp: 0.9, speed: 1, regen: 0.02, resist: { poison: 0.4 } },
};
const ENEMIES = [
  ['k_character_zombie', 'husk', 'Rotwalker', ['blight', 'blight_toxic']],
  ['k_character_skeleton', 'skitter', 'Bone Runner', ['blight', 'blight_ember']],
  ['k_character_ghost', 'shade', 'Wailing Shade', ['blight', 'blight_frost']],
  ['k_character_vampire', 'bulwark', 'Night Warden', ['blight', 'blight_ember']],
  ['k_character_keeper', 'mender', 'Grave Keeper', ['blight', 'blight_toxic']],
  ['k_enemy_ufo_a', 'gloomwing', 'Rift Saucer', ['blight', 'blight_frost']],
  ['k_enemy_ufo_b', 'gloomwing', 'Rift Skimmer', ['blight', 'blight_ember']],
  ['k_enemy_ufo_c', 'ironshell', 'Rift Bastion', ['blight', 'blight_frost'], { flying: true, altitude: 3 }],
  ['k_enemy_ufo_d', 'caller', 'Rift Beacon', ['blight', 'blight_toxic'], { flying: true, altitude: 3, attack: null }],
];
const outEnemies = [];
for (const [glb, tpl, base, schemes, extra = {}] of ENEMIES) {
  const T = enemies.get(tpl);
  for (const sc of schemes) {
    const V = VARIANTS[sc];
    const e = clone(T);
    const id = `${glb.replace(/^k_(character_|enemy_)?/, '')}_${sc.replace('blight_', '').replace('blight', 'base')}`;
    Object.assign(e, { id, name: `${V.prefix} ${base}`, model: { glb, palette: sc }, hp: Math.round(T.hp * V.hp), speed: +(T.speed * V.speed).toFixed(2) });
    if (V.regen) e.regen = Math.max(e.regen || 0, V.regen);
    if (V.resist) e.resist = { ...(e.resist || {}), ...V.resist };
    for (const [k, v] of Object.entries(extra)) { if (v === null) delete e[k]; else e[k] = v; }
    e.description = `${V.prefix} ${base.toLowerCase()} (${T.name} family). ${T.description}`;
    e.generated = { batch: 'kenney_b1', template: tpl };
    outEnemies.push(e);
  }
}

// bosses: [base model, template, name, scheme, hp mul, speed mul]
const BOSSES = [
  ['k_siege_tower', 'gravemaw', 'Ruinspire, the Walking Siege', 'blight', 1.05, 0.9],
  ['k_siege_tower', 'thornmother', 'Frostspire Colossus', 'blight_frost', 1.15, 0.85],
  ['k_siege_ram', 'gravemaw', 'Gatebreaker', 'blight_ember', 0.85, 1.2],
  ['k_siege_ram', 'thornmother', 'Plaguebreaker', 'blight_toxic', 0.95, 1.0],
  ['k_truck', 'gravemaw', 'Scrapjaw Hauler', 'blight', 0.9, 1.15],
  ['k_truck', 'thornmother', 'Cinder Hauler', 'blight_ember', 0.85, 1.2],
  ['k_tractor_shovel', 'gravemaw', 'Gravedigger Engine', 'blight', 1.0, 1.0],
  ['k_tractor_shovel', 'thornmother', 'Rimeshovel', 'blight_frost', 1.1, 0.9],
  ['k_garbage_truck', 'gravemaw', 'The Refuse King', 'blight_toxic', 1.1, 0.95],
  ['k_garbage_truck', 'thornmother', 'Ashmonger', 'blight_ember', 1.0, 1.05],
];
const outBosses = BOSSES.map(([glb, tpl, name, sc, hp, sp], i) => {
  const T = bosses.get(tpl);
  const b = clone(T);
  Object.assign(b, { id: `boss_${glb.replace(/^k_/, '')}_${i}`, name, model: { glb, palette: sc }, hp: Math.round(T.hp * hp), speed: +(T.speed * sp).toFixed(2) });
  if (VARIANTS[sc].resist) b.resist = { ...(b.resist || {}), ...VARIANTS[sc].resist };
  b.description = `${name}: a Blight war machine (${T.name.split(',')[0]} pattern).`;
  b.generated = { batch: 'kenney_b1', template: tpl };
  return b;
});

const doc = (what) => `Generated by tools/gen-content.mjs (content batch kenney_b1): ${what}. Edit the generator, not this file.`;
writeFileSync('data/towers/kenney_b1.json', `${JSON.stringify({ $doc: doc('towers on Kenney CC0 models, derived from balanced templates'), towers: outTowers }, null, 1)}\n`);
writeFileSync('data/enemies/kenney_b1.json', `${JSON.stringify({ $doc: doc('Blight enemies on Kenney CC0 models, colour and stat variants'), enemies: outEnemies }, null, 1)}\n`);
writeFileSync('data/bosses/kenney_b1.json', `${JSON.stringify({ $doc: doc('Blight war-machine bosses on Kenney CC0 models'), enemies: outBosses }, null, 1)}\n`);
console.log(`towers ${outTowers.length}, enemies ${outEnemies.length}, bosses ${outBosses.length}`);
for (const t of outTowers) console.log(`  ${t.id.padEnd(20)} ${t.rarity.padEnd(9)} $${t.cost} (x${t.generated.valueRatio})`);
