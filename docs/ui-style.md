# TDS UI style

The UI is a **war table**: field-desk slate panels with cut (chamfered) corners and brass trim,
dressed per faction. It must never look like a stock web template. Tokens live in
`styles/tokens.css`; icons in `src/ui/icons.js`. Colour values come from `docs/art-style.md`
(palette system); this page only decides how they are used.

## 1. Type

No web fonts and no external requests. Three local system stacks:

| Token | Stack | Use |
|---|---|---|
| `--font-ui` | "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif | body, labels, numbers |
| `--font-display` | "Bahnschrift", "DIN Alternate", "Arial Narrow", "Roboto Condensed", sans-serif-condensed, sans-serif | headings, tabs, buttons, HUD numbers (condensed, stencil-like) |
| `--font-lore` | "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif | Magic headings and flavour text |

Scale (ratio 1.25, base 16 px x text scale): `--fs-0` 0.64rem (micro labels), `--fs-1` 0.8rem,
`--fs-2` 1rem, `--fs-3` 1.25rem, `--fs-4` 1.56rem, `--fs-5` 1.95rem, `--fs-6` 2.44rem.
Numbers are always `font-variant-numeric: tabular-nums`. Headings and tabs are uppercase with
0.06-0.14em tracking; body text is sentence case and never uppercase.

## 2. Spacing and shape

Spacing steps (4 px grid): `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 24, `--s-6` 32.
Panels use a **chamfer** (`--cut` 10 px, `clip-path` cut corners) instead of a plain radius;
small chips use `--cut-s` 6 px. Round shapes are reserved for ability buttons and avatars, so a
circle always means "castable".

## 3. Colour tokens

| Token | Value | Use |
|---|---|---|
| `--ink-0..4` | #07080c, #0d0f15, #12141c, #1a1e2a, #262b3d | backgrounds, panels, wells, raised, lines |
| `--text`, `--text-2`, `--text-3` | #f4f6fb, #a9b0c2, #6f7891 | primary, secondary, disabled |
| `--brass`, `--brass-2` | #ffd166, #b8903c | neutral trim, focus, the one main action glow |
| `--go` | #3fb950 | primary action (Start, Claim, Buy when affordable) |
| `--stop` | #e5484d | danger, invalid, loss |
| Magic | `--m-1` #7b4dff violet, `--m-2` #2ec4b6 teal, `--m-gold` #ffd166, `--m-night` #1e1b4b, `--m-glow` #c9a7ff | |
| Modern War | `--w-1` #5b6b3a olive, `--w-2` #c2b280 khaki, `--w-haz` #f28c28, `--w-steel` #3d4451, `--w-light` #8a9a66 | |
| Rarity | common #b0b7c3, uncommon #5fd068, rare #3fa9f5, epic #b15cff, legendary #ffb627, mythic #ff4d6d | always paired with badge shape + label |

## 4. Faction dressing

Any element with `data-faction="magic" | "war"` (or class `f-magic` / `f-war`) switches the
panel dress; menus without a faction use the neutral brass dress.

- **Neutral**: slate panel, 1 px brass hairline inside a 2 px dark rim, brass corner ticks.
- **Magic**: night-violet gradient, double gold rule, a glowing rune row (`✦ ᚱ ✧`) drawn by CSS
  pseudo-elements, lore serif headings, violet glow on hover.
- **Modern War**: olive-steel plate, hazard-stripe top edge, rivet dots in the corners
  (radial gradients), condensed stencil headings, khaki labels.

## 5. Components

- **Button**: chunky, min 44 px, condensed uppercase label, 3 px bottom lip that compresses on
  press (translateY 2 px). Variants: `primary` (go green), `brass` (featured), `danger`, `ghost`.
  Only one primary button per view.
- **Tabs**: icon + label, active tab has a brass underline and lifted plate; badges are
  numbered red chamfered tags.
- **Cards**: thumbnail well, name, meta line, rarity badge (icon + label), cost. Locked cards
  show a lock icon and a reason, never only grey.
- **Bars**: segmented look (repeating gradient ticks) for HP, XP, wave progress.
- **Tooltips**: `data-tip` on any element; shown on hover and keyboard focus; never the only
  place information lives on touch.
- **Toasts**: chamfered tag with icon (check / cross / info), `role="status"`.

## 6. Icons

All icons are inline SVG from `src/ui/icons.js`: 24 x 24 grid, 2 px stroke, round joins, flat
fills from tokens (`currentColor` + one accent). Tower classes, enemy archetypes, damage types,
abilities, currencies and rarity badges each have one. Emoji are not used as icons.

## 7. Motion

- Durations: press 90 ms, hover 160 ms, panel in 240 ms, reward counters 900 ms.
- Easing: `--ease-out` cubic-bezier(.2,.8,.2,1); `--ease-pop` cubic-bezier(.2,1.6,.4,1) for rewards only.
- Nothing loops forever except the "ready" glow on the main action and castable abilities.
- `body.reduced-motion` and `prefers-reduced-motion` turn every transition and animation off;
  counters jump to their final value.

## 8. Accessibility

Focus ring: 3 px brass outline, 2 px offset, on every interactive element. Touch targets 44 px.
High contrast mode: pure black panels, white 3 px borders, no gradients. Information is never
colour-only (icons, labels, shapes). Live regions announce wave starts, boss phases and rewards.

## 9. Avoid

- Stock rounded rectangles with a 1 px grey border, pill buttons everywhere, glassmorphism blur
  on everything, centred-everything layouts, default blue links.
- Emoji as icons; more than one glowing element per view; gradients on body text.
- Walls of equal-weight buttons: every view has one obvious main action.
