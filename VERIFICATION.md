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

## Milestone 4: vertical slice (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Lobby: difficulty + 6-tower loadout with model thumbnails | e2e (all match tests start through it); screenshot docs/screenshots/m4/01-lobby.png | pass | |
| Place towers by mouse from orbit, overview and first person | e2e "place towers by clicking from three camera angles" | pass | real mouse clicks on projected ground points |
| Invalid placement explained (shape + text) | same e2e: hint contains "road", click refused | pass | dashed red ring + cross + text |
| Towers attack, kills earn cash, wave clears, bonus paid | same e2e | pass | |
| Select by clicking, upgrade, path A, evolution, targeting, sell with confirm | e2e "select a tower by clicking it ..." | pass | Rifleman -> Commando |
| Boss wave + boss bar | e2e "boss wave shows the boss bar ..." | pass | Gravemaw |
| Ability aimed and cast through the UI | same e2e (X, click ground) | pass | |
| Victory, rewards once, save survives reload | same e2e | pass | crowns and wins persisted |
| Defeat screen | e2e "losing" | pass | |
| Tutorial steps advance on real actions; skippable; saved | e2e "tutorial ..." | pass | |
| Phone: hotbar tap, ground tap to build, start wave | e2e phone "tap a tower ..." (Pixel 7) | pass | |
| Exploration regressions (walk, collision, bounds, cameras, settings, touch) | e2e explore + touch | pass | all 14 e2e pass |
| Every new asset reviewed from 4+ angles | `node tools/review-assets.mjs` sheets in docs/screenshots/m4/assets (boss + 19 code models) | pass, with fixes | Shade wisps re-attached, Storm Caller glow toned down |
| Match screenshots | `node tools/match-shots.mjs docs/screenshots/m4` | pass | lobby, build, panel, combat, boss |
| Soak / unit / lint | `npm run soak -- --minutes 30`, `npm test` (36), `npm run lint` | pass | 0 failures, 0 rescues |
| Sound effects audible and pleasant | not testable headless | unverified | owner to check while playing |
| Real-GPU frame time with a full wave | headless only (~10 fps software, ~320 draw calls) | unverified | needs the owner's machine |

## Tuning presets and Assist (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| One tuning file, all knobs, 3 presets, safe ranges | unit tuning.test.js | pass | |
| Knobs change the simulation (HP, costs, cash, keep) | unit tuning.test.js | pass | |
| Assists (cash, slow, hero, refund, skip wave) + flagged runs | unit tuning.test.js; e2e "tuning preset and assists from settings" | pass | assisted runs set no records |
| Standard Normal win rate 60-70% for a sensible imperfect bot | `npm run balance -- --preset standard --seeds 40` | pass | 27/40 = 68% |
| Lazy strategy always loses on Standard | `npm run balance -- --strategy lazy` + unit test | pass | 0/8 |
| Every preset stays winnable | unit "balance: every preset ..." (3 seeds each) | pass | |

## Milestone 5: meta progression (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Starter towers, locked towers excluded from the loadout | unit meta "starters"; e2e hub "locked towers ..." | pass | |
| Player XP, levels, level rewards once, speed unlocks | unit meta; e2e hub (speed stays below 2x at level 1) | pass | |
| Slot-machine summons: deterministic, cost, duplicates to crowns, pity | unit meta "summons"; e2e hub "slot-machine summon" | pass | skip + reveal exercised |
| Shop: buy once, daily deal, bundles | unit meta "shop"; e2e hub (buy Gunship) | pass | |
| Permanent tower levels and evolutions at 5/10/15 | unit meta; e2e hub (Veteran Rifleman, persists after reload) | pass | |
| Quests, achievements, daily login: claim exactly once | unit meta; e2e hub | pass | |
| Match results: rewards once, stats, records, index, assisted rules | unit meta "match results ..." | pass | |
| Save v2 -> v3 migration, export/import keeps meta | unit meta | pass | |
| Index silhouettes for undiscovered entries | screenshot docs/screenshots/m5/hub-index.png | pass | |
| Slot machine visuals | screenshots docs/screenshots/m5/hub-summon-*.png | pass | sounds not verifiable headless |
| Regression: all earlier e2e + soak | full e2e (18 passed), soak 30 min (0 failures) | pass | |
