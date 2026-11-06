// Damage resolution and targeting. Pure functions over plain entity objects.

export const TARGET_MODES = ['first', 'last', 'strongest', 'weakest', 'fastest', 'closest', 'flying'];

/**
 * Damage an enemy actually takes from a packet, split into shield and health parts.
 * packet: {amount, type, armorPierce, airBonus, bossDamage, execute {below, mul}}
 * Returns {toShield, toHp} (raw values to subtract).
 */
export function resolveDamage(enemy, packet, damageTypes, now = 0) {
  const t = damageTypes.get(packet.type) || { vsShield: 1, armorApplies: false };
  let amt = packet.amount * (enemy.def.resist?.[packet.type] ?? 1);
  if (enemy.markUntil > now) amt *= 1 + enemy.mark;
  if (enemy.flying && packet.airBonus) amt *= packet.airBonus;
  if (enemy.boss && packet.bossDamage) amt *= packet.bossDamage; // boss-killer towers
  // execute: bonus damage to wounded enemies (not bosses)
  if (packet.execute && !enemy.boss && enemy.maxHp > 0 && enemy.hp / enemy.maxHp < packet.execute.below) amt *= packet.execute.mul;
  if (t.armorApplies && enemy.armor > 0) {
    const pierce = Math.max(t.armorPierce || 0, packet.armorPierce || 0);
    // shred: armour-breaking rounds strip part of the armour for a while
    const armor = enemy.shredUntil > now ? enemy.armor * (1 - enemy.shred) : enemy.armor;
    amt *= 1 - armor * (1 - Math.min(1, pierce));
  }
  let toShield = 0;
  if (enemy.shield > 0 && amt > 0) {
    const vs = t.vsShield ?? 1;
    const shieldDmg = amt * vs;
    if (shieldDmg <= enemy.shield) return { toShield: shieldDmg, toHp: 0 };
    toShield = enemy.shield;
    amt = (shieldDmg - enemy.shield) / vs;
  }
  return { toShield, toHp: Math.max(0, amt) };
}

/** Can this attacker (stats.targets, detection) target this enemy at all? */
export function canTarget(enemy, targets, detection) {
  if (!enemy.alive) return false;
  if (enemy.flying ? !targets.air : !targets.ground) return false;
  if (enemy.stealth && !detection) return false;
  return true;
}

/**
 * Pick a target among enemies within range of (x, z).
 * progress(e) = distance travelled along its path (larger = closer to the keep).
 */
export function pickTarget(enemies, { x, z, range, targets, detection, mode = 'first' }) {
  const r2 = range * range;
  let best = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (!canTarget(e, targets, detection)) continue;
    if (mode === 'flying' && !e.flying) continue;
    const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d2 > r2) continue;
    let s;
    switch (mode) {
      case 'last': s = -e.progress; break;
      case 'strongest': s = e.hp + e.shield + e.progress * 1e-6; break;
      case 'weakest': s = -(e.hp + e.shield) + e.progress * 1e-6; break;
      case 'fastest': s = e.curSpeed + e.progress * 1e-6; break;
      case 'closest': s = -d2; break;
      default: s = e.progress; // first + flying
    }
    if (s > bestScore || (s === bestScore && best && e.id < best.id)) { best = e; bestScore = s; }
  }
  return best;
}
