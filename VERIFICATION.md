# Verification

Results are from real runs on the owner's Windows 11 machine. "Headless" means Playwright
Chromium with SwiftShader software WebGL: correct pixels, **not** real GPU performance.

## Milestone 1 (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Setup: git clone, branch, remote | `git clone`, `git checkout -b feature/vertical-slice`, `git remote -v` | pass | Remote was empty; branch pushed |
| gh auth | `gh auth status` | pass | account malikmohamedgamer-bit, scopes repo, workflow |
| Node 22+ | `node --version` | pass | v24.22.1 |
| npm install / Playwright Chromium | `npm install`, `npx playwright install chromium` | pass | 3 moderate audit warnings, all in ESLint's dev-only `minimatch` (not shipped) |
| Blender MCP | `get_addon_status`; created and deleted a cube via `execute_blender_code` | pass | Blender 5.2.2 LTS, add-on protocol 15, Blender process listening on 127.0.0.1:9876 |
| Meshy CLI | `meshy-cli@0.4.0 auth status` | pass | authenticated, balance 100 credits; CLI not upgraded |
| Game loads without errors | e2e "loads the map without errors" | pass | no console errors; 228 props, 230 colliders |
| Walk / sprint / jump | e2e "walks, sprints faster than walking, and jumps" | pass | sprint speed > 1.3x walk |
| Collision with props | e2e "never walks through solid props" (watchtower, crate stack, keep; overlap checked every frame) | pass | 0 overlaps, 0 rescues |
| Cannot leave the map | e2e "cannot leave the map"; unit "stays in bounds" | pass | |
| Never stuck / never falls out | soak bot `npm run soak -- --minutes 30` | pass | 30 simulated min, 15.2 km walked, 427 jumps, 0 rescues, 0 failures (0.4 s run) |
| Camera modes (orbit, first person, free fly, overview, return) | e2e "camera modes" | pass | free camera moves, hero stays put |
| Touch controls (emulated Pixel 7) | e2e phone test: joystick walks, Jump button, Overview / Me buttons, drag look, all buttons >= 44 px | pass | CDP touch events |
| Settings persist | e2e "settings dialog opens, changes quality and persists" | pass | reload keeps High |
| Pure core logic | `npm test` (11 tests: RNG, loop, collision, character, terrain, collider footprints, soak) | pass | |
| Lint | `npm run lint` | pass | |
| Looks good from all angles | 8 review screenshots `docs/screenshots/m1/` (orbit, front, keep, portal, magic grove, war outpost, first person, overview) | pass, with notes | see PROGRESS.md weak spots |
| Frame time | headless High 1280x720: ~10 fps, 245 draw calls, 188k triangles | unverified | software rendering only; needs a real GPU measurement |

## Could not verify yet
- Real-GPU frame times on a mid-range desktop and a real phone.
- Pointer-lock look (headless Chromium cannot grant pointer lock); right-drag look path shares the
  same code.
