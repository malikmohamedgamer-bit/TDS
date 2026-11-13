// Scripted co-op players for tests: every few ticks each player issues seeded random commands
// (place, upgrade, target, sell, move, hero walk, abilities, wave skip) with its own pid. The
// script only reads the match it is given, so the same script on two matches in the same state
// issues the same commands (determinism and snapshot tests). It also issues some commands that
// must be refused (another player's tower), which exercises the ownership checks.
import { Rng } from '../../../src/core/rng.js';
import { TARGET_MODES } from '../../../src/sim/combat.js';

/** Grid spots near the roads (where towers can go), computed once per map world. */
export function roadSpots(m, step = 2.5, maxDist = 14) {
  const out = [];
  const b = m.mw.world.bounds;
  for (let x = b.minX + 3; x < b.maxX - 3; x += step) {
    for (let z = b.minZ + 3; z < b.maxZ - 3; z += step) {
      if (m.mw.terrain.pathInfo(x, z).d <= maxDist) out.push({ x, z });
    }
  }
  return out;
}

/**
 * @param {object} m          the match (only used for the spot grid)
 * @param {object} o
 * @param {string} o.seed
 * @param {number} [o.every]  ticks between decisions
 * @param {string[]} [o.favour] tower ids placed first (summoners, mine layers) so tests see them
 * @returns {(m: object) => object[]} commands for the coming tick
 */
export function createScript(m, { seed = 'script', every = 15, favour = [] } = {}) {
  const rng = new Rng(`${seed}:script`);
  const spots = roadSpots(m);
  let started = false;
  return function next(match) {
    const cmds = [];
    if (!started) {
      started = true;
      // every second player lets its abilities fire on their own
      match.players.forEach((p, i) => {
        if (i % 2) for (const a of match.abilitiesOf(p.pid)) cmds.push({ type: 'abilityMode', id: a.id, mode: 'auto', pid: p.pid });
      });
    }
    if (match.tick % every !== 0 || match.phase === 'won' || match.phase === 'lost') return cmds;
    for (const p of match.players) {
      const pid = p.pid;
      const mine = match.towers.filter((t) => t.owner === pid);
      const others = match.towers.filter((t) => t.owner !== pid);
      const roll = rng.next();
      const loadout = p.loadout || match.loadout;
      if (roll < 0.4) {
        const pref = favour.find((id) => loadout.includes(id) && !mine.some((t) => t.defId === id));
        const tower = pref || rng.pick(loadout);
        for (let tries = 0; tries < 6; tries++) {
          const s = rng.pick(spots);
          const cmd = { type: 'place', tower, x: s.x, z: s.z, pid };
          if (match.validate(cmd).ok) { cmds.push(cmd); break; }
        }
      } else if (roll < 0.62 && mine.length) {
        const t = rng.pick(mine);
        let cmd = { type: 'upgrade', uid: t.uid, branch: rng.chance(0.5) ? 'A' : 'B', pid };
        const v = match.validate(cmd);
        if (v.code === 'branch') cmd = { ...cmd, branch: v.options[0] };
        cmds.push(cmd);
      } else if (roll < 0.68 && mine.length) {
        cmds.push({ type: 'target', uid: rng.pick(mine).uid, mode: rng.pick(TARGET_MODES), pid });
      } else if (roll < 0.7 && mine.length > 3) {
        cmds.push({ type: 'sell', uid: rng.pick(mine).uid, pid });
      } else if (roll < 0.73 && mine.length) {
        const s = rng.pick(spots);
        cmds.push({ type: 'move', uid: rng.pick(mine).uid, x: s.x, z: s.z, pid });
      } else if (roll < 0.8) {
        const s = rng.pick(spots);
        cmds.push({ type: 'hero', x: s.x, z: s.z, pid });
      } else if (roll < 0.9) {
        const a = match.abilitiesOf(pid).find((x) => x.ready <= match.time && x.mode === 'manual');
        const e = match.enemies.find((x) => x.alive);
        if (a && e) cmds.push({ type: 'ability', id: a.id, x: e.x, z: e.z, pid });
      } else if (roll < 0.93 && others.length) {
        // not allowed: someone else's tower (validate refuses it with code 'owner')
        cmds.push({ type: 'upgrade', uid: rng.pick(others).uid, pid });
      } else if (roll < 0.95 && match.canSkip()) {
        cmds.push({ type: 'skip', pid });
      }
    }
    return cmds;
  };
}
