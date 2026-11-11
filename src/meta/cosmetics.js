// Cosmetics (pure, no DOM): looks earned by playing. Ownership is derived from the save through
// the same conditions as quests (never stored, so it cannot be edited in), only the equipped
// choice per kind is saved (save.cosmetics = {kind: itemId}).
import { condProgress } from './meta.js';

const items = (content) => content.cosmetics?.items || [];

/** Every item with {unlocked, progress, target, equipped}. */
export function cosmeticStatus(save, content) {
  return items(content).map((it) => {
    const p = it.unlock ? condProgress(it.unlock, save, content) : { progress: 1, target: 1 };
    return { ...it, ...p, unlocked: p.progress >= p.target, equipped: equippedCosmetic(save, content, it.kind)?.id === it.id };
  });
}

/** The equipped item of a kind; falls back to the kind's first item (the default look) when the
 *  saved choice is unknown or no longer unlocked. */
export function equippedCosmetic(save, content, kind) {
  const list = items(content).filter((it) => it.kind === kind);
  const want = list.find((it) => it.id === save.cosmetics?.[kind]);
  if (want && (!want.unlock || unlocked(want, save, content))) return want;
  return list[0] || null;
}

function unlocked(it, save, content) {
  const p = condProgress(it.unlock, save, content);
  return p.progress >= p.target;
}

export function equipCosmetic(save, content, id) {
  const it = items(content).find((x) => x.id === id);
  if (!it) return { ok: false, reason: 'Unknown item' };
  if (it.unlock && !unlocked(it, save, content)) return { ok: false, reason: `Locked: ${it.how || 'keep playing'}` };
  save.cosmetics = { ...(save.cosmetics || {}), [it.kind]: it.id };
  return { ok: true, item: it };
}
