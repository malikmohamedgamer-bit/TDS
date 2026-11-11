// UI/GFX update: pure helpers (map picker grouping, filtering and SVG previews, reward counters,
// icon set, rarity badges, theme data, VFX presets, ambient particle motion).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../../src/core/content.js';
import { groupMapsByTheme, filterMaps, mapPreviewSvg, mapTheme } from '../../src/ui/mapThumb.js';
import { countValue } from '../../src/ui/counter.js';
import { GLYPHS, ICONS, icon, rarityBadge, towerIcon, enemyIcon, abilityIcon, ABILITY_ICONS } from '../../src/ui/icons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const content = await loadContent(async (p) => JSON.parse(await readFile(join(root, 'data', p), 'utf8')));
const maps = [...content.maps.values()];

test('map picker: every map lands in exactly one theme group, groups are ordered and sorted by unlock level', () => {
  const groups = groupMapsByTheme(maps);
  assert.equal(groups.reduce((a, g) => a + g.maps.length, 0), maps.length);
  assert.equal(groups[0].theme, 'verdant');
  for (const g of groups) {
    for (const m of g.maps) assert.equal(mapTheme(m), g.theme);
    for (let i = 1; i < g.maps.length; i++) assert.ok((g.maps[i - 1].unlockLevel || 0) <= (g.maps[i].unlockLevel || 0));
  }
  assert.equal(mapTheme(content.maps.get('frostmere')), 'frost');
});

test('map picker: search matches name, description and theme; theme and lock filters combine', () => {
  const glacier = filterMaps(maps, { query: 'glacier' });
  assert.ok(glacier.some((m) => m.id === 'glacier_gate'));
  assert.ok(glacier.every((m) => /glacier/i.test(`${m.name} ${m.description}`)) && glacier.length < maps.length);
  assert.ok(filterMaps(maps, { query: 'FROST' }).length >= 3, 'theme label is searchable');
  const ember = filterMaps(maps, { theme: 'ember' });
  assert.ok(ember.length >= 2 && ember.every((m) => mapTheme(m) === 'ember'));
  const open = filterMaps(maps, { unlockedOnly: true, level: 1 });
  assert.ok(open.every((m) => (m.unlockLevel || 0) <= 1) && open.some((m) => m.id === 'riftline'));
  assert.equal(filterMaps(maps, { query: 'zzz-no-map' }).length, 0);
});

test('map previews: valid SVG with one road per path, portals, keep and a lock layer only when locked', () => {
  for (const m of maps) {
    const svg = mapPreviewSvg(m);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), m.id);
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `${m.id} has no NaN / undefined`);
    assert.equal((svg.match(/stroke-dasharray="2 3"/g) || []).length, m.paths.length, `${m.id} draws every road`);
    assert.equal((svg.match(/stroke="#ff3cac"/g) || []).length, m.paths.length, `${m.id} has a portal per road`);
    assert.ok(!svg.includes('opacity="0.55"'));
    assert.ok(mapPreviewSvg(m, { locked: true }).includes('opacity="0.55"'));
  }
});

test('reward counters ease from 0 to the exact target and never overshoot', () => {
  assert.equal(countValue(280, 0), 0);
  assert.equal(countValue(280, 900), 280);
  assert.equal(countValue(280, 5000), 280);
  let prev = 0;
  for (let t = 0; t <= 900; t += 30) {
    const v = countValue(280, t);
    assert.ok(v >= prev && v <= 280);
    prev = v;
  }
  assert.ok(countValue(1000, 450) > 500, 'ease-out: past half way at half time');
  assert.equal(countValue(50, 10, 0), 50, 'zero duration jumps to the end (reduced motion)');
});

test('icons: every tower class, enemy archetype, damage type and ability has its own glyph', () => {
  for (const t of content.towers.values()) assert.ok(GLYPHS[towerIcon(t)], `tower class ${t.class}`);
  for (const e of content.enemies.values()) assert.ok(GLYPHS[enemyIcon(e)] && enemyIcon(e) !== 'skull', `enemy archetype ${e.archetype}`);
  for (const d of content.damageTypes.keys()) assert.ok(GLYPHS[d], `damage type ${d}`);
  for (const a of content.abilities.keys()) assert.ok(ABILITY_ICONS[a] && GLYPHS[abilityIcon(a)], `ability ${a}`);
  const svg = icon('crown', { title: 'Crowns' });
  assert.match(svg, /role="img" aria-label="Crowns"/);
  assert.match(icon('crown'), /aria-hidden="true"/);
  for (const k of ['gear', 'help', 'close', 'orbit', 'first', 'free', 'top', 'sound']) assert.match(ICONS[k], /^<svg/, `legacy HUD icon ${k}`);
});

test('rarity badges carry a shape and a label, not only a colour', () => {
  const shapes = new Set();
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
    const b = rarityBadge(r);
    assert.match(b, new RegExp(`<span>${r[0].toUpperCase()}${r.slice(1)}</span>`));
    shapes.add(b.match(/<path d="([^"]+)"/)[1]);
  }
  assert.equal(shapes.size, 6);
});

