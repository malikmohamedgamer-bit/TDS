// Headless balance bot: plays a match greedily (place / upgrade by estimated value per cash) and
// reports the result. Pure; used by unit tests and tools/balance.mjs.
import { Match, SIM_DT } from './match.js';
import { towerStats, nextStep } from './stats.js';
import { Rng } from '../core/rng.js';

/** Rough damage-per-second value of a stats object at a spot with path coverage share cov. */
export function value(stats, cov, wavesLeft) {
  if (stats.income) return (stats.income * wavesLeft) / 60;
  if (stats.aura) return 0; // valued by the towers it buffs, see auraValue()
  if (stats.summon) {
    const u = stats.summon.unit;
    return u.damage * u.rate * stats.summon.max * 0.9 + u.hp * 0.05;
  }
  if (stats.trap) return ((stats.damage * (1 + stats.splash * 0.45)) / stats.trap.interval) * 0.6;
  const dps = (stats.damage || 0) * (stats.rate || 0);
  let mul = 1 + (stats.splash || 0) * 0.45;
  if (stats.chain) mul *= 1 + (stats.chain.count - 1) * stats.chain.falloff * 0.6;
  if (stats.burn) mul += (stats.burn.dps * stats.burn.duration) / Math.max(1, stats.damage) * 0.3;
  if (stats.slow) mul += stats.slow.amount * 0.8;
  if (stats.targets?.air) mul *= 1.12;
  if (stats.detection) mul *= 1.08;
  // extra damage against bosses counts for a third: most targets are not bosses
  if (stats.bossDamage) mul *= 1 + (stats.bossDamage - 1) / 3;
  return dps * mul * cov * 2.5; // damage dealt scales with how much road is in range
}

/**
 * strategy: 'smart' (value-driven), 'lazy' (1-2 tower types, never upgrades), 'weak' (2 towers only).
 * skill 1 = always the best estimated option; lower skill adds seeded noise to its estimates,
 * irregular reaction times and occasional hesitation (a sensible but not perfect player).
 */
