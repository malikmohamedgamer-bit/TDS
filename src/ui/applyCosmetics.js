// Applies the equipped interface theme: sets the item's CSS custom properties on the page and
// clears the ones another theme set before.
import { equippedCosmetic } from '../meta/cosmetics.js';

export function applyUiTheme(save, content, root = document.documentElement) {
  const all = new Set();
  for (const it of content.cosmetics?.items || []) for (const k of Object.keys(it.vars || {})) all.add(k);
  for (const k of all) root.style.removeProperty(k);
  const cur = equippedCosmetic(save, content, 'uiTheme');
  for (const [k, v] of Object.entries(cur?.vars || {})) if (k.startsWith('--')) root.style.setProperty(k, v);
  root.dataset.uiTheme = cur?.id || '';
}
