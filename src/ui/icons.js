// Code-drawn SVG icon set (docs/ui-style.md section 6): 24x24 grid, 2 px stroke, round joins,
// currentColor plus one accent fill. Pure strings, no DOM, so tests and the HUD share them.

const S = (d) => `<path d="${d}"/>`;
const F = (d, fill = 'currentColor') => `<path d="${d}" fill="${fill}" stroke="none"/>`;
const C = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}"${fill ? ` fill="${fill}" stroke="none"` : ''}/>`;

/** Icon bodies (inner SVG). Accent fills use var(--ic-accent) so CSS can tint them. */
export const GLYPHS = {
  // ---- legacy HUD icons (camera chips, settings, help, sound)
  gear: C(12, 12, 3.2) + S('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M5.2 18.8l2.1-2.1M16.7 7.3l2.1-2.1'),
  help: C(12, 12, 9.5) + S('M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.8v.6') + C(12, 17.2, 0.6, 'currentColor'),
  close: S('M6 6l12 12M18 6L6 18'),
  orbit: C(12, 9, 3) + S('M6 20c1-3.4 3.3-5 6-5s5 1.6 6 5') + '<path d="M3 9a9 9 0 0 1 18 0" stroke-dasharray="2 3"/>',
  first: S('M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z') + C(12, 12, 3),
  free: S('M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3'),
  top: S('M3 3h18v18H3zM3 9h18M9 21V9'),
  sound: S('M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12'),
  // ---- currencies and UI
  crown: F('M3 18h18l1-11-5 4-5-7-5 7-5-4z', 'var(--ic-accent, #ffd166)') + S('M3 18h18l1-11-5 4-5-7-5 7-5-4zM4 21h16'),
  sigil: F('M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z', 'var(--ic-accent, #c9a7ff)') + S('M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z'),
  cash: S('M3 6h18v12H3zM7 6v12M17 6v12') + C(12, 12, 2.4),
  keep: F('M4 21V9l2-2V4h3v3h2V4h2v3h2V4h3v3l2 2v12z', 'var(--ic-accent, #3a4258)') + S('M4 21V9l2-2V4h3v3h2V4h2v3h2V4h3v3l2 2v12zM10 21v-5a2 2 0 0 1 4 0v5'),
  wave: S('M2 9c3-3 5-3 7 0s4 3 7 0 4-3 6 0M2 16c3-3 5-3 7 0s4 3 7 0 4-3 6 0'),
  timer: C(12, 13, 8) + S('M12 13V9M9 2h6M19 5l-1.5 1.5'),
  play: F('M7 4l13 8-13 8z'),
  pause: F('M6 4h4v16H6zM14 4h4v16h-4z'),
  speed: F('M3 5l9 7-9 7zM12 5l9 7-9 7z'),
  settings: C(12, 12, 3) + S('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'),
  lock: F('M5 11h14v10H5z', 'var(--ic-accent, #3a4258)') + S('M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2'),
  check: S('M4 12.5l5 5L20 6.5'),
  cross: S('M6 6l12 12M18 6L6 18'),
  info: C(12, 12, 9) + S('M12 11v6M12 7.5v.5'),
  warn: S('M12 3l10 18H2zM12 10v5M12 18v.5'),
  search: C(10.5, 10.5, 6.5) + S('M15.5 15.5L21 21'),
  filter: S('M3 5h18l-7 8v6l-4 2v-8z'),
  map: S('M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15'),
  hero: C(12, 7, 4) + S('M4 21c1-5 4-7 8-7s7 2 8 7'),
  tower: F('M7 21V10h10v11z', 'var(--ic-accent, #3a4258)') + S('M5 21h14M7 21V10h10v11M6 10V5h3v2h2V5h2v2h2V5h3v5M11 21v-4h2v4'),
  summon: S('M4 4h16v16H4zM8 4v16M16 4v16') + F('M10 10h4v4h-4z', 'var(--ic-accent, #ffd166)'),
  shop: S('M4 8h16l-1.5 12h-13zM8 8V6a4 4 0 0 1 8 0v2'),
  book: S('M4 4h7a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h5z'),
  scroll: S('M6 3h12v15a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2v-2h12v2a2 2 0 0 0 2 2M9 8h6M9 12h6'),
  gift: S('M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-2-4-6-4-6-1.5S9 9 12 9c3 0 6-.5 6-1.5S14 5 12 9'),
  trophy: S('M7 4h10v5a5 5 0 0 1-10 0zM7 6H3c0 4 2 5 4 5M17 6h4c0 4-2 5-4 5M12 14v4M8 21h8M9 18h6'),
  skull: S('M5 11a7 7 0 0 1 14 0v4h-2v4H7v-4H5z') + C(9, 11, 1.6, 'currentColor') + C(15, 11, 1.6, 'currentColor') + S('M10 19v-2M14 19v-2'),
  star: F('M12 2l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9.3l7-.8z', 'var(--ic-accent, #ffd166)'),
  sparkle: F('M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z', 'var(--ic-accent, #ffd166)'),
  back: S('M15 5l-7 7 7 7'),
  next: S('M9 5l7 7-7 7'),
  restart: S('M4 12a8 8 0 1 0 3-6.2M4 4v4h4'),
  exit: S('M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10'),
  // ---- damage types (docs/art-style.md glyphs)
  physical: C(12, 12, 5, 'var(--ic-accent, #d9d9d9)') + C(12, 12, 5),
  fire: F('M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z', 'var(--ic-accent, #ff6b35)') + S('M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z'),
  ice: S('M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5'),
  lightning: F('M13 2L4 14h7l-2 8 9-12h-7z', 'var(--ic-accent, #ffe14d)') + S('M13 2L4 14h7l-2 8 9-12h-7z'),
  arcane: F('M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z', 'var(--ic-accent, #b15cff)'),
  poison: F('M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z', 'var(--ic-accent, #7bd389)') + S('M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z'),
  explosive: F('M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z', 'var(--ic-accent, #ff9f1c)'),
  holy: C(12, 12, 4.5, 'var(--ic-accent, #fff3b0)') + S('M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'),
  dark: F('M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z', 'var(--ic-accent, #8e5bb5)') + S('M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z'),
  // ---- tower classes
  ground: S('M3 14h12l3-3h3M6 14v3h3v-3M15 11V9h-4') + C(7, 19, 1.5),
  sniper: C(12, 12, 7) + S('M12 2v6M12 16v6M2 12h6M16 12h6') + C(12, 12, 1.2, 'currentColor'),
  area: C(12, 12, 3, 'var(--ic-accent, #ff9f1c)') + S('M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3'),
  air: S('M12 3v6l9 5v2l-9-2v4l3 2v1l-3-1-3 1v-1l3-2v-4l-9 2v-2l9-5V3z'),
  support: F('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', 'var(--ic-accent, #2ec4b6)') + S('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM12 8v8M8 12h8'),
  trap: S('M3 18h18M5 18l3-8 4 8 4-8 3 8') + C(12, 6, 2),
  hybrid: S('M4 20L20 4M14 4h6v6') + F('M4 4l6 2-4 4z', 'var(--ic-accent, #b15cff)'),
  summoner: S('M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 7v10M7 12h10') + C(12, 12, 2.5, 'var(--ic-accent, #7ff6ff)'),
  // ---- enemy archetypes
  fast: S('M3 8h8M2 12h10M3 16h8') + F('M13 5l9 7-9 7z', 'var(--ic-accent, #ff6b6b)'),
  armored: F('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', 'var(--ic-accent, #8d8d99)') + S('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'),
  flying: S('M2 10c3-1 6 0 10 4 4-4 7-5 10-4-2 1-4 3-5 6-2-1-3-1-5 0-2-1-3-1-5 0-1-3-3-5-5-6z'),
  stealth: S('M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM4 20L20 4') + C(12, 12, 2.5),
  healer: F('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z', 'var(--ic-accent, #7bd389)') + S('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'),
  splitter: C(8, 8, 4) + C(16, 16, 4) + S('M11 11l2 2'),
  shielded: C(12, 12, 9) + C(12, 12, 4, 'var(--ic-accent, #7fdbff)'),
  regenerating: S('M20 12a8 8 0 1 1-3-6.2M20 4v4h-4M12 9v6M9 12h6'),
  swarm: C(6, 8, 2.5) + C(17, 7, 2.5) + C(11, 15, 2.5) + C(18, 17, 2) + C(5, 18, 2),
  boss: F('M3 18h18l1-11-5 4-5-7-5 7-5-4z', 'var(--ic-accent, #ff3cac)') + S('M3 18h18l1-11-5 4-5-7-5 7-5-4zM4 21h16'),
  // ---- generic ability shapes (abilities map onto these by effect)
  strike: S('M3 21l7-7M14 3l7 7-9 9-7-7z'),
  heal: F('M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z', 'var(--ic-accent, #7bd389)'),
  rally: S('M5 21V3M5 4h12l-3 4 3 4H5'),
  buff: S('M12 20V6M6 12l6-6 6 6M6 20h12'),
  shield: F('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', 'var(--ic-accent, #7fdbff)'),
  drone: C(12, 12, 3) + S('M3 6h6M15 6h6M6 6v3l4 2M18 6v3l-4 2M8 17l-2 3M16 17l2 3'),
  crate: S('M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8'),
  vortex: S('M12 12m-1 0a1 1 0 1 0 2 0M12 6a6 6 0 1 1-6 6M12 2a10 10 0 1 1-10 10'),
  meteor: C(15, 15, 5, 'var(--ic-accent, #ff6b35)') + S('M3 3l8 8M7 3l6 6M3 7l6 6'),
  roots: S('M12 3v9M12 12c-3 2-5 5-6 9M12 12c3 2 5 5 6 9M12 12c0 3 0 6-1 9M8 7c2 0 4 1 4 3M16 6c-2 1-4 2-4 4'),
  wolf: S('M4 10l3-6 3 4h4l3-4 3 6v4l-4 6h-8l-4-6z') + C(9.5, 12, 1, 'currentColor') + C(14.5, 12, 1, 'currentColor'),
  target: C(12, 12, 9) + C(12, 12, 5) + C(12, 12, 1.5, 'currentColor'),
  emp: C(12, 12, 3, 'var(--ic-accent, #7fdbff)') + S('M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a5 5 0 0 0 0 8M16 8a5 5 0 0 1 0 8'),
  coins: C(9, 9, 6) + S('M15.5 9.5a6 6 0 1 1-6 6'),
};