export function createBot(match, { loadout, maxTowers = 30, thinkEvery = 0.5, heroSpot = null, weak = false, strategy = weak ? 'weak' : 'smart', skill = 1, seed = 'bot' } = {}) {
  const m = match;
  const rng = new Rng(`${seed}:bot`);
  const noise = () => (skill >= 1 ? 1 : 1 + (rng.next() - 0.5) * 2 * (1 - skill) * 1.2);
  // road samples from every path (maps can have several roads; shared stretches count twice,
  // which is right: more enemies walk them)
  const samples = [];
  for (const path of m.paths) for (let d = 0; d < path.length; d += 2) samples.push(path.pointAt(d, {}));
  // candidate spots on a grid, scored by path coverage per range
  const spots = [];
  const b = m.mw.world.bounds;
  for (let x = b.minX + 3; x < b.maxX - 3; x += 2.5) {
    for (let z = b.minZ + 3; z < b.maxZ - 3; z += 2.5) {
      const pi = m.mw.terrain.pathInfo(x, z);
      if (pi.d > 22) continue;
      spots.push({ x, z, used: false });
    }
  }
  const covCache = new Map();
  const coverage = (s, r) => {
    const key = `${s.x},${s.z},${r.toFixed(1)}`;
    let v = covCache.get(key);
    if (v === undefined) {
      let n = 0;
      for (const p of samples) if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 <= r * r) n++;
      v = (n * m.paths.length) / samples.length; // 1 = one whole road (traps and income are valued per road too)
      covCache.set(key, v);
    }
    return v;
  };
  const auraValue = (aura, s, range, wavesLeft) => {
    let v = 0;
    for (const t of m.towers) {
      if (t.base.aura || (t.x - s.x) ** 2 + (t.z - s.z) ** 2 > range * range) continue;
      const tv = value(t.base, coverage(t, t.base.range || 8), wavesLeft);
      v += tv * ((aura.damage || 0) + (aura.rate || 0) + (aura.range || 0) * 0.5) + (aura.detection && !t.base.detection ? tv * 0.15 : 0);
    }
    return v;
  };
  const ids = (loadout || m.loadout).filter((id) => m.content.towers.has(id));
  let nextThink = 0;
  const report = { placed: 0, upgrades: 0, spent: 0 };

  if (m.hero) {
    let best = heroSpot;
    if (!best) {
      let bc = -1;
      for (const s of spots) {
        const c = coverage(s, 7);
        if (c > bc && m.canPlace(ids[0], s.x, s.z).code !== 'path') { bc = c; best = s; }
      }
    }
    if (best) m.command({ type: 'hero', x: best.x, z: best.z });
  }
  for (const a of m.abilities) m.command({ type: 'abilityMode', id: a.id, mode: 'auto' });

  function bestNewTower(wavesLeft, budget) {
    let best = null;
    for (const id of ids) {
      const def = m.content.towers.get(id);
      if (m.costOf(def) > budget) continue;
      if (def.limit && m.towers.filter((t) => t.defId === id).length >= def.limit) continue;
      const st = towerStats(def, undefined, m.levels[id] || 1, m.progression).stats;
      const range = st.range || 8;
      for (const s of spots) {
        if (s.used) continue;
        // each extra tower overlaps and overkills more (diminishing returns), like a real player sees
        const crowd = 0.92 ** m.towers.length;
        const v = ((st.aura ? auraValue(st.aura, s, range, wavesLeft) : value(st, st.income ? 0.5 : coverage(s, range), wavesLeft)) * crowd * noise()) / m.costOf(def);
        if (!best || v > best.v) best = { kind: 'place', id, s, v, cost: m.costOf(def) };
      }
    }
    return best;
  }

  function bestUpgrade(wavesLeft, budget) {
    let best = null;
    for (const t of m.towers) {
      const pick = nextStep(t.def, t.up, null);
      const options = pick?.needsBranch ? pick.options : [null];
      for (const br of options) {
        const n = nextStep(t.def, t.up, br);
        if (!n || n.needsBranch || m.stepCost(n.step) > budget) continue;
        const up2 = { ...t.up };
        if (n.kind === 'linear') up2.linear++;
        else { up2.branch = n.branch; up2.branchLevel++; }
        const st2 = towerStats(t.def, up2, m.levels[t.defId] || 1, m.progression).stats;
        const before = t.base.aura ? auraValue(t.base.aura, t, t.base.range, wavesLeft) : value(t.base, coverage(t, t.base.range || 8), wavesLeft);
        const after = st2.aura ? auraValue(st2.aura, t, st2.range, wavesLeft) : value(st2, coverage(t, st2.range || 8), wavesLeft);
        const v = ((after - before) * noise()) / m.stepCost(n.step);
        if (!best || v > best.v) best = { kind: 'upgrade', uid: t.uid, branch: n.branch || null, v, cost: m.stepCost(n.step) };
      }
    }
    return best;
  }

  function think() {
    if (m.phase === 'won' || m.phase === 'lost') return;
    if (strategy === 'lazy') {
      // one or two cheap tower types, spammed, never upgraded
      const types = ids.filter((id) => m.content.towers.get(id).stats.damage).sort((a, b) => m.content.towers.get(a).cost - m.content.towers.get(b).cost).slice(0, 2);
      for (let guard = 0; guard < 3; guard++) {
        const saved = ids.splice(0, ids.length, ...types);
        const o = bestNewTower(Math.min(20, m.waveCount()), m.cash);
        ids.splice(0, ids.length, ...saved);
        if (!o || m.cash < o.cost) break;
        o.s.used = true;
        if (m.command({ type: 'place', tower: o.id, x: o.s.x, z: o.s.z }).ok) report.placed++;
        m.step();
      }
      return;
    }
    if (strategy === 'weak') {
      if (m.towers.length < 2) {
        const o = bestNewTower(Math.min(20, m.waveCount()), m.cash);
        if (o && m.cash >= o.cost && m.command({ type: "place", tower: o.id, x: o.s.x, z: o.s.z }).ok) { o.s.used = true; report.placed++; }
      }
      return;
    }
    const wavesLeft = Math.min(20, m.waveCount() - m.wave + 1);
    // nothing affordable: skip the expensive search
    let minCost = Infinity;
    for (const id of ids) minCost = Math.min(minCost, m.costOf(m.content.towers.get(id)));
    for (const t of m.towers) {
      const n = nextStep(t.def, t.up, 'A');
      if (n && !n.needsBranch) minCost = Math.min(minCost, m.stepCost(n.step));
    }
    if (m.cash < minCost) return;
    // an imperfect player sometimes hesitates
    if (skill < 1 && rng.chance((1 - skill) * 0.35)) return;
    for (let guard = 0; guard < 4; guard++) {
      const place = m.towers.length < maxTowers ? bestNewTower(wavesLeft, Infinity) : null;
      const up = bestUpgrade(wavesLeft, Infinity);
      // best overall vs best we can afford now: only save up when the big buy is much better and close
      const pickBest = (a, c) => (a && (!c || a.v > c.v * 1.1) ? a : c);
      const best = m.towers.length < 3 && place ? place : pickBest(up, place);
      const affordable = pickBest(bestUpgrade(wavesLeft, m.cash), m.towers.length < maxTowers ? bestNewTower(wavesLeft, m.cash) : null);
      let choice = affordable;
      if (best && best !== affordable && best.cost <= m.cash * 1.3 && (!affordable || best.v > affordable.v * 1.5)) choice = null;
      if (!choice || m.cash < choice.cost) break;
      if (choice.kind === 'place') {
        const r = m.command({ type: 'place', tower: choice.id, x: choice.s.x, z: choice.s.z });
        choice.s.used = true;
        if (r.ok) { report.placed++; report.spent += choice.cost; }
      } else {
        const r = m.command({ type: 'upgrade', uid: choice.uid, branch: choice.branch });
        if (r.ok) { report.upgrades++; report.spent += choice.cost; }
      }
      // commands apply on the next step; step once so cash is updated before the next decision
      m.step();
    }
  }

  return {
    report,
    update() {
      if (m.time >= nextThink) { nextThink = m.time + thinkEvery * (skill < 1 ? 0.6 + rng.next() * (1 + 2 * (1 - skill)) : 1); think(); }
    },
  };
}

