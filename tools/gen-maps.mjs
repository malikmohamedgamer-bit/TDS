// node tools/gen-maps.mjs [--check] [--calibrate [id,id]] [--seeds 12]
// Builds every map in tools/map-batches.json with src/core/mapGen.js (themes: tools/map-themes.json):
// writes data/maps/<id>.json + data/waves/<id>_waves.json, lists them in data/index.json and adds a
// music key per map. Checks each map: roads valid, build space (grid spots near a road where a tower
// can really be placed), and a hero soak (no rescues, no failures, never outside the map).
// --calibrate: balance bot with the 12 core towers on Standard Normal; nudges the map's hpMul
// towards a 60-70% win rate, at most 3 measurements per map (gentle first step, then a secant),
// keeps the measured point closest to 65% and writes it back to tools/map-batches.json so the same
// command rebuilds the same maps. Maps that already have measurements are not re-run (--force).
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadContent, validateContent } from '../src/core/content.js';
import { buildMapWorld } from '../src/core/mapLayout.js';
import { generateMap, validateRoads } from '../src/core/mapGen.js';
import { soakMap } from '../src/core/soak.js';
import { Match } from '../src/sim/match.js';
import { playBot } from '../src/sim/bot.js';
import { Rng } from '../src/core/rng.js';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const BATCH = 'tools/map-batches.json';
const spec = JSON.parse(readFileSync(BATCH, 'utf8'));
const themes = JSON.parse(readFileSync('tools/map-themes.json', 'utf8')).themes;
const readJson = (p) => JSON.parse(readFileSync(`data/${p}`, 'utf8'));
const CORE = ['rifleman', 'marksman', 'gunner', 'rocket_battery', 'gunship', 'supply_depot', 'mine_layer', 'ember_adept', 'frost_weaver', 'storm_caller', 'rune_totem', 'spirit_summoner'];
const MIN_SPOTS = 60;

let content = await loadContent(async (p) => JSON.parse(await readFile(`data/${p}`, 'utf8')));

