// Which enemy types a match can field (pure): every enemy in its waves (the first `endlessWaves` of
// an endless run), plus everything those enemies can bring with them (summons, splits, boss
// portals, death spawns), found by walking each enemy's data for strings that are enemy ids.
// Used to preload models; anything missing is loaded on demand.

export function matchEnemyIds(match, { endlessWaves = 40 } = {}) {
  const enemies = match.content.enemies;
  const n = Number.isFinite(match.waveCount()) ? match.waveCount() : endlessWaves;
  const out = new Set();
  const queue = [];
  const add = (id) => { if (enemies.has(id) && !out.has(id)) { out.add(id); queue.push(id); } };
  for (let w = 1; w <= n; w++) for (const g of match.waveDef(w)?.groups || []) add(g.enemy);
  const walk = (v) => {
    if (typeof v === 'string') add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'id' && k !== 'model') walk(x);
  };
  while (queue.length) walk(enemies.get(queue.pop()));
  return out;
}
