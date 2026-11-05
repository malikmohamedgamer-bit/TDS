# TDS (working title)

A 3D browser tower defense game. Two factions, **Magic** (mages, summoners, spirits, dragons) and
**Modern War** (soldiers, snipers, gunners, rockets, helicopters), hold a valley against **the
Blight**. You walk around the map as a commander, build towers anywhere off the road, upgrade
them down branching paths, and fight with your own abilities.

Status: in development. See `docs/PROGRESS.md` for what works today.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. No build step: plain ES modules, Three.js vendored in `vendor/three`.
To play on a phone on the same Wi-Fi: `node tools/dev-server.mjs --host 0.0.0.0` and open the
printed network address.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Walk / sprint / jump | WASD or arrows, Shift, Space | left joystick, Sprint, Jump |
| Look | right-mouse drag, or L / middle click for mouse-lock | drag anywhere |
| Zoom | mouse wheel | pinch |
| First person | V | 1st |
| Free camera (fly) | F, then WASD + Q/E, wheel = speed | Free, Up / Down |
| Map overview | T | Map |
| Back to character | C | Me |
| Settings | Esc or the gear | gear |

## Rules and formulas

All numbers live in `data/` and can be changed without touching code.

- **Enemy health** = base hp x difficulty `hpMul` x (1 + `hpScalePerWave` x (wave - 1)) x group `hpMul`.
  Shields scale the same way.
- **Difficulties** (`data/difficulties.json`): Easy 0.67x, Normal 1x, Medium 1.5x, Hard 2.25x,
  Extra Hard 3.4x, Extreme 5.1x, Impossible 7.6x enemy health (each step 1.5x). In-match cash from
  kills and wave bonuses is multiplied by sqrt(hpMul); meta rewards by `metaRewardMul`.
  Relaxed: Easy health, 80% enemy speed, double keep health.
- **Damage taken** = amount x resist[type] x (1 + mark) x airBonus (vs flying) x (1 - armor x (1 - pierce))
  where armor only applies to physical and explosive, and pierce = max(type pierce, tower pierce).
  Shields absorb first; damage to shields is multiplied by the type's `vsShield` (lightning 1.6x,
  arcane 1.4x, poison 0.5x).
- **Status effects**: slow (strongest applies), burn (fire DoT, stops regeneration), freeze / stun
  (bosses take 25% of the duration), mark (+% damage taken from everything).
- **Targeting modes**: first, last, strongest, weakest, fastest, closest, flying-only. Stealth
  needs detection (own, or from a support aura); flying needs a tower that targets air.
- **Economy**: start cash per wave set; kill reward per enemy; wave bonus = `bonusBase` +
  `bonusPerWave` x wave, paid once per wave when the next wave starts (or at victory); income
  towers pay at the same time. Selling refunds 70% of everything spent on that tower.
- **Waves** start after the previous one is cleared plus the intermission, or after `maxDuration`,
  whichever is first. You can skip the wait. Bosses come every 10 waves in the campaign.
- **Upgrades**: in a match, towers buy linear steps first, then pick branch A or B; the last step
  of a branch evolves the tower (renamed, stronger) for that match. In the lobby, permanent levels
  (`data/progression.json`) add damage, rate and range per level and evolve the tower at levels 5,
  10 and 15.

## Adding content (data only)

Every content file is listed in `data/index.json`.

- **Tower**: add an entry to `data/towers/*.json` (stats, upgrades.linear, upgrades.branches,
  model.builder). New stat behaviours available by data: splash, chain, burn, slow, freeze, stun,
  mark, aura, income, summon, trap, air unit (`air`), armorPierce, airBonus, detection.
- **Enemy**: add to `data/enemies/*.json`. Behaviours by data: flying, stealth, armor, shield,
  regen, heal, split, summon, attack (hexes towers), resist.
- **Boss**: an enemy with `"boss": true` and `phases` (telegraph, summon, shield, speed).
- **Wave set**: add `data/waves/<id>.json` and point a map's `waves` at it.
- **Map**: add `data/maps/<id>.json` (size, terrain hills / rim / flats, paths, props, scatter rules).
- **Difficulty / ability / hero**: `data/difficulties.json`, `data/abilities.json`, `data/heroes.json`.

`npm test` validates all cross references (unknown enemy ids, damage types, props, abilities).

## Tests and tools

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run lint
```

```bash
npm run soak -- --minutes 30
```

```bash
npm run balance -- --difficulty normal --level 1 --verbose
```

- Unit tests (Node test runner) cover the pure simulation, saves, collision and soak.
- E2E tests (Playwright, desktop and an emulated Pixel 7) run the real game in headless Chromium.
  Headless uses software WebGL, so they wait on game state rather than wall-clock time.
- The balance bot plays whole matches headlessly; `--level` sets permanent tower levels,
  `--weak` plays a deliberately poor 2-tower strategy (should lose).
- `node tools/screenshots.mjs docs/screenshots/<name>` captures review shots from fixed angles.

## Project layout

```
data/           all game content (JSON)
src/core/       pure: RNG, fixed loop, terrain, collision, map layout, character, soak bot
src/sim/        pure: match simulation, stats, combat, balance bot
src/save/       settings and versioned progress saves
src/engine/     Three.js rendering (map, props, hero, cameras, post-processing)
src/input/      keyboard, mouse, touch
src/ui/         HUD and menus
test/           unit (Node) and e2e (Playwright)
tools/          dev server, soak, balance, screenshots, vendoring
docs/           art style, progress, credits, online plan
```