/** Play a full match with the bot. Returns the result plus bot report. */
export function playBot({ content, mapWorld, difficulty = 'normal', seed = 'bot', loadout, levels, options, weak = false, strategy, skill = 1, maxTicks = 60 * 60 * 40 }) {
  const m = new Match({ content, mapWorld, difficulty, seed, loadout, levels, options });
  const bot = createBot(m, { loadout, weak, strategy, skill, seed });
  while (m.phase !== 'won' && m.phase !== 'lost' && m.tick < maxTicks) {
    bot.update();
    m.step();
    m.drainEvents();
  }
  const r = m.result();
  return { ...r, bot: bot.report, towers: m.towers.map((t) => `${t.name}(${t.up.linear}${t.up.branch || ''}${t.up.branchLevel || ''})`), simSeconds: m.tick * SIM_DT, match: m };
}

/** Re-run a recorded match from its result (seed + log) and return the final hash. */
export function replay(result, { content, mapWorld, loadout, levels, options }) {
  const m = new Match({ content, mapWorld, difficulty: result.difficulty, seed: result.seed, loadout, levels, options });
  const log = result.log.filter((c) => c.type !== 'autoAbility');
  let i = 0;
  while (m.tick < result.ticks) {
    while (i < log.length && log[i].tick === m.tick) {
      const { tick, ...cmd } = log[i++];
      m.queue.push(cmd);
    }
    m.step();
    m.drainEvents();
  }
  return m.hash();
}
