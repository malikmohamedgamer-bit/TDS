# TDS progress

Resume point for any new session. Read this, then `CLAUDE.md`, before touching code.

## Status

| Milestone | State |
|---|---|
| 0. Setup check | Done (2026-11-05) |
| 1. Art style, scaffold, 3D scene, character, cameras, collision | Done (2026-11-05) |
| 2. Simulation core: paths, towers, targeting, damage, waves, economy, saves, tests | Done (2026-11-05) |
| 3. Art pipeline proof (Blender, packs, Meshy), asset viewer | Done (2026-11-05), Meshy blocked (see below) |
| 4. Vertical slice, then STOP for the owner to play | **Done (2026-11-05): waiting for the owner's playtest** |
| 5-9 | Not started |

## Real content counts (end of milestone 4, vertical slice)

| Content | Count |
|---|---|
| Maps | 1 (Riftline Valley, 20-wave campaign) |
| Towers (playable, modelled, animated) | 11: 3 Blender GLB + 8 code-built |
| Enemies (playable, modelled, animated) | 11: 3 Blender GLB + 8 code-built |
| Bosses | 1 (Gravemaw, Blender GLB, 3 phases, telegraphed stomps) |
| Summoned allies | 2 (spirit wolf, spirit drake) |
| Heroes / abilities | 1 / 3 (manual or AUTO) |
| Difficulties | 8 |
| Unit tests / E2E tests | 36 / 14 |

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

- Vertical slice (milestone 4): `src/game/matchController.js` (match lifecycle, input routing,
  events to VFX / audio / banners, rewards once), `src/engine/matchView.js` (instanced enemies
  and allies, tower models with aim / recoil / spin, gunship flight, projectiles, mines, health
  bars, telegraph rings, placement ghost + range ring with check / cross), `src/engine/instancedRig.js`
  (bakes GLB clips and code animations into per-frame part matrices; one draw call per part per
  enemy type), `src/engine/unitModels.js`, `src/engine/effects.js` (pixel particles, rings,
  lightning, damage numbers), `src/engine/thumbnails.js` (UI portraits rendered from the models),
  `src/ui/matchHud.js`, `src/ui/tutorial.js`, `src/audio/sfx.js` (synthesized sound + captions).

## Next exact action

STOP: the owner playtests the vertical slice (`npm run dev`). Collect feedback first. Then
milestone 5: lobby (walkable lobby area or menu), permanent tower levels with crowns, slot-machine
summoning (gacha + shop, free currency only, skippable animations), Index, account level / XP,
quests and achievements (rewards once), using `data/progression.json` and `src/save/save.js`.

## Known weak spots (honest)

- Vertical slice: no lobby / shop / summoning yet (milestone 5); all 11 towers are free to pick.
- No music yet (sound effects only); music comes with the polish milestone.
- Code-built towers and enemies are simpler than the Blender ones and animate by code poses.
- Game speed 2x is available from the start (unlock rules are milestone 6).

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
