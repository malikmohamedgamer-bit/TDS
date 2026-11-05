# TDS progress

Resume point for any new session. Read this, then `CLAUDE.md`, before touching code.

## Status

| Milestone | State |
|---|---|
| 0. Setup check | Done (2026-11-05) |
| 1. Art style, scaffold, 3D scene, character, cameras, collision | **Done (2026-11-05)** |
| 2. Simulation core: paths, towers, targeting, damage, waves, economy, saves, tests | Next |
| 3. Art pipeline proof (Blender, packs, Meshy), asset viewer | Not started |
| 4. Vertical slice, then STOP for the owner to play | Not started |
| 5-9 | Not started |

## Real content counts (end of milestone 1)

| Content | Count |
|---|---|
| Maps | 1 (Riftline Valley, hand-placed + seeded scatter) |
| Prop types | 23 procedural low-poly props (data/props.json) |
| Towers / enemies / bosses / heroes | 0 / 0 / 0 / 1 (procedural Commander model, movement only) |
| Unit tests | 11 (node --test) |
| E2E tests | 7 (6 desktop, 1 emulated phone) |

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

## Next exact action

Milestone 2: create `src/sim/` (pure): enemy path following on `map.paths`, tower data model,
targeting modes, damage types and resistances, wave tables, economy, match state machine; data
files `data/towers/*.json`, `data/enemies/*.json`, `data/waves/*.json`, `data/difficulties.json`;
versioned save format with migrations, export/import, backup. Unit tests for all of it.

## Known weak spots (honest)

- Enemy portal void is static concentric rings (reads a bit like a target); animate a swirl shader in the VFX milestone.
- Hero is a code-built model with code animation; a rigged Blender/Mixamo version comes in milestone 3.
- Frame times so far are only from headless software rendering (SwiftShader, ~10 fps at 1280x720
  High); no real-GPU measurement yet.
- 245 draw calls at High (shadow pass doubles instanced batches); fine for desktop, phones default to Low.
