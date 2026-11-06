// node tools/count-content.mjs [--json]: honest content counts for docs/COMPLETION.md.
// For every content type: (1) total units, (2) mechanically distinct units, (3) distinct models.
// (2) groups units by a "mechanic signature" (behaviour keys, damage type, targeting, status effects,
// flags, boss phase actions) and counts the groups, so colour or stat variants of the same mechanic
// count once. Numbers (damage, HP, speed, range, cost, resist amounts) never make a unit distinct;
// only immunities (resist 0) do.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../src/core/content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const content = await loadContent(async (p) => JSON.parse(await readFile(join(root, 'data', p), 'utf8')));

const modelKey = (m) => (m ? m.glb || m.builder || JSON.stringify(m) : 'none');
const SCALE = new Set(['damage', 'rate', 'range', 'cost', 'speed', 'hp', 'reward', 'leak', 'size', 'altitude', 'armorPierce', 'splash', 'radius', 'duration', 'amount', 'mul', 'count', 'delay', 'interval', 'chance', 'value', 'max', 'pct', 'dps', 'every', 'at']);

/** Keys of an object tree that describe behaviour (not magnitudes). */
function shape(o, prefix = '') {
  if (o === null || typeof o !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('$') || (SCALE.has(k) && typeof v === 'number')) continue;
    if (v === false || v === null || v === 0) continue;
    const key = prefix + k;
    if (typeof v === 'string') out.push(`${key}=${v}`);
    else if (typeof v === 'object' && !Array.isArray(v)) { out.push(key); out.push(...shape(v, `${key}.`)); }
    else if (Array.isArray(v)) out.push(`${key}[]`);
    else out.push(key);
  }
  return out;
}

function towerSig(t) {
  const s = { ...t.stats };
  delete s.projectile; // visual
  return [t.placement, ...shape(s)].sort().join('|');
}
function enemySig(e) {
  const imm = Object.entries(e.resist || {}).filter(([, v]) => v === 0).map(([k]) => `immune.${k}`);
  const keys = shape(Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'name', 'description', 'model', 'resist', 'generated', 'phases', 'boss', 'archetype', 'intro'].includes(k))));
  return [e.archetype, ...keys, ...imm].sort().join('|');
}
function bossSig(e) {
  const acts = new Set();
  for (const p of e.phases || []) for (const a of p.actions || []) acts.add(`${a.type}${a.effect ? `:${a.effect}` : ''}`);
  return [enemySig(e), ...[...acts].sort()].join('#');
}

function count(units, sig) {
  const groups = new Map();
  for (const u of units) { const k = sig(u); groups.set(k, (groups.get(k) || 0) + 1); }
  return { total: units.length, distinct: groups.size, models: new Set(units.map((u) => modelKey(u.model))).size };
}

const towers = [...content.towers.values()];
const all = [...content.enemies.values()];
const bosses = all.filter((e) => e.boss);
const enemies = all.filter((e) => !e.boss);
const heroes = [...content.heroes.values()];
const skills = new Set(heroes.flatMap((h) => h.abilities));
const bossActs = new Set(bosses.flatMap((b) => (b.phases || []).flatMap((p) => (p.actions || []).map((a) => `${a.type}${a.effect ? `:${a.effect}` : ''}`))));
const maps = [...content.maps.values()];
const themes = new Set(maps.map((m) => m.theme || m.id));

const res = {
  towers: { ...count(towers, towerSig), war: towers.filter((t) => t.faction === 'war').length, magic: towers.filter((t) => t.faction === 'magic').length, classes: [...new Set(towers.map((t) => t.class))].sort() },
  enemies: count(enemies, enemySig),
  bosses: { ...count(bosses, bossSig), phaseMechanics: [...bossActs].sort() },
  maps: { total: maps.length, themes: themes.size, themeList: [...themes].sort() },
  heroes: { total: heroes.length, models: new Set(heroes.map((h) => JSON.stringify(h.model))).size, skills: skills.size, skillsPerHero: heroes.map((h) => h.abilities.length) },
  modes: content.modes.size,
  quests: (content.quests?.daily?.length || 0) + (content.quests?.story?.length || 0) + (content.quests?.weekly?.length || 0),
  achievements: content.quests?.achievements?.length || 0,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
else {
  for (const k of ['towers', 'enemies', 'bosses']) console.log(`${k.padEnd(8)} total ${res[k].total}  distinct mechanics ${res[k].distinct}  models ${res[k].models}`);
  console.log(`towers   war ${res.towers.war} magic ${res.towers.magic}; classes ${res.towers.classes.join(', ')}`);
  console.log(`bosses   ${res.bosses.phaseMechanics.length} phase mechanics: ${res.bosses.phaseMechanics.join(', ')}`);
  console.log(`maps     ${res.maps.total} on ${res.maps.themes} themes (${res.maps.themeList.join(', ')})`);
  console.log(`heroes   ${res.heroes.total} (${res.heroes.models} looks), ${res.heroes.skills} skills, per hero ${res.heroes.skillsPerHero.join('/')}`);
  console.log(`modes ${res.modes}, quests ${res.quests}, achievements ${res.achievements}`);
}
