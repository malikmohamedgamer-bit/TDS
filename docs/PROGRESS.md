# TDS progress

Resume point for any new session. Read this, then `CLAUDE.md`, before touching code.

## Status

| Milestone | State |
|---|---|
| 0. Setup check | Done (2026-11-05) |
| 1. Art style, scaffold, 3D scene, character, cameras, collision | Done (2026-11-05) |
| 2. Simulation core: paths, towers, targeting, damage, waves, economy, saves, tests | **Done (2026-11-05)** |
| 3. Art pipeline proof (Blender, packs, Meshy), asset viewer | Next |
| 4. Vertical slice, then STOP for the owner to play | Not started |
| 5-9 | Not started |

## Real content counts (end of milestone 2)

| Content | Count |
|---|---|
| Maps | 1 (Riftline Valley) |
| Towers (data + sim) | 11 (6 War, 5 Magic), each with 2 linear steps + 2 branches (evolutions) |
| Enemies | 11 + 1 boss (Gravemaw, 3 phases) |
| Wave sets | 1 (20-wave campaign, bosses on 10 and 20) |
| Difficulties | 8 (Relaxed + Easy..Impossible) |
| Abilities / heroes | 3 / 1 |
| Prop types | 23 |
| Unit tests | 34 |
| E2E tests | 7 |
| Tower / enemy 3D models | 0 (they exist only in the simulation so far) |

## What exists

- Vanilla ES modules, no build. Three.js 0.187.0 vendored in `vendor/three` (`npm run vendor` re-copies).
- `src/core/` is pure (no DOM, no Three): seeded RNG (sfc32, serialisable), fixed-timestep loop,
  terrain height field from map data (hills, rim, landmark flats, path corridors), XZ collision world
  (circles, rotated boxes, compound shapes, spatial hash, step-up/floors), deterministic map layout
  (props + seeded scatter), character controller (walk, sprint, jump with coyote time and buffering,
  step-up, slope snapping, wall sliding, safety net), soak bot.
- `src/engine/`: renderer (ACES, soft shadows, bloom, vignette, pixelation, quality tiers), map view
  (baked pixel terrain texture, outer world ring, sky shader, clouds, mountains, instanced and
  chunked props, grass, path stones), procedural hero with code animation, camera rig (orbit,
  first person, free fly, top overview, camera collision).
- `src/input/`: keyboard + mouse (right-drag, pointer lock), touch (joystick, drag look, pinch,
  44 px+ buttons).
- `src/ui/hud.js`: top bar, camera chip, controls card, toasts, settings dialog (quality,
  pixelation, bloom, vignette, frame time, reduced motion, high contrast, text size, sensitivity,
  invert Y). Settings persist in localStorage with in-memory fallback (`src/save/`).
- `window.TDS` debug/test hooks (used by Playwright and screenshots).

- `src/sim/` (pure, deterministic): `match.js` (waves, enemies with all archetype behaviours, towers,
  projectiles, chains, splash, burn/slow/freeze/stun/mark, summoned allies that block, mines, support
  auras, air units, boss phases with telegraphs, hero auto-attack, abilities manual/auto, economy,
  commands with validation + log, hash, result), `stats.js` (upgrade ops, lobby levels),
  `combat.js` (damage, targeting), `path.js`, `bot.js` (balance bot + replay).
- `src/save/save.js`: schema v2, v1 migration, sanitize, export/import with checksum, backup,
  rewards granted once.
- Balance (bot, seed bal0): Normal L1 won (keep 111/150); Extra Hard L9, Extreme L12, Impossible
  L15 won; Medium L3 and Hard L6 lose at the final boss (gates about 1 level higher); a 2-tower
  strategy loses at wave 13.

## Next exact action

Milestone 3: art pipeline proof. In Blender (MCP) build 3 towers (Rifleman, Ember Adept, Rocket
Battery) and 3 enemies (Husk, Gloomwing, Ironshell) as modular low-poly GLBs following
docs/art-style.md; save .blend files under assets/blend; export to assets/models. Check
assets/packs and assets/incoming for owner-dropped CC0 packs / Mixamo FBX. Meshy: run a dry-run
for one hero/boss model, show the credit cost, and ASK before generating. Build the in-game asset
viewer (`?viewer`) with 4-angle screenshots.

## Known weak spots (honest)

- Enemy portal void is static concentric rings (reads a bit like a target); animate a swirl shader in the VFX milestone.
- Hero is a code-built model with code animation; a rigged Blender/Mixamo version comes in milestone 3.
- Frame times so far are only from headless software rendering (SwiftShader, ~10 fps at 1280x720
  High); no real-GPU measurement yet.
- 245 draw calls at High (shadow pass doubles instanced batches); fine for desktop, phones default to Low.
