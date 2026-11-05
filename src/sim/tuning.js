// Resolves data/tuning.json (preset + optional assists) into one flat set of knobs used by the
// simulation. Pure. Missing tuning data means "everything 1x" (the original data values).

export const KNOBS = ['enemyHp', 'enemySpeed', 'enemyCount', 'startCash', 'killIncome', 'waveBonus', 'towerCost', 'upgradeCost',
  'heroDamage', 'bossHp', 'bossPhaseSpeed', 'keepHp', 'sellRefund', 'rewardMul'];
export const ASSISTS = ['extraCash', 'slowEnemies', 'heroBoost', 'fullRefund', 'skipWave'];

const NEUTRAL = { enemyHp: 1, enemySpeed: 1, enemyCount: 1, startCash: 1, killIncome: 1, waveBonus: 1, towerCost: 1, upgradeCost: 1, heroDamage: 1, bossHp: 1, bossPhaseSpeed: 1, keepHp: 1, sellRefund: 0.7, rewardMul: 1 };

/**
 * @param {object|null} tuning  data/tuning.json
 * @param {string} [presetId]   overrides tuning.preset
 * @param {object} [assist]     {extraCash, slowEnemies, heroBoost, fullRefund, skipWave} booleans
 */
export function resolveTuning(tuning, presetId, assist = {}) {
  const id = presetId || tuning?.preset || 'standard';
  const preset = tuning?.presets?.[id];
  if (tuning && !preset) throw new Error(`Unknown tuning preset "${id}"`);
  const k = { ...NEUTRAL, ...(preset || {}) };
  for (const key of KNOBS) if (typeof k[key] !== 'number' || !Number.isFinite(k[key])) k[key] = NEUTRAL[key];
  const on = ASSISTS.filter((a) => assist?.[a]);
  const a = tuning?.assist || {};
  let startCashAdd = 0;
  let skipWave = false;
  if (on.includes('extraCash')) startCashAdd = a.extraCash?.startCashAdd ?? 400;
  if (on.includes('slowEnemies')) k.enemySpeed *= a.slowEnemies?.enemySpeed ?? 0.75;
  if (on.includes('heroBoost')) k.heroDamage *= a.heroBoost?.heroDamage ?? 2.5;
  if (on.includes('fullRefund')) k.sellRefund = a.fullRefund?.sellRefund ?? 1;
  if (on.includes('skipWave')) skipWave = a.skipWave?.allowed !== false;
  return { id, label: preset?.label || id, ...k, startCashAdd, skipWave, assists: on, assisted: on.length > 0 };
}

/** Values outside tuning.safeRanges (for validation and docs). */
export function tuningWarnings(tuning) {
  const out = [];
  for (const [pid, p] of Object.entries(tuning?.presets || {})) {
    for (const key of KNOBS) {
      const r = tuning.safeRanges?.[key];
      if (r && typeof p[key] === 'number' && (p[key] < r[0] || p[key] > r[1])) out.push(`${pid}.${key}=${p[key]} outside [${r[0]}, ${r[1]}]`);
    }
  }
  return out;
}

/** Round costs to friendly numbers. */
export const roundCost = (v) => Math.max(5, Math.round(v / 5) * 5);