/** Ability id -> icon (by effect family; unknown ids fall back to sparkle). */
export const ABILITY_ICONS = {
  airstrike: 'air', frost_nova: 'ice', commanders_rally: 'rally', artillery_barrage: 'explosive', field_repairs: 'heal', war_chest: 'coins',
  gravity_well: 'vortex', starfall: 'arcane', banner_of_valor: 'rally', flare_shells: 'holy', arcane_chain: 'lightning', meteor: 'meteor',
  wall_of_flame: 'fire', kindle: 'fire', flashfire: 'explosive', reinforcements: 'hero', frag_volley: 'area', overclock: 'buff', supply_drop: 'crate',
  entangling_roots: 'roots', spirit_pack: 'wolf', cleansing_bloom: 'poison', verdant_renewal: 'heal', marked_for_death: 'target', emp_burst: 'emp',
  recon_drone: 'drone', headhunter: 'sniper',
  tidal_surge: 'vortex', glacier_wall: 'ice', tempest_call: 'lightning', sea_mist: 'heal', carpet_bomb: 'air', sapper_charge: 'explosive', scrap_haul: 'crate',
  tripwire_field: 'trap', shadow_strike: 'skull', umbral_snare: 'roots', dusk_veil: 'target', soul_harvest: 'coins',
};

