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

## 0.4.0 - Milestone 4: vertical slice (2026-11-05)
- Playable 20-wave match on Riftline Valley: loadout + difficulty screen, build anywhere off the
  road from any camera (orbit, overview, first person crosshair, touch tap), select / upgrade
  (linear, then path A or B, evolutions) / move / sell / targeting modes, 3 abilities (manual or
  AUTO), next-wave skip, 1x / 2x speed, pause, victory / defeat screens with rewards saved once.
- Gravemaw boss modelled in Blender (Walk, Idle, Attack, Roar, Death) with boss bar, phase
  banners and telegraphed stomps; 8 code-built towers, 8 code-built enemies, 2 summons.
- Instanced animated enemies, VFX (particles, rings, lightning, damage numbers), health bars.
- Synthesized sound effects with volume, mute and captions; damage numbers toggle.
- First-match tutorial driven by real actions.
