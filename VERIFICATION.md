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

## Milestone 2 (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Content consistency | unit "content is internally consistent" (validateContent) | pass | 11 towers, 12 enemies incl. boss |
| Path following | unit "path arc-length lookup" | pass | |
| Upgrades, branches, evolutions | unit "upgrades: linear first, then a branch choice" | pass | Commando evolution renames, hits air |
| Lobby levels and evolutions | unit "lobby levels scale stats and evolve permanently" | pass | Veteran L5, Legendary L15 |
| Damage (resist, armor, pierce, shields, mark) | unit "damage: ..." | pass | exact values checked |
| Targeting (7 modes, stealth, flying) | unit "targeting modes ..." | pass | |
| Placement rules (road, props, towers, cash, limit, bounds, slope) | unit "placement validation" | pass | |
| Economy (buy, upgrade, sell 70%, kill cash, wave bonus once) | unit "economy" | pass | |
| Waves and difficulty scaling | unit "waves" | pass | |
| Enemy behaviours (split, heal, regen vs burn, leak) | unit "enemy behaviours" | pass | |
| Stealth / flying rules | unit "stealth enemies ignored without detection ..." | pass | |
| Boss phases + telegraph warning before stun | unit "boss phases" | pass | |
| Abilities (cooldown, manual, automatic) | unit "abilities" | pass | |
| Summons, mines, support aura | unit "summoner wolves ...; mines ...; aura" | pass | |
| Determinism and replay | unit "determinism" (same hash twice; replaying the log reproduces it) | pass | |
| Balance: Normal winnable, not trivial | unit "balance" + `npm run balance` | pass | Normal L1 won (keep 111/150); weak 2-tower strategy loses |
| Higher difficulties winnable with meta levels | `npm run balance` ladder | partial | Extra Hard L9, Extreme L12, Impossible L15 won; Medium L3 / Hard L6 lose at the final boss (fine-tune in milestone 7) |
| Saves: memory fallback, migration, sanitize, export/import, tamper rejection, backup, rewards once | unit save.test.js (6 tests) | pass | |
| Game still boots with the new content loader | e2e "loads the map" | pass | |
| Lint | `npm run lint` | pass | |

Note: the simulation has no visuals yet; towers and enemies appear in milestone 4.

## Milestone 3 (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Blender build + rig + animate + export (6 assets) | Blender MCP run of tools/blender; `node tools/glb-info.mjs assets/models/*.glb` | pass | 306-880 triangles; clips Idle/Walk/Fly/Attack/Death as appropriate |
| Review from 4+ angles in Blender | MCP `look` (front, back, side, three-quarter) per asset | pass, with fixes | Ironshell rebuilt (shell, legs, mandible direction), Gloomwing belly/spars adjusted |
| Review from 4+ angles in the engine | `node tools/review-assets.mjs docs/screenshots/m3` (front, back, right, top, 3/4, animation frame) | pass | contact sheets in docs/screenshots/m3 |
| GLBs valid, clips present, triangle budgets, no zero scale | unit models.test.js | pass | |
| Viewer loads every GLB and plays clips without errors | e2e viewer.spec.js | pass | |
| Meshy cost shown and asked before spending | dry-run (30 credits/model), owner approved boss + hero | pass | |
| Meshy generation | `meshy text-to-3d create --mode preview` | fail (external) | HTTP 402: free plan cannot create tasks; balance still 100 |
| CC0 packs / Mixamo animations | assets/packs and assets/incoming checked | unverified | nothing dropped in yet; loader accepts any GLB listed in data/models.json |