test('theme profiles and VFX presets are complete and well formed', async () => {
  const themes = JSON.parse(await readFile(join(root, 'data/themes.json'), 'utf8')).themes;
  for (const m of maps) assert.ok(themes[mapTheme(m)], `theme profile for ${m.id}`);
  for (const [id, t] of Object.entries(themes)) {
    for (const k of ['lift', 'gamma', 'gain']) assert.equal(t.grade[k].length, 3, `${id} grade.${k}`);
    assert.ok(t.grade.saturation > 0.5 && t.grade.saturation < 1.5 && t.grade.contrast > 0.8 && t.grade.contrast < 1.3, id);
    assert.ok(['snow', 'embers', 'spores', 'dust', 'motes', 'pollen'].includes(t.particles.kind), id);
  }
  const vfx = JSON.parse(await readFile(join(root, 'data/vfx.json'), 'utf8'));
  const steps = new Set(['burst', 'ring', 'bolt', 'shake', 'flash', 'slowmo']);
  for (const [id, list] of Object.entries(vfx.presets)) {
    assert.ok(Array.isArray(list) && list.length, id);
    for (const s of list) assert.ok(Object.keys(s).length === 1 && steps.has(Object.keys(s)[0]), `${id} step ${JSON.stringify(s)}`);
  }
  for (const d of content.damageTypes.keys()) assert.ok(vfx.presets[`hit.${d}`], `hit preset for ${d}`);
  for (const st of ['burn', 'slow', 'stun', 'mark', 'shield']) assert.ok(vfx.presets[`status.${st}`], `status aura ${st}`);
  for (const k of ['low', 'medium', 'high', 'ultra']) assert.ok(vfx.caps.particles[k] > 0 && vfx.caps.countMul[k] > 0);
});

test('VFX presets: play() runs visual steps, returns side effects, scales by quality and radius', async () => {
  const { Effects } = await import('../../src/engine/effects.js');
  const vfx = JSON.parse(await readFile(join(root, 'data/vfx.json'), 'utf8'));
  const fx = Object.create(Effects.prototype);
  const calls = [];
  fx.burst = (x, y, z, o) => calls.push(['burst', o]);
  fx.ring = (x, y, z, o) => calls.push(['ring', o]);
  fx.bolt = () => calls.push(['bolt']);
  fx.maxP = 3200;
  fx.setLibrary(vfx, 'low');
  assert.equal(fx.capP, vfx.caps.particles.low);
  const side = fx.play('death.boss', 0, 0, 0);
  assert.ok(side.shake > 0 && side.flash && side.slowmo.scale < 1, 'boss death shakes, flashes and slows time');
  assert.ok(calls.some(([k]) => k === 'burst') && calls.some(([k]) => k === 'ring'));
  const lowCount = calls.find(([k]) => k === 'burst')[1].count;
  calls.length = 0;
  fx.setLibrary(vfx, 'ultra');
  fx.play('death.boss', 0, 0, 0);
  assert.ok(calls.find(([k]) => k === 'burst')[1].count > lowCount, 'ultra spawns more particles than low');
  calls.length = 0;
  fx.play('explosion.fire', 0, 0, 0, { radius: 4 });
  assert.equal(calls.find(([k]) => k === 'ring')[1].r1, 4, 'ring radius follows the event radius');
  assert.ok(calls.find(([k]) => k === 'burst')[1].speed > 4);
  assert.equal(fx.play('no.such.preset', 0, 0, 0), null);
  fx.setLibrary(vfx, 'low');
  calls.length = 0;
  fx.play('status.burn', 0, 0, 0);
  assert.equal(calls[0][1].count, 1, 'status auras never round down to zero particles');
});

test('ambient particles stay inside their box for every kind (no leak, no NaN)', async () => {
  const { ambientMotion } = await import('../../src/engine/themeFx.js');
  const box = { w: 140, d: 110, top: 20 };
  for (const kind of ['snow', 'embers', 'spores', 'dust', 'motes', 'pollen']) {
    let p = { x: 60, y: 19.5, z: -50, ph: 1.3, sp: 1.4 };
    for (let i = 0; i < 2000; i++) {
      const [x, y, z] = ambientMotion(kind, p, i / 60, 1 / 60, box);
      assert.ok(Number.isFinite(x + y + z), kind);
      assert.ok(Math.abs(x) <= box.w / 2 + 1e-9 && Math.abs(z) <= box.d / 2 + 1e-9 && y >= 0 && y <= box.top, `${kind} stays in the box`);
      p = { ...p, x, y, z };
    }
  }
  const snow = ambientMotion('snow', { x: 0, y: 10, z: 0, ph: 0, sp: 1 }, 0, 1, box);
  const ember = ambientMotion('embers', { x: 0, y: 10, z: 0, ph: 0, sp: 1 }, 0, 1, box);
  assert.ok(snow[1] < 10 && ember[1] > 10, 'snow falls, embers rise');
});

test('help: every topic has entries, search needs every word, about pages exist', async () => {
  const { filterHelp } = await import('../../src/ui/helpSearch.js');
  const H = content.help;
  assert.ok(H.topics.length >= 4 && H.topics.every((t) => t.entries.length >= 3 && t.entries.every((e) => e.q && e.a)));
  assert.deepEqual(H.about.map((a) => a.id), ['credits', 'privacy', 'terms']);
  assert.equal(filterHelp(H.topics, '').length, H.topics.length);
  const fly = filterHelp(H.topics, 'FLYING air');
  assert.ok(fly.length >= 1 && fly.every((t) => t.entries.every((e) => /flying/i.test(`${e.q} ${e.a} ${e.tags}`))));
  assert.equal(filterHelp(H.topics, 'zzz-nothing').length, 0);
});
