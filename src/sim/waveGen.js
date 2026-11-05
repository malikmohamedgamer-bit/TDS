// Endless / generated waves. Pure and deterministic: wave n depends only on (seed, n, content).
// Composition grows with n: more groups, more enemies, a wider enemy pool, and a boss every 10
// waves (rotating through every boss in the content).
import { Rng } from '../core/rng.js';

/** First campaign wave each enemy appears in (so endless introduces enemies in a sensible order). */
export function introWaves(waveSet) {
  const first = new Map();
  waveSet.waves.forEach((w, i) => {
    for (const g of w.groups) if (!first.has(g.enemy)) first.set(g.enemy, i + 1);
  });
  return first;
}

export function bossPool(content) {
  return [...content.enemies.values()].filter((e) => e.boss).sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1)).map((e) => e.id);
}

/**
 * Generate wave n (1-based) for a wave set. Returns {groups, boss, generated: true}.
 * Enemies not in the campaign table unlock gradually from wave 8 on.
 */
export function generateWave(n, { seed, content, waveSet }) {
  const rng = new Rng(`${seed}:gen:${n}`);
  const intro = introWaves(waveSet);
  const normal = [...content.enemies.values()].filter((e) => !e.boss && !e.summonOnly);
  const pool = normal.filter((e) => (intro.get(e.id) ?? 8 + (normal.indexOf(e) % 12)) <= n);
  const groups = [];
  const boss = n % 10 === 0;
  if (boss) {
    const bosses = bossPool(content);
    const id = bosses[(n / 10 - 1) % bosses.length];
    groups.push({ enemy: id, count: 1, hpMul: Math.min(1.5, 0.35 + n * 0.012), leak: n >= 20 ? undefined : 60 });
  }
  const groupCount = Math.min(6, 2 + Math.floor(n / 6));
  // budget in "health points" before wave scaling, grows ~ n^1.15
  let budget = 300 * Math.pow(n, 1.15) * (boss ? 0.5 : 1);
  for (let g = 0; g < groupCount && budget > 0; g++) {
    const e = rng.weighted(pool, (x) => (x.archetype === 'swarm' ? 0.7 : 1) * (1 + Math.max(0, (intro.get(x.id) || n) - 1) / 10));
    if (!e) break;
    const share = g === groupCount - 1 ? budget : budget * rng.range(0.25, 0.5);
    const count = Math.max(1, Math.min(45, Math.round(share / e.hp)));
    budget -= count * e.hp;
    const interval = Math.max(0.2, Math.min(2.5, 18 / count));
    groups.push({ enemy: e.id, count, interval: +interval.toFixed(2), delay: +(g * rng.range(2, 5)).toFixed(1) });
  }
  return { groups, boss, generated: true };
}