function nameFor(theme, seed, used) {
  const rng = new Rng(`${seed}:name`);
  const [a, b] = themes[theme].names;
  for (let i = 0; i < 50; i++) {
    const n = `${rng.pick(a)} ${rng.pick(b)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  throw new Error(`no free name for ${seed}`);
}

function build(entry, usedNames) {
  const theme = { id: entry.theme, ...themes[entry.theme] };
  const roads = entry.paths ? { paths: entry.paths, zKeep: entry.zKeep } : null;
  const nRoads = roads ? roads.paths.length : { serpentine: 1, fork: 2, trident: 3 }[entry.template];
  const base = content.waves.get(nRoads === 1 ? 'riftline_campaign' : 'frostmere_campaign');
  return generateMap({
    id: entry.id, name: entry.name || nameFor(entry.theme, entry.seed, usedNames), seed: entry.seed, template: entry.template,
    roads, theme, unlockLevel: entry.unlockLevel, description: entry.description, baseWaves: base, enemies: content.enemies, hpMul: entry.hpMul ?? 1,
    swaps: entry.swaps, boss: entry.boss, timeOfDay: entry.timeOfDay,
  });
}

function writeAll() {
  const used = new Set([...content.maps.values()].filter((m) => !m.generated).map((m) => m.name));
  const index = readJson('index.json');
  const music = readJson('music.json');
  const built = [];
  for (const entry of [...spec.flagships, ...spec.batch]) {
    const { map, waves } = build(entry, used);
    writeFileSync(`data/maps/${map.id}.json`, `${JSON.stringify(map, null, 1)}\n`);
    writeFileSync(`data/waves/${waves.id}.json`, `${JSON.stringify(waves, null, 1)}\n`);
    if (!index.maps.includes(`maps/${map.id}.json`)) index.maps.push(`maps/${map.id}.json`);
    if (!index.waves.includes(`waves/${waves.id}.json`)) index.waves.push(`waves/${waves.id}.json`);
    music.keys[map.id] = { ...themes[entry.theme].music };
    built.push(map);
  }
  writeFileSync('data/index.json', `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync('data/music.json', `${JSON.stringify(music, null, 2)}\n`);
  return built;
}

/** Grid spots (2.5 m) within 14 m of a road where a Rifleman can really be placed. */
function buildSpots(map) {
  const m = new Match({ content, mapWorld: buildMapWorld(map, content.props), difficulty: 'normal', seed: 'spots', loadout: ['rifleman'] });
  const b = m.mw.world.bounds;
  let n = 0;
  for (let x = b.minX + 3; x < b.maxX - 3; x += 2.5) {
    for (let z = b.minZ + 3; z < b.maxZ - 3; z += 2.5) {
      if (m.mw.terrain.pathInfo(x, z).d > 14) continue;
      if (m.canPlace('rifleman', x, z).ok) n++;
    }
  }
  return n;
}

function check(map) {
  const problems = validateRoads(map.paths, map.base.z);
  const spots = buildSpots(map);
  if (spots < MIN_SPOTS) problems.push(`only ${spots} build spots near the road (< ${MIN_SPOTS})`);
  const mw = buildMapWorld(map, content.props);
  const s = soakMap(mw, { seconds: 300, seed: `soak-${map.id}` });
  if (s.rescues) problems.push(`hero soak: ${s.rescues} rescues`);
  if (s.failures.length) problems.push(`hero soak: ${s.failures[0]}`);
  return { problems, spots, soak: s };
}

function measure(mapId, seeds) {
  const map = content.maps.get(mapId);
  let wins = 0;
  for (let s = 0; s < seeds; s++) {
    const r = playBot({ content, mapWorld: buildMapWorld(map, content.props), difficulty: 'normal', seed: `bal-${s}`, loadout: CORE, skill: 0.7, options: {} });
    if (r.won) wins++;
  }
  return wins / seeds;
}

const reload = async () => { content = await loadContent(async (p) => JSON.parse(await readFile(`data/${p}`, 'utf8'))); };

let maps = writeAll();
await reload();
const errs = validateContent(content);
if (errs.length) { console.error(errs.slice(0, 10).join('\n')); process.exit(1); }
console.log(`${maps.length} maps written`);

if (args.includes('--check') || !args.includes('--calibrate')) {
  let bad = 0;
  for (const map of maps) {
    const { problems, spots, soak } = check(content.maps.get(map.id));
    console.log(`${map.id.padEnd(18)} ${map.name.padEnd(20)} roads ${map.paths.length} unlock L${map.unlockLevel} spots ${spots} soak ${soak.distance} m, ${soak.rescues} rescues ${problems.length ? `PROBLEMS: ${problems.join('; ')}` : 'ok'}`);
    if (problems.length) bad++;
  }
  if (bad) process.exit(1);
}

if (args.includes('--calibrate')) {
  const only = opt('calibrate', '')?.startsWith('--') ? null : opt('calibrate', '')?.split(',').filter(Boolean);
  const seeds = Number(opt('seeds', 12));
  const parse = (txt) => [...(txt || '').matchAll(/hpMul ([\d.]+) -> (\d+)%/g)].map((m) => ({ hp: +m[1], rate: +m[2] / 100 }));
  const best = (pts) => pts.reduce((b, p) => (Math.abs(p.rate - 0.65) < Math.abs(b.rate - 0.65) ? p : b));
  for (const entry of [...spec.flagships, ...spec.batch]) {
    if (only?.length && !only.includes(entry.id)) continue;
    let pts = parse(entry.calibration);
    if (pts.length && !args.includes('--force')) {
      // already measured: keep the measured point closest to 65% (no new runs)
      entry.hpMul = best(pts).hp;
      writeFileSync(BATCH, `${JSON.stringify(spec, null, 2)}
`);
      console.log(`${entry.id.padEnd(18)} kept ${entry.calibration} -> hpMul ${entry.hpMul}`);
      continue;
    }
    pts = [];
    const apply = async (hp) => { entry.hpMul = +hp.toFixed(3); writeFileSync(BATCH, `${JSON.stringify(spec, null, 2)}
`); maps = writeAll(); await reload(); };
    for (let attempt = 0; attempt < 3; attempt++) {
      const rate = measure(entry.id, seeds);
      pts.push({ hp: entry.hpMul, rate });
      if (rate >= 0.6 && rate <= 0.7) break;
      if (attempt === 2) break;
      let next;
      if (pts.length === 1) {
        // gentle first step: win rate moves fast with enemy HP (about 25 points per 10% HP)
        next = entry.hpMul * Math.max(0.8, Math.min(1.25, 1 + (rate - 0.65) * 0.5));
      } else {
        // secant between the two measurements towards 65%, clamped to a sane range
        const [p, q] = pts;
        next = p.rate === q.rate ? (p.hp + q.hp) / 2 : p.hp + ((0.65 - p.rate) * (q.hp - p.hp)) / (q.rate - p.rate);
        next = Math.max(Math.min(p.hp, q.hp) * 0.85, Math.min(Math.max(p.hp, q.hp) * 1.15, next));
      }
      await apply(next);
    }
    const b = best(pts);
    entry.calibration = pts.map((p) => `hpMul ${p.hp} -> ${Math.round(p.rate * 100)}%`).join(', ');
    await apply(b.hp);
    console.log(`${entry.id.padEnd(18)} ${entry.calibration} => hpMul ${entry.hpMul}`);
  }
  maps = writeAll();
}
