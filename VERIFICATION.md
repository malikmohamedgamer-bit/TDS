# Verification

Results are from real runs on the owner's Windows 11 machine. "Headless" means Playwright
Chromium with SwiftShader software WebGL: correct pixels, **not** real GPU performance.

## Milestone checks after the 2026-11-12 batches

| Check | How | Result |
|---|---|---|
| End to end | `npx playwright test` | 26 / 26 passed (10.1 min), after the leak fix, auto quality and launch prep |
| 30 minute soak | `npm run soak -- --minutes 30` | all 56 maps: 30 simulated minutes of hero walking each, 0 rescues, 0 failures |
| Leak check | `node tools/leak-check.mjs --cycles 5` | GPU geometries 381 after every match (was +1,974 per match) |
| Unit tests / lint | `npm test`, `npm run lint` | 139 / 139, clean |

## Client security review (2026-11-12)

Read-only review of every place where data a player controls (an imported save code, URL
parameters, browser storage) reaches the page or the game.

| Area | Finding | Status |
|---|---|---|
| HTML injection | Templates escape data with `esc()`; error messages, toasts and banners use `textContent`; the two raw HTML inserts are fixed strings; no `eval`, `new Function` or `document.write` | no issue |
| Imported / edited saves | `sanitize` turns every field into a number, a known id or a fixed shape; strings from a save are never rendered as HTML; fuzz test over 400 damaged saves | no issue |
| Save code checksum | Detects damage, not tampering (anyone can edit a local save); fine for a single-player game, must be replaced by server checks if online play is added (docs/online-plan.md) | accepted |
| `?map=` | Opens a map before its unlock level. Single-player, local save; the screenshot and test tools rely on it | accepted |
| `?quality=` | Any text was accepted and could be saved (the renderer fell back to Medium) | fixed after this review: only known tiers |
| Service worker | Same-origin GET requests only, cache per build | no issue |

## Content to target, modes, meta, PWA (2026-11-11 / 12)

| Check | How | Result | Evidence |
|---|---|---|---|
| Unit tests | `npm test` | 132 / 132 pass | run after the last code change |
| Lint | `npm run lint` | clean | |
| End to end | `npm run test:e2e` | Run 1: 26 / 26. Run 2 (after hero balance, first-run default, tooltips): 25 / 26; the failure was the flaky summon test (BUGS 55), fixed and passed 3 of 3 alone. No full run after that fix | 12 min per run, software WebGL |
| All 50 maps valid | `node tools/gen-maps.mjs --check` | roads valid, 378+ build spots, hero soak without rescues on the 48 generated / flagship entries | |
| Map balance | `node tools/sweep.mjs` (20 seeds, 12 core towers, Standard Normal) | mean 67%, 30 of 50 maps in 60-70%, 50 of 50 in 50-80% | docs/balance-sweep.json |
| Hero balance | `node tools/balance.mjs --hero all --seeds 30` | 57% to 83% (Kade 77%, Brik 83% a little strong) | BUGS 44 |
| Re-skin themes keep balance | built 15 maps with the parent theme and with the new theme, diffed waves and layout fields | 0 differences | session log |
| New screens in a real browser | Help search, save export / import, cosmetics equip, pause battle report, 3 new themes in a match | worked, no console errors | checked by hand in the app browser on localhost |
| Pages deploy | `gh run list` | green after every push | |

Not verified this session: the service worker on the live URL or on a phone (it does not register on localhost),
install prompt, music by ear, frame time on a real GPU, the 30 minute soak, the difficulty ladder and the modes
with 20 seeds, screenshots at phone and tablet sizes for the new screens.

