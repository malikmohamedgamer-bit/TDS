// Battle report (pure): damage, kills and cost per placed tower type, plus match totals.
// Sold towers are not included (their record leaves the match with them).

/** @returns {{rows: {id, name, count, damage, kills, spent, share, perCash}[], total: number, hero: number, stats: object}} */
export function battleReport(match) {
  const by = new Map();
  for (const t of match.towers) {
    const r = by.get(t.defId) || { id: t.defId, name: t.def.name, count: 0, damage: 0, kills: 0, spent: 0 };
    r.count++;
    r.damage += t.damage || 0;
    r.kills += t.kills || 0;
    r.spent += t.spent || 0;
    by.set(t.defId, r);
  }
  const towerDamage = [...by.values()].reduce((a, r) => a + r.damage, 0);
  const total = Math.max(match.stats.damage || 0, towerDamage);
  const rows = [...by.values()].sort((a, b) => b.damage - a.damage || (a.id < b.id ? -1 : 1)).map((r) => ({
    ...r, damage: Math.round(r.damage), share: total > 0 ? r.damage / total : 0, perCash: r.spent > 0 ? r.damage / r.spent : 0,
  }));
  return { rows, total: Math.round(total), hero: Math.round(Math.max(0, total - towerDamage)), stats: { ...match.stats } };
}
