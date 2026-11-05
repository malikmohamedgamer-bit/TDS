# TDS progress

Resume point for any new session. Read this, then `CLAUDE.md`, before touching code.

## Status

| Milestone | State |
|---|---|
| 0. Setup check | Done (2026-11-05) |
| 1. Art style, scaffold, 3D scene, character, cameras, collision | Done (2026-11-05) |
| 2. Simulation core: paths, towers, targeting, damage, waves, economy, saves, tests | Done (2026-11-05) |
| 3. Art pipeline proof (Blender, packs, Meshy), asset viewer | **Done (2026-11-05)**, Meshy blocked (see below) |
| 4. Vertical slice, then STOP for the owner to play | Next |
| 5-9 | Not started |

## Real content counts (end of milestone 3)

| Content | Count |
|---|---|
| Maps | 1 (Riftline Valley) |
| Towers (data + sim) | 11 (6 War, 5 Magic) |
| Enemies | 11 + 1 boss |
| Rigged, animated GLB models (Blender) | 6: Rifleman, Ember Adept, Rocket Battery (towers); Husk, Gloomwing, Ironshell (enemies) |
| Procedural (code) models | 23 props + hero |
| Meshy models | 0 (API refuses task creation on the free plan; 100 credits untouched) |
| Asset packs / Mixamo | 0 (none dropped into assets/packs or assets/incoming yet) |
| Unit tests | 36 |
| E2E tests | 8 |

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

- Art pipeline (milestone 3): `tools/blender/tdslib.py` (palette materials, primitives with UVs,
  armatures, rigid bone binding, NLA clips, checked GLB export) + `tools/blender/assets.py` (one
  builder per asset). Run them in Blender through the MCP (see README "Adding art").
  Master file `assets/blend/tds_assets.blend` (one collection per asset). GLBs in `assets/models`,
  listed in `data/models.json`; towers/enemies reference them with `model.glb`.
- `src/engine/models.js`: GLB loading, style pass (flat shading, pixel grain, clamped glow),
  skeleton-safe cloning, AnimationMixer clips with crossfade.
- `viewer.html` asset viewer: every GLB, prop and the hero; front/back/left/right/top/3-4 views,
  animations, wireframe, hero for scale. `node tools/review-assets.mjs docs/screenshots/<dir>`
  writes a contact sheet per asset.

## Next exact action

Milestone 4 (vertical slice): connect `src/sim/match.js` to the renderer in `src/main.js`
(match view: enemies from GLB / procedural models with clips, towers with idle/attack, projectiles,
explosions, damage numbers, range rings), placement preview from any camera (raycast to terrain,
range circle, valid/invalid by shape + text), tower select / upgrade (A/B branches) / move / sell /
targeting UI, abilities bar (manual / auto), wave + cash + keep HP HUD, game over / victory,
tutorial, and Blender models for the remaining 8 towers, 8 enemies and the Gravemaw boss (code
models are acceptable for the less important ones). Then STOP and ask the owner to play.

## Known weak spots (honest)

- Enemy portal void is static concentric rings (reads a bit like a target); animate a swirl shader in the VFX milestone.
- Hero is still the code-built model with code animation (Meshy was blocked); a Blender version can replace it.
- Rocket Battery radar dish reads as a grey blob from behind; Gloomwing wing spars overshoot slightly.
- Blender models use flat palette colours plus the shared grain texture, not per-asset pixel textures.
- Meshy: `meshy text-to-3d create` returns HTTP 402 "Task creation on the free plan is no longer
  supported". Options for the owner: upgrade the Meshy plan, or generate on meshy.ai and drop the GLB
  into assets/incoming for me to clean, rig and import.
- Frame times so far are only from headless software rendering (SwiftShader, ~10 fps at 1280x720
  High); no real-GPU measurement yet.
- 245 draw calls at High (shadow pass doubles instanced batches); fine for desktop, phones default to Low.
