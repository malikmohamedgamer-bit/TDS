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
