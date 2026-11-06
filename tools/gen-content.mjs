// node tools/gen-content.mjs: content batch generator. Every new unit is derived from an existing,
// balanced template (data/towers, data/enemies, data/bosses) plus a pack model and a palette:
// - towers: stat multipliers; the price is recomputed from the same value measure the balance work
//   used (DPS x splash x road coverage), so a variant keeps its template's cost-efficiency; the
//   upgrade tree is the template's with costs scaled the same way;
// - enemies: HP x speed kept close to the template's, so wave budgets stay comparable;
// - bosses: template phases, HP and speed variants.
// Writes data/{towers,enemies,bosses}/kenney_b1.json (Kenney models, colour variants) and
// data/{towers,enemies,bosses}/quaternius_b1.json (one distinct Quaternius model per unit).
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

const makeTower = (batch) => ([id, name, tpl, glb, faction, palette, cls, desc, ops]) => {
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
  // aura towers have no direct value (0): a variant with unchanged stats keeps its template's price
  const tv = towerValue(T.stats);
  const ratio = ops.price ? ops.price / T.cost : tv > 0 ? (towerValue(t.stats) / tv) * PRICE_MUL : 1;
  t.cost = round25(T.cost * ratio);
  const scaleUp = (st) => { st.cost = round25(st.cost * ratio); };
  for (const st of t.upgrades.linear) scaleUp(st);
  for (const br of Object.values(t.upgrades.branches)) for (const st of br.steps) { scaleUp(st); if (st.evolve) st.evolve = `${st.evolve === T.upgrades.branches.A.steps.at(-1).evolve || st.evolve === T.upgrades.branches.B.steps.at(-1).evolve ? `${name} ${br.name}` : st.evolve}`; }
  t.generated = { batch, template: tpl, valueRatio: +ratio.toFixed(3) };
  return t;
};
const outTowers = TOWERS.map(makeTower('kenney_b1'));

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

// ---- batch quaternius_b1: every unit has its own Quaternius model (glowing eyes, own palette in
// data/models.json); stats come from the archetype template, so mechanics and budgets carry over
const Q_TOWERS = [
  ['rifle_squad', 'Rifle Squad', 'rifleman', 'q_character_soldier', 'war', 'war', 'ground', 'A soldier on a sandbag pad: quick, accurate rifle fire at ground targets.', { mul: { damage: 1.15, rate: 1.1 }, add: { range: 1 } }],
  // Magic towers on Quaternius Ultimate Fantasy RTS buildings (the Magic side had no pack model of its own)
  ['starwatch_tower', 'Starwatch Tower', 'marksman', 'q_watchtower_second_age_3', 'magic', 'magic', 'sniper', 'Astronomers loose star-bolts at long range. Sees hidden enemies.', { set: { damageType: 'arcane', detection: true } }],
  ['sanctum_of_dawn', 'Sanctum of Dawn', 'rune_totem', 'q_temple_second_age_2', 'magic', 'magic', 'support', 'A temple whose light empowers nearby towers.', {}],
  ['spirit_barracks', 'Spirit Barracks', 'spirit_summoner', 'q_towerhouse_second_age', 'magic', 'magic', 'summoner', 'Raises spirit wardens that block the road.', {}],
];
// [model, template, id, name, hp mul, speed mul, extra fields, description]
const Q_ENEMIES = [
  ['q_blob_orc', 'bulwark', 'blight_brute', 'Blight Brute', 1, 1, {}, 'A hulking blob behind a Blight shield. Break the shield first.'],
  ['q_blob_mushnub_evolved', 'brood_sac', 'sporecap', 'Sporecap', 1, 1, {}, 'Bursts into a swarm of mites when it dies.'],
  ['q_blob_green_spiky_blob', 'ironshell', 'thornback', 'Thornback', 1, 1, {}, 'Spined hide: heavy armour, slow. Armour-piercing and magic work best.'],
  ['q_blob_ninja', 'shade', 'shadow_stalker', 'Shadow Stalker', 1, 1, {}, 'Invisible until a tower with detection spots it.'],
  ['q_flying_ghost_skull', 'gloomwing', 'skull_wisp', 'Skull Wisp', 0.85, 1.15, {}, 'A fast flying skull. Only anti-air towers can hit it.'],
  ['q_flying_dragon', 'gloomwing', 'blight_drake', 'Blight Drake', 1.6, 0.65, { altitude: 5 }, 'A heavy flying drake: slow, but takes a lot of anti-air fire.'],
  ['q_character_enemy', 'skitter', 'blight_raider', 'Blight Raider', 1.1, 0.95, {}, 'A hooded raider sprinting for your keep.'],
  ['q_zombie', 'mender', 'plague_shambler', 'Plague Shambler', 1, 1, {}, 'Heals the Blight around it. Kill it first.'],
];
// [model, template, id, name, hp mul, speed mul, extra fields]
const Q_BOSSES = [
  ['q_big_orc_skull', 'gravemaw', 'boss_skullcrusher', 'Skullcrusher, Warlord of the Rift', 1.0, 1.0, {}],
  ['q_big_demon', 'thornmother', 'boss_archfiend', 'Vharzul the Archfiend', 1.05, 0.95, { resist: { fire: 0.5, holy: 1.4 } }],
  ['q_big_mushroom_king', 'thornmother', 'boss_sporelord', 'The Sporelord', 1.1, 0.9, { resist: { poison: 0.3, fire: 1.3 } }],
  ['q_tank3', 'gravemaw', 'boss_juggernaut', 'Blight Juggernaut', 1.1, 0.9, { armor: 0.35 }],
  ['q_stan', 'gravemaw', 'boss_scrap_colossus', 'Scrap Colossus', 0.95, 1.1, { resist: { lightning: 1.4 } }],
];
// ---- batch quaternius_b2: more Ultimate Monsters, mostly new mechanic combinations
const Q2_ENEMIES = [
  ['q_blob_alien', 'mossback', 'glimmer_slime', 'Glimmer Slime', 1, 1, {}, 'Regenerates quickly. Burn or poison stops the healing.'],
  ['q_blob_wizard', 'caller', 'hex_acolyte', 'Hex Acolyte', 1, 1, {}, 'Summons mites and stuns towers it passes. Kill it first.'],
  ['q_flying_armabee_evolved', 'gloomwing', 'armored_hornet', 'Armored Hornet', 1.3, 0.85, { armor: 0.3 }, 'A flying hornet in plate: anti-air with armour pierce wins.'],
  ['q_flying_squidle', 'brood_sac', 'sky_brood', 'Sky Brood', 1, 1, { flying: true, altitude: 4 }, 'Flies over the road and bursts into mites when it dies.'],
  ['q_flying_glub_evolved', 'shade', 'veil_glider', 'Veil Glider', 0.9, 1, { flying: true, altitude: 4 }, 'Flying and invisible: needs anti-air and detection together.'],
];
const Q2_BOSSES = [
  ['q_big_yeti', 'thornmother', 'boss_frost_matriarch', 'The Frost Matriarch', 1.1, 0.85, { resist: { ice: 0.4, fire: 1.3 } }],
  ['q_big_ninja', 'gravemaw', 'boss_shadow_shogun', 'The Shadow Shogun', 0.9, 1.15, {}],
];
const qTowers = Q_TOWERS.map(makeTower('quaternius_b1'));
const qUnit = (pool, kind, batch = 'quaternius_b1') => ([glb, tpl, id, name, hp, sp, extra, desc]) => {
  const T = pool.get(tpl);
  if (!T) throw new Error(`no template ${tpl}`);
  const e = clone(T);
  Object.assign(e, { id, name, model: { glb }, hp: Math.round(T.hp * hp), speed: +(T.speed * sp).toFixed(2) });
  for (const [k, v] of Object.entries(extra)) e[k] = k === 'resist' ? { ...(e.resist || {}), ...v } : v;
  e.description = desc || `${name}: a Blight ${kind} (${T.name.split(',')[0]} pattern).`;
  e.generated = { batch, template: tpl };
  return e;
};
const qEnemies = Q_ENEMIES.map(qUnit(enemies, 'enemy'));
const qBosses = Q_BOSSES.map(qUnit(bosses, 'boss'));
const q2Enemies = Q2_ENEMIES.map(qUnit(enemies, 'enemy', 'quaternius_b2'));
const q2Bosses = Q2_BOSSES.map(qUnit(bosses, 'boss', 'quaternius_b2'));