## UI / GFX update, batch 1 (2026-11-06)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Unit tests | `npm test` | pass | 106 (before the quests batch), then 109 with test/unit/quests-gen.test.js |
| Full e2e | `npx playwright test` | pass | 26/26 in 7.9 min (new hub-ui spec: map search, theme filter, lock badges, mission summary, arrow-key tabs, Ultra / resolution / interface size) |
| BEFORE / AFTER review | `node tools/ui-shots.mjs before|after` | pass | 48 shots each (hub, map picker, 6 themed matches, boss, victory, defeat, summon, shop, Index, quests, towers at desktop / tablet / phone), no page errors; pairs in docs/screenshots/ui-update |
| Load size | performance resource entries (dev server, uncompressed) | +4.5% | 3,298 KB / 129 requests -> 3,445 KB / 137 requests (new CSS, icons, theme / VFX data, generated bosses) |
| Frame time | TDS.stats in the riftline match shot, desktop High, headless | unchanged | 100 ms (10 fps software rendering) before and after; draw calls 287 -> 290; real-GPU numbers not measured |
| Hub responsiveness | CDP Performance metrics, same 4 tab clicks | faster | old UI 34 s, new UI 40 s (bug 45) -> 19 s after finite animations + quarter-rate world behind menus |
| Boss mechanics | test/unit/bosses.test.js (13 tests) | pass | every new action, timers restore exact values, 40 generated bosses each beatable with 3 phases |
| Boss Rush balance | `node tools/dev/boss-rush.mjs 20` | 55% | below 60-70% target, accepted after 3 attempts (BUGS.md #46) |
| 30 min soak | `npm run soak -- --minutes 30` (every map) | pass | 30 simulated min per map, about 15.5 km walked each, 0 rescues, 0 failures |
| Visual check of themes | in-app browser, desktop | pass | Ember lava, Frost ice, Toxic ooze, Starfall night runes, faction decals; not checked on a real phone or GPU |

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

## Milestone 6: modes and difficulties (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Every mode builds a match; endless waves generated deterministically, boss every 10 | unit modes.test.js | pass | |
| Boss Rush rotates bosses; Sandbox infinite cash, skip any time, no rewards; Time Attack timer score | unit modes.test.js; e2e modes "Sandbox ..." and "Boss Rush, Time Attack and Challenge ..." | pass | Sandbox e2e places an unowned Gunship chosen in the hub |
| Locked modes show unlock level; Endless past wave 20 with a boss on 30, best run saved | e2e modes "locked modes ... Endless ..." | pass | |
| Challenge modifiers apply to the match and raise the shown reward (x1.76 for Tough + Horde) | e2e modes; unit "modifiers ..." | pass | |
| Daily Challenge: same for everyone on a date, reward once per day | unit; e2e modes "Daily Challenge ..." (fixed Easy, modifiers, loaner levels, second win gives no daily reward) | pass | |
| Daily rules hold on 60 dates (budget, role slots, excluded modifier) | unit "daily challenge: modifier budget ..." | pass | |
| Daily balance target 60-70% (bot skill 0.7, fixed Easy, 10 dates) | `npm run balance -- --daily 10 --seeds 6` | pass | 39/60 = 65% (2026-11-05..14); held-out 2027-01-10..19: 45/60 = 75%. Every date wins at least 1/6; Swift Blight days are hardest |
| Tutorial glows the control per step, device wording, skips impossible steps | e2e "tutorial advances on real actions ..." (hotbar slot glow, then Start wave glow); screenshots docs/screenshots/m6/04-05 | pass | touch wording not screenshot-checked on a phone |
| Assist skip button hidden unless Assist is on | screenshot docs/screenshots/m6/04-tutorial-pick.png; e2e assists test | pass | bug 20 |
| Regression: full e2e + soak | 22 passed (4.1 min); soak 30 simulated min, 0 rescues, 0 failures; unit 56/56; lint clean | pass | |

## Milestone 7: content batch 1 (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Content loads and validates (2 legendaries, Thornmother, Frostmere, its waves) | unit content7 "content batch 1 is loaded"; `validateContent` in unit tests | pass | |
| Titan Railgun: armour pierce, air, detection, Arc Rail chain | unit content7 | pass | full damage through 50% armour |
| Starfall Oracle: splash, mark | unit content7 | pass | |
| Thornmother phases (Brood Burst, Thorn Carapace with telegraph, Frenzy), no healers | unit content7 | pass | bug 25 |
| Frostmere: 2 roads reach the keep, waves use both, soak walker never stuck | unit content7; e2e maps (enemies on both roads); soak 30 min and 120 min | pass | 0 rescues after bug 28 fix |
| Map picker: locked until level 3, travels to Frostmere, Daily locked there, legendaries + boss render without errors | e2e maps.spec.js | pass | |
| Legendary summons possible (no epic fallback) | unit content7 (400 pulls) | pass | |
| Daily loaners stay at epic or below (measured Daily unchanged) | unit content7; `--daily 1` reproduces the 2026-11-05 loadout | pass | |
| Frostmere balance 60-70% (12 regular towers, Standard Normal) | `npm run balance -- --map frostmere --loadout <12 ids> --seeds 20` | pass | 13/20 = 65%; starters Easy 11/12; lazy 0/8 |
| Boss Rush with two bosses | scratch bot runs, 12 seeds | pass | 8/12 without legendaries; ~12/12 with the Titan Railgun affordable at start |
| Visual review | docs/screenshots/m7 (hub maps, overview, west, legendaries, Thornmother, two-road combat) | pass, with notes | Frostmere reuses Riftline props |
| Regression | M7 run: 22/23 e2e (bug 30: one timing flake while screenshot jobs ran in parallel and M8 files were being edited, so that run was not on a clean tree); clean combined run below | see M8 | |

## Milestone 8: polish (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Music data complete, patterns deterministic, in key, inside the bar, sane range | unit music.test.js | pass | bug 29 |
| Music follows the game (hub, build, wave, boss, back to hub; map key) | e2e modes "music follows the game ..." | pass | no page errors with the audio graph running in headless Chromium; **not listened to by a person** |
| Music volume setting | settings dialog field wired to `musicVolume` | partial | not covered by an automated test |
| Animated portal vortex, frozen with Reduced motion | screenshot docs/screenshots/m8/portal.png | pass | reduced-motion freeze checked by code reading only |
| Collision gap fix | soak 120 simulated min on both maps | pass | 0 rescues, 0 failures |
| Regression (clean tree, M7 + M8) | unit 67/67, lint clean, e2e 24/24 (4.6 min), soak 30 min: Riftline and Frostmere 0 rescues 0 failures | pass | |

## Milestone 9: final balance pass and docs (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| `bossHpMul` softens bosses only, on that difficulty only | unit content7 "difficulty bossHpMul ..." | pass | |
| Difficulty ladder winnable at gate levels (closes the milestone 2 "partial" row) | `npm run balance -- --loadout <12 regular> --difficulty X --level N` | pass | Medium L3 8/12, Hard L6 7/12, Extra Hard L9 6/8, Extreme L12 4/6, Impossible L15 6/6; Medium L2 2/8 |
| Same gates on Frostmere | balance tool | pass | Medium L3 8/8, Hard L6 6/8 (a bit easier) |
| Online plan | docs/online-plan.md | written | plan only, nothing implemented |
| Regression | unit 68/68, lint clean, e2e 24/24 (4.6 min), soak 30 min both maps 0 rescues 0 failures | pass | |

## Still not verified (honest)
- Music by ear (only pattern and state tests); Music volume slider has no automated test.
- Real-GPU and real-phone frame times (only software rendering measured).
- Pointer-lock look (headless cannot grant it).

## Milestone 10 (part 1): asset packs and content batch 1 (2026-11-05)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| 10 Kenney packs downloaded from the official site, CC0 confirmed in each License.txt, only allowed file types kept | `tools/fetch-kenney.mjs`; `unzip -p ... License.txt`; `find` for disallowed extensions = 0 | pass | Quaternius not fetched (Google Drive); manual links in docs/credits.md |
| Palette recolour (families, ramps, glow rule, emissive map) | unit palette.test.js | pass | |
| 23 imported models load, within triangle budgets, mapped clips exist | unit models.test.js; e2e viewer (every GLB loads) | pass | trucks are boss bases (over the enemy budget) |
| Art-style review from 5 angles + animation | docs/screenshots/kenney/*.png (23 sheets) | pass, with notes | zombie trousers glow (bug 36) |
| New towers / enemies / boss render and fight in a match | headless sandbox run: 6 generated towers, 7 generated enemies, 1 generated boss, damage dealt, no page errors; docs/screenshots/kenney/ingame-batch1.png | pass | |
| Generated towers balance (18-tower menu, Standard Normal) | `npm run balance -- --loadout <18 ids> --seeds 12` | **fail** | 5/12 (42%) vs target 60-70%; 3 attempts used (bug 35) |
| Boss Rush with 12 rotating bosses | bot, 12 seeds, core towers | pass | 9/12 (75%) |
| Core balance unchanged | unit balance tests pinned to the 12 core towers | pass | |
| Regression | unit 70/70, lint clean, e2e 24/24 (6.2 min), soak 30 min both maps 0 rescues 0 failures | pass | |

## Milestone 10 (part 2): Quaternius polish, boss killer, maps, content batches, heroes (2026-11-06)

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Glowing eyes / accents, pale and scrap palettes, tower pads, zombie fix | contact sheets docs/screenshots/quaternius (5 views + animation each); emissive materials counted in the engine before / after `glow: false` | pass | 13 of 15 creature / machine models glow only on small face islands |
| Skinned models animate in matches (rigid per-bone parts) | unit rig.test.js (matches three.js CPU skinning); viewer e2e; in-match screenshots | pass | small creases at joints by design |
| Boss killer (bug 35) | bot, 12 seeds, generated menu | pass, overshoots | Riftline 5/12 -> 12/12; bug 37 open (above target) |
| Daily Challenge unchanged | same command before / after (`npm run balance -- --daily 10`) | pass | 62/100 both |
| Map generator deterministic, valid roads over many seeds, validator catches bad roads | unit mapgen.test.js | pass | |
| 15 new maps: build space, hero cannot get stuck | `node tools/gen-maps.mjs --check` (371-474 build spots, 5 min soak each); `npm run soak -- --minutes 30` | pass | all 17 maps: 30 simulated min, about 15 km each, 0 rescues, 0 failures |
| New maps balanced with the 12 core towers | bot, 12 seeds per map, calibrated enemy HP (at most 3 measurements per map) | partial | 5 maps 67%, 6 at 58%, 3 at 75%, Starfall Sanctum 50%; one seed = 8 points, so the band is within noise but not proven |
| Generated files intact after the power cut | every JSON parsed (67 files); all maps / waves / index / music regenerated byte-identical by the generator | pass | checkpoint branch wip/maps-and-content (not deployed) |
| New units in a real match | `node tools/batch-shots.mjs` (sandbox, Starfall Sanctum): towers placed and dealt damage, every new enemy and a new boss on the road, no game errors | pass | one headless "AudioContext" console error (no audio device in headless Chromium) |
| Boss Rush uses every boss (bug 38) | `node tools/dev/boss-rush.mjs 12` | pass | 19 different bosses in 12 runs, 8/12 won |
| Hero picker reaches the match (bug 40), new hero skills | unit heroes.test.js | pass | |
| bossDamage stat | unit combat-boss.test.js | pass | |
| Regression | unit 81/81, lint clean; full e2e once: 23/24, the failure was the lobby layout (bug 42), fixed, then match + maps specs re-run 7/7 | pass after fix | full suite not re-run after the fix (per plan: once) |

### Still not verified (honest)
- The new maps' 60-70% target with more than 12 seeds per map.
- The new heroes' balance (the bot always plays the default hero).
- Music for the 15 new map keys by ear.
