# Changelog

## 0.1.0 - Milestone 1 (2026-11-05)
- Project setup: package.json, vendored Three.js 0.187.0, zero-dependency dev server, ESLint,
  Node test runner, Playwright (desktop + emulated Pixel 7).
- Art style guide (`docs/art-style.md`).
- Pure core: seeded RNG, fixed timestep, terrain from data, collision world, deterministic map
  layout, character controller, soak bot.
- First map "Riftline Valley" (data), 23 procedural prop models, baked pixel terrain texture, sky,
  clouds, mountains, grass, path stones.
- Procedural Commander hero with code animation (idle, walk, sprint, jump).
- Cameras: third person orbit with collision, first person, free fly, top overview; return key.
- Input: keyboard, mouse look (right-drag and pointer lock), wheel zoom, touch joystick, drag look,
  pinch zoom, on-screen buttons.
- HUD and settings dialog with accessibility options; settings saved with in-memory fallback.

## 0.2.0 - Milestone 2 (2026-11-05)
- Pure deterministic match simulation (`src/sim/`): waves, 11 enemy archetypes + boss phases,
  11 towers with branching upgrades and in-match evolutions, targeting modes, damage types,
  resistances, armor, shields, status effects, summons, mines, auras, air units, abilities, hero.
- Commands with validation, logging and replay; state hash for determinism checks.
- Versioned saves: migrations, sanitizing, export/import with checksum, backup, rewards once.
- Content validation, data-driven progression (`data/progression.json`), difficulty cash scaling.
- Balance bot (`npm run balance`); upgrade prices tuned from bot findings.

## 0.3.0 - Milestone 3 (2026-11-05)
- Blender pipeline in the repo (`tools/blender/`): helper library and builders; 6 rigged, animated,
  low-poly GLB models (Rifleman, Ember Adept, Rocket Battery, Husk, Gloomwing, Ironshell).
- Model manifest `data/models.json`; data references (`model.glb`) validated.
- GLB loader with the game's material style and animation mixers.
- Asset viewer (`viewer.html`) and contact-sheet review script (`tools/review-assets.mjs`).
- Meshy dry-run done (30 credits per model); generation blocked by the free plan (no credits spent).