const doc = (what, batch = 'kenney_b1') => `Generated by tools/gen-content.mjs (content batch ${batch}): ${what}. Edit the generator, not this file.`;
writeFileSync('data/towers/kenney_b1.json', `${JSON.stringify({ $doc: doc('towers on Kenney CC0 models, derived from balanced templates'), towers: outTowers }, null, 1)}\n`);
writeFileSync('data/enemies/kenney_b1.json', `${JSON.stringify({ $doc: doc('Blight enemies on Kenney CC0 models, colour and stat variants'), enemies: outEnemies }, null, 1)}\n`);
writeFileSync('data/bosses/kenney_b1.json', `${JSON.stringify({ $doc: doc('Blight war-machine bosses on Kenney CC0 models'), enemies: outBosses }, null, 1)}\n`);
writeFileSync('data/towers/quaternius_b1.json', `${JSON.stringify({ $doc: doc('towers on Quaternius CC0 models', 'quaternius_b1'), towers: qTowers }, null, 1)}
`);
writeFileSync('data/enemies/quaternius_b1.json', `${JSON.stringify({ $doc: doc('Blight enemies, one Quaternius CC0 model each', 'quaternius_b1'), enemies: qEnemies }, null, 1)}
`);
writeFileSync('data/bosses/quaternius_b1.json', `${JSON.stringify({ $doc: doc('Blight bosses, one Quaternius CC0 model each', 'quaternius_b1'), enemies: qBosses }, null, 1)}
`);
writeFileSync('data/enemies/quaternius_b2.json', `${JSON.stringify({ $doc: doc('Blight enemies, one Quaternius CC0 model each (mechanic combinations)', 'quaternius_b2'), enemies: q2Enemies }, null, 1)}
`);
writeFileSync('data/bosses/quaternius_b2.json', `${JSON.stringify({ $doc: doc('Blight bosses, one Quaternius CC0 model each', 'quaternius_b2'), enemies: q2Bosses }, null, 1)}
`);
console.log(`quaternius_b2: enemies ${q2Enemies.length}, bosses ${q2Bosses.length}`);
console.log(`kenney_b1: towers ${outTowers.length}, enemies ${outEnemies.length}, bosses ${outBosses.length}; quaternius_b1: towers ${qTowers.length}, enemies ${qEnemies.length}, bosses ${qBosses.length}`);
for (const t of [...outTowers, ...qTowers]) console.log(`  ${t.id.padEnd(20)} ${t.rarity.padEnd(9)} $${t.cost} (x${t.generated.valueRatio})`);
