# TDS: project notes for Claude

Browser 3D tower defense (Magic vs Modern War defending against "the Blight"). Owner works on
Windows 11 in the Claude desktop app. Read `docs/PROGRESS.md` first: it has status, counts and the
exact next action.

## Rules that matter
- `src/core/` and `src/sim/` stay pure: no DOM, no Three.js, deterministic (seeded `Rng`, fixed
  timestep). Node tests and a future server import them directly.
- All content is JSON under `data/` and listed in `data/index.json`. Adding content = data only.
- Art follows `docs/art-style.md` (palettes, proportions, 16 texels/m, glow only via emissive).
- Three.js is vendored (`vendor/three`, pinned 0.187.0). No CDN. Import via the import map
  (`three`, `three/addons/`).
- Commit and push to `feature/vertical-slice` after each milestone. No PR unless asked.
- Meshy: CLI pinned `meshy-cli@0.4.0`; show dry-run cost and ASK before spending credits.

## Commands
- `npm run dev` (http://localhost:5173), `npm test` (unit), `npm run test:e2e` (Playwright,
  slow: software WebGL; run once per milestone), `npm run lint`, `npm run soak -- --minutes 30`,
  `node tools/screenshots.mjs docs/screenshots/<name>`.

## Testing notes
- Headless Chromium renders at ~5-10 fps, so e2e tests wait for outcomes (`holdUntil`,
  `TDS.simTime`) instead of fixed real-time durations.
- `window.TDS` exposes state and helpers (teleport, setView, setCamera, insideSolid, stats).