/** Rarity badge: shape + label + colour (never colour alone). */
export const RARITY = {
  common: { label: 'Common', color: '#b0b7c3', shape: 'M5 5h14v14H5z' },
  uncommon: { label: 'Uncommon', color: '#5fd068', shape: 'M4 15l8-7 8 7' },
  rare: { label: 'Rare', color: '#3fa9f5', shape: 'M4 12l8-6 8 6M4 18l8-6 8 6' },
  epic: { label: 'Epic', color: '#b15cff', shape: 'M12 2l9 10-9 10-9-10z' },
  legendary: { label: 'Legendary', color: '#ffb627', shape: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9.3l7-.8z' },
  mythic: { label: 'Mythic', color: '#ff4d6d', shape: 'M3 18h18l1-11-5 4-5-7-5 7-5-4z' },
};

/** SVG markup for an icon. Decorative unless a title is given. */
export function icon(name, { cls = '', title = '', size } = {}) {
  const body = GLYPHS[name] || GLYPHS.sparkle;
  const a11y = title ? `role="img" aria-label="${title.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  const sz = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24"${sz} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}

/** Rarity badge markup: shaped glyph + label, coloured by rarity. */
export function rarityBadge(rarity, { short = false } = {}) {
  const r = RARITY[rarity] || RARITY.common;
  const fill = rarity === 'common' || rarity === 'uncommon' || rarity === 'rare' ? 'none' : r.color;
  return `<span class="rb rb-${rarity}" style="--rc:${r.color}"><svg class="ic" viewBox="0 0 24 24" fill="${fill}" stroke="${r.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="${r.shape}"/></svg>${short ? '' : `<span>${r.label}</span>`}</span>`;
}

/** Icon for a tower (by class), enemy (by archetype or boss) or ability id. */
export const towerIcon = (t) => (GLYPHS[t?.class] ? t.class : 'tower');
export const enemyIcon = (e) => (e?.boss ? 'boss' : GLYPHS[e?.archetype] ? e.archetype : 'skull');
export const abilityIcon = (id) => ABILITY_ICONS[id] || 'sparkle';

/** Legacy map used by src/ui/hud.js: full 1em SVG strings. */
export const ICONS = Object.fromEntries(['gear', 'help', 'close', 'orbit', 'first', 'free', 'top', 'sound'].map((k) => [k, icon(k, { size: '1em' })]));
