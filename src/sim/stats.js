// Tower stat computation: base stats + lobby level + in-match upgrades (linear then branch).
// Pure and data-driven: upgrade steps use mul / add / set with dotted paths.

export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function getPath(obj, path) {
  let o = obj;
  for (const k of path.split('.')) {
    if (o == null) return undefined;
    o = o[k];
  }
  return o;
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = clone(value);
}

/** Apply one upgrade step's ops to stats (mutates and returns stats). */
export function applyOps(stats, step) {
  for (const [k, v] of Object.entries(step.set || {})) setPath(stats, k, v);
  for (const [k, v] of Object.entries(step.add || {})) setPath(stats, k, (getPath(stats, k) ?? 0) + v);
  for (const [k, v] of Object.entries(step.mul || {})) {
    const cur = getPath(stats, k);
    if (typeof cur === 'number') setPath(stats, k, cur * v);
  }
  return stats;
}

/** Ordered list of upgrade steps a tower has bought. */
export function ownedSteps(def, up) {
  const steps = (def.upgrades?.linear || []).slice(0, up.linear);
  if (up.branch) steps.push(...def.upgrades.branches[up.branch].steps.slice(0, up.branchLevel));
  return steps;
}

/** Next purchasable step: {step, kind:'linear'|'branch', branch} or null; needs branch choice when ambiguous. */
export function nextStep(def, up, branch) {
  const lin = def.upgrades?.linear || [];
  if (up.linear < lin.length) return { step: lin[up.linear], kind: 'linear' };
  const branches = def.upgrades?.branches || {};
  const b = up.branch || branch;
  if (!b) return Object.keys(branches).length ? { needsBranch: true, options: Object.keys(branches) } : null;
  const br = branches[b];
  if (!br) return null;
  if (up.branchLevel >= br.steps.length) return null;
  return { step: br.steps[up.branchLevel], kind: 'branch', branch: b };
}

export const DEFAULT_PROGRESSION = {
  maxLevel: 10,
  perLevel: { damage: 0.04, range: 0.01 },
  evolutions: [
    { level: 5, prefix: 'Veteran', mul: { damage: 1.1 } },
    { level: 10, prefix: 'Elite', mul: { damage: 1.15, range: 1.05 } },
  ],
};

/** Permanent lobby level bonuses (level 1 = no bonus). */
export function applyLobby(stats, def, level = 1, prog = DEFAULT_PROGRESSION) {
  const lv = Math.max(1, Math.min(prog.maxLevel, level | 0));
  let name = def.name;
  for (const [k, per] of Object.entries(prog.perLevel)) {
    const cur = getPath(stats, k);
    if (typeof cur === 'number') setPath(stats, k, cur * (1 + per * (lv - 1)));
  }
  const evos = def.lobby?.evolutions || prog.evolutions;
  let evolved = null;
  for (const e of evos) {
    if (lv >= e.level) {
      applyOps(stats, { mul: e.mul || {} });
      name = e.name || `${e.prefix} ${def.name}`;
      evolved = e;
    }
  }
  return { name, level: lv, evolved };
}

/** Full stats for a tower instance. */
export function towerStats(def, up = { linear: 0, branch: null, branchLevel: 0 }, lobbyLevel = 1, prog) {
  const stats = clone(def.stats);
  const lobby = applyLobby(stats, def, lobbyLevel, prog);
  let name = lobby.name;
  let evolvedInMatch = false;
  for (const s of ownedSteps(def, up)) {
    applyOps(stats, s);
    if (s.evolve) { name = s.evolve; evolvedInMatch = true; }
  }
  const tier = up.linear + up.branchLevel;
  return { stats, name, tier, evolvedInMatch, lobbyLevel: lobby.level, lobbyEvolved: lobby.evolved };
}

/** Cost of everything bought so far (base + steps). */
export function totalSpent(def, up) {
  return def.cost + ownedSteps(def, up).reduce((s, st) => s + st.cost, 0);
}
