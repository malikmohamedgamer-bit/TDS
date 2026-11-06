// Map preview thumbnails drawn as SVG from map data (no rendering needed, so the picker shows
// every map instantly, locked ones included). Pure string building: unit-tested in Node.

const THEME_LABEL = {
  verdant: 'Verdant', frost: 'Frost', toxic: 'Toxic Mire', ember: 'Ember', dunes: 'Dunes', starfall: 'Starfall',
};
const THEME_ORDER = ['verdant', 'frost', 'toxic', 'ember', 'dunes', 'starfall'];

/** Theme id of a map (the first two hand-made maps predate the theme field). */
export function mapTheme(map) {
  return map.theme || map.generated?.theme || (map.id === 'frostmere' ? 'frost' : 'verdant');
}

export const themeLabel = (t) => THEME_LABEL[t] || t.charAt(0).toUpperCase() + t.slice(1);

/** Groups maps by theme in a stable order; each group sorted by unlock level then name. */
export function groupMapsByTheme(maps) {
  const groups = new Map();
  for (const m of maps) {
    const t = mapTheme(m);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(m);
  }
  const rank = (t) => (THEME_ORDER.includes(t) ? THEME_ORDER.indexOf(t) : 99);
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([theme, list]) => ({ theme, label: themeLabel(theme), maps: list.sort((a, b) => (a.unlockLevel || 0) - (b.unlockLevel || 0) || a.name.localeCompare(b.name)) }));
}

/** Filters maps by search text (name, description, theme) and theme id ('all' = any). */
export function filterMaps(maps, { query = '', theme = 'all', unlockedOnly = false, level = 99 } = {}) {
  const q = query.trim().toLowerCase();
  return maps.filter((m) => {
    if (theme !== 'all' && mapTheme(m) !== theme) return false;
    if (unlockedOnly && (m.unlockLevel || 0) > level) return false;
    if (!q) return true;
    return `${m.name} ${m.description || ''} ${themeLabel(mapTheme(m))}`.toLowerCase().includes(q);
  });
}

const r1 = (n) => Math.round(n * 10) / 10;

/** SVG preview: themed ground, rim, roads (with edge lines), portal(s) and the keep. */
export function mapPreviewSvg(map, { w = 160, h = 100, locked = false } = {}) {
  const size = map.size || { w: 100, d: 70 };
  const s = Math.min((w - 12) / size.w, (h - 12) / size.d);
  const ox = w / 2;
  const oz = h / 2;
  const X = (x) => r1(ox + x * s);
  const Z = (z) => r1(oz + z * s);
  const g = map.ground || {};
  const grass = g.grass || ['#6BAA4A', '#5A9440', '#7DBE58', '#4B7F36'];
  const path = g.path || ['#C49A6C', '#A97D52', '#D8B184', '#8C6440'];
  const rim = g.rim || ['#6E6E7A', '#8D8D99'];
  const id = `mp-${map.id}`;
  const roads = (map.paths || []).map((p) => (p.points || []).map((q) => (Array.isArray(q) ? q : [q.x, q.z])));
  const line = (pts) => pts.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x)} ${Z(z)}`).join('');
  // a few deterministic speckles from the map seed so maps of one theme still look different
  let hsh = 0;
  for (const c of String(map.seed || map.id)) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const dots = [];
  for (let i = 0; i < 14; i++) {
    hsh = (hsh * 1664525 + 1013904223) >>> 0;
    const dx = (hsh % 1000) / 1000;
    hsh = (hsh * 1664525 + 1013904223) >>> 0;
    const dz = (hsh % 1000) / 1000;
    dots.push(`<rect x="${r1(6 + dx * (w - 14))}" y="${r1(6 + dz * (h - 14))}" width="3" height="3" fill="${grass[(i % 3) + 1] || grass[0]}"/>`);
  }
  const base = map.base ? `<g transform="translate(${X(map.base.x)} ${Z(map.base.z)})"><rect x="-5" y="-5" width="10" height="10" fill="#3a4258" stroke="#ffd166" stroke-width="1.5"/><rect x="-2" y="-2" width="4" height="4" fill="#ffd166"/></g>` : '';
  const portals = roads.filter((p) => p.length).map((p) => `<circle cx="${X(p[0][0])}" cy="${Z(p[0][1])}" r="4.2" fill="#2b2d42" stroke="#ff3cac" stroke-width="1.8"/>`).join('');
  const lockLayer = locked ? `<rect width="${w}" height="${h}" fill="#07080c" opacity="0.55"/>` : '';
  return `<svg class="map-prev" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${grass[2] || grass[0]}"/><stop offset="1" stop-color="${grass[3] || grass[1] || grass[0]}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="${rim[0]}"/><rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="url(#${id}-g)" stroke="${rim[1] || rim[0]}" stroke-width="1.5"/>${dots.join('')}
${roads.map((p) => `<path d="${line(p)}" fill="none" stroke="${path[3] || path[1]}" stroke-width="${r1(Math.max(5, 7.5 * s * 1.6))}" stroke-linejoin="round" stroke-linecap="round"/><path d="${line(p)}" fill="none" stroke="${path[0]}" stroke-width="${r1(Math.max(3.4, 5.2 * s * 1.6))}" stroke-linejoin="round" stroke-linecap="round"/><path d="${line(p)}" fill="none" stroke="${path[2] || path[0]}" stroke-width="0.8" stroke-dasharray="2 3" stroke-linecap="round"/>`).join('')}
${portals}${base}${lockLayer}</svg>`;
}
