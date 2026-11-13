# TDS progress

Resume point for any new session. Read this, then `CLAUDE.md`, before touching code.

## Status

| Milestone | State |
|---|---|
| 0. Setup check | Done (2026-11-05) |
| 1. Art style, scaffold, 3D scene, character, cameras, collision | Done (2026-11-05) |
| 2. Simulation core: paths, towers, targeting, damage, waves, economy, saves, tests | Done (2026-11-05) |
| 3. Art pipeline proof (Blender, packs, Meshy), asset viewer | Done (2026-11-05), Meshy blocked (see below) |
| 4. Vertical slice | Done (2026-11-05), deployed to GitHub Pages |
| Tuning presets + Assist (owner request) | Done (2026-11-05) |
| 5. Meta progression | **Done (2026-11-05)** |
| 6. Modes and difficulties | **Done (2026-11-05)**: 7 modes, 9 modifiers, fair Daily Challenge (bot 65%), mode e2e, tutorial polish |
| 7. Content batch 1 | **Done (2026-11-05)**: Frostmere Crossing (2 roads), Thornmother boss, 2 legendary towers, map picker |
| 8. Polish | **Done (2026-11-05)**: procedural music, animated portal, collision gap fix, screenshot tool fix |
| 9. Final balance pass + docs + online plan | **Done (2026-11-05)**: difficulty ladder fixed (boss HP per difficulty), docs/online-plan.md, docs updated |
| 11. UI / GFX / content update | **In progress** (2026-11-06): see Next exact action |
| 13. Online co-op (2026-11-12/13) | **Done**: 2-4 players, Online tab, lockstep with snapshot resync, Supabase + relay + local transports, deploy guide, tests incl. two-tab e2e. See docs/multiplayer.md (as built) and docs/DEPLOY-ONLINE.md |
| 12. Finish-the-game run, session 2026-11-11 | **Done to 91% of the scoreboard**: 50 maps / 14 themes, campaign features the whole roster, 11 modes, 87 quests, banners, cosmetics, Help, battle report, music styles, PWA, save fuzz. Open work: see Next exact action |
| 10. Asset packs + content growth | **Done** (2026-11-06): 10 Kenney + 10 Quaternius CC0 packs, 48 imported pack models (23 Kenney, 25 Quaternius), seeded map generator + 15 new maps (3 hand-made flagships, 12 generated), content batches kenney_b1, quaternius_b1, quaternius_b2, 2 new heroes, 5 new hero skills, Lancer Mech boss killer. Full e2e + 30 min soak for this batch: see VERIFICATION.md |

## Real content counts (2026-11-11, `node tools/count-content.mjs`)

| Content | Count |
|---|---|
| Maps | 68 on 14 themes: 13 hand-made (Riftline, Frostmere, Glacier Gate, Mirrormire, Starfall Sanctum, Russet Spiral, Crimson Crossing, Redrock Switchbacks, Void Convergence, Frostbite Hairpin, Ashfall Gauntlet, Dune Ladder, Twin Bridges), 55 generated on 5 road templates (serpentine, fork, trident, diamond, crossover); 6 with air routes for fliers (Willow Hollow, Winter Gate, Ashen Flats, Null Rift, Frostbite Hairpin, Dune Ladder); unlock levels 1 to 42 |
| Towers | 100 (57 War, 43 Magic), 85 mechanically distinct, 91 models |
| Enemies / bosses | 200 (168 distinct, 191 models) / 100 (83 distinct, 94 models). 252 of the 300 appear in Campaign wave tables; all in Endless / Boss Rush |
| Heroes / abilities | 10 heroes, 4 skills each / 39 skills |
| Modes / modifiers | 11 single-player (Campaign, Endless, Boss Rush, Daily, Time Attack, Challenge, Skirmish, Mutation, War Chest, Last Stand, Sandbox) + online Co-op / 9 |
| Quests / achievements | 117: 23 daily pool (3 a day), 12 weekly pool (3 a week), 82 story (6 hand-written, 68 map liberations, 8 mode wins) / 109 |
| Summon banners | 3 (all towers, Modern War only, Magic only), pity per banner |
| Cosmetics | 14: 7 interface themes, 7 hero outfits, earned in play |
| Music | 7 moods, 12 theme styles, one key per map; procedural |
| Unit / server / E2E tests | 245 / 26 / 28 incl. two co-op e2e (same-browser and real relay) (see VERIFICATION.md) |

## Balance evidence (bot skill 0.7, Standard preset unless noted)

| Setup | Win rate |
|---|---|
| **All 56 maps, 12 core towers, Normal, Standard, 20 seeds each (2026-11-12, after the shared-stretch ally fix; `node tools/sweep.mjs`, docs/balance-sweep.json)** | mean 66%; 33 of 56 maps in 60-70%, 56 of 56 in 50-80%, none below 50% or above 80% |
| 4 new flagships, 12 core towers, Normal, 20 seeds (2026-11-12, hand-set after the calibrator) | Russet Spiral 65% (enemy health x2.4: the spiral passes the same towers on several laps), Crimson Crossing 70%, Redrock Switchbacks 70%, Void Convergence 60% (x0.77: the shortest roads) |
| **Co-op**, one bot per player, core 12 split between them, Normal, Riftline + Frostmere + Willow Crossing, 20 seeds each (2026-11-13) | 2 players 60%, 3 players 75%, 4 players 62% (each player full / full / 0.9 / 0.7 start cash, enemy health x1.08 / x1.22 / x1.40) |
| 10 heroes, 12 core towers, Riftline Normal, 30 seeds (2026-11-12) | Vale 63%, Ryn 70%, Ignis 70%, Vex 70%, Holt 67%, Maren 63%, Nyra 57%, Seren 57%, Kade 77%, Brik 83% |
| New modes, 12 core towers, Riftline Normal, 12 seeds | Skirmish 100% (all towers), Mutation 58%, War Chest 83%, Last Stand 0% at tower level 1 and 83% at level 5 |
| All 12 regular towers, Normal, Standard | 27/40 (68%); re-run this milestone 7/12 (58%) |
| Frostmere, 12 regular towers, Normal, Standard | 13/20 (65%); starters Easy 11/12; lazy 0/8 |
| Daily Challenge, fixed Easy, 10 dates x 6 seeds | 39/60 (65%); held-out dates 45/60 (75%) |
| Boss Rush, 12 regular towers | 8/12 (67%) with 6 bosses drawn per run from all 19 (all 19 appeared in 12 runs). Before 2026-11-06 only the 6 weakest bosses ever appeared (bug 38) |
| Generated towers only (18), Riftline Normal | 5/12 (42%) before the boss killer (bug 35) |
| Generated towers only (19, with Lancer Mech), Riftline / Frostmere Normal | 12/12 / 12/12 (100%): **above the 60-70% target** (bug 37; Frostmere was already 12/12 before) |
| Core 12 towers, Riftline / Frostmere Normal (same run) | 7/12 (58%) / 6/12 (50%) |
| Daily Challenge, 10 dates x 10 seeds | 62/100 (62%), identical before and after the boss killer |
| 15 new maps, 12 core towers, Normal, 12 seeds each (calibrated enemy HP per map, at most 3 measurements) | 67%: Moonlit Heights, Rime Pass, Mire Marsh, Brimstone Scar, Dust Outpost; 58%: Glacier Gate, Meadow Downs, Bramble Hollow, Aether Plateau, Cinder Wastes, Sunscorch Expanse; 75%: Mirrormire, Frost Gate, Mire Wallow; 50%: Starfall Sanctum. One seed = 8 points: every map is within 50-75%, 5 inside 60-70% (tools/map-batches.json `calibration`) |
| Random 6-tower loadouts, Riftline Normal | core 4/16, generated 0/16 before the pricing fix (the final boss decides) |
| All 12 regular towers, Normal, Original | 10/12 (83%) |
| All 12 regular towers, Normal, Relaxed | 12/12 (100%) |
| Lazy (1-2 tower types, no upgrades), Normal, Standard / Original | 0/8 / 0/8 |
| Starters only, level 1: Easy / Normal | 10/12 (83%) / 0/12 |
| Starters only, Normal, permanent level 3 / 5 | 3/12 (25%) / 12/12 (100%) (measured before milestone 9) |
| Ladder at gate levels (12 regular towers) | Medium L3 8/12, Hard L6 7/12, Extra Hard L9 6/8, Extreme L12 4/6, Impossible L15 6/6 |

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

- Tuning: `data/tuning.json` (all global knobs, 3 presets, assist amounts), `src/sim/tuning.js`,
  Settings > Difficulty tuning + Assist, `docs/TUNING.md`, `npm run balance -- --preset all`.
- Meta (milestone 5): `data/meta.json` (starters, player XP curve, speed unlocks, summon odds and
  pity, shop prices, daily rewards, match rewards), `data/quests.json`, `src/meta/meta.js` (pure,
  every reward once), `src/ui/hub.js` (Play / Towers / Summon / Shop / Index / Quests / Daily),
  `src/ui/slotMachine.js` (reels, near miss, jackpot, reveal, always skippable), save schema v3.

- Modes (milestone 6): `data/modes.json`, `src/sim/waveGen.js`, Daily Challenge rules in
  `src/meta/meta.js` (`dailyChallenge`: modifier budget, role-slot loaners), `npm run balance -- --daily N`.
- Content batch 1 (milestone 7): `data/maps/frostmere.json` + `data/waves/frostmere_campaign.json`,
  `data/bosses/thornmother.json`, `data/towers/legendary.json`; models in `src/engine/unitModels.js`
  (`titan_railgun`, `starfall_oracle`, rig `thornmother`); hub Map picker reloads on `?map=` and
  remembers `settings.map`; bot coverage is per road.
- Quaternius packs (2026-11-06): raw packs in `assets/packs/quaternius-*` (git-ignored, links in
  docs/credits.md), `tools/blender/convert_fbx.py` (FBX / glTF to GLB in a temp scene, decimate to
  budget, drop spare meshes), `tools/import-quaternius.mjs --fit` (manifest + engine-measured scale),
  GLBs in `assets/models/quaternius/`. Skinned meshes are drawn instanced as rigid per-bone parts
  (`rigidifySkinned`); manifest options `yaw` and `glow: false`; the viewer shows enemies and bosses
  as the baked rig. Contact sheets: docs/screenshots/quaternius.
- Polish (milestone 8): `data/music.json`, `src/audio/musicPatterns.js` (pure), `src/audio/music.js`;
  portal swirl shader in `src/engine/mapView.js` (`_buildPortalSwirls`); `map.scatterGap`.

## Next exact action

**2026-11-14 run** (Opus 5.5): co-op start resync fixed (BUGS 64); chunk 3 ladder / modes / economy
done (`tools/ladder.mjs`, docs/balance-ladder.json, TUNING.md; BUGS 65; Impossible 11x; Skirmish
tuned); chunk 5 battle audio; chunk 6 tutorial v2 confirmed; chunk 8 fuzz tests (BUGS 66, 67) and
per-unit error boundaries. Still open, in order: full e2e + 30 min soak (chunk 11), per-map
difficulty factors above Normal (TUNING.md "Known limit"), (flagships 13 of 13 and air routes done),
tower skins / map decorations, strings in data files, live Supabase + phone PWA test (owner).

**FINISH THE GAME run** (owner brief 2026-11-06; checklist and tiers in `docs/ROADMAP.md`, scoreboard in
`docs/COMPLETION.md`). Session 2026-11-11 finished Chunk 2 and parts of 4, 5, 6, 7, 8. In order:
1. Chunk 3 balance sweep: heroes done (BUGS #44; Kade 77% and Brik 83% are the leftovers, measure heroes with 30 seeds). Maps done: 20-seed sweep in docs/balance-sweep.json (re-run with `node tools/sweep.mjs`). Still open: difficulty
   ladder at gate levels with the new content, Endless with the 200-enemy pool, economy / exploit check, 30 min soak.
2. Chunk 2 leftovers: new path templates in src/core/mapGen.js (loop, crossover, air route), more flagships,
   kit towers for the thin classes (air, aura, summoner, trap).
3. Chunk 6: stat tooltips, first-run difficulty choice, tutorial v2, accessibility audit, screenshots at
   three sizes (`node tools/ui-shots.mjs after2`).
4. Chunk 7: budgets (frame time, draw calls, load size), LOD; test the PWA on the live URL and a phone.
5. Chunk 4 leftovers: tower skins, projectile effects, weekly rewards. Chunk 8 / 10 / 11 as listed.

How things added this session work:
- Featured maps: `feature: true` in tools/map-batches.json; `featureFor()` in tools/gen-maps.mjs picks kit
  enemies by archetype and kit bosses; a theme with `parent` in tools/map-themes.json is a re-skin (same
  seed gives the same roads, props and waves; verified by diff).
- Hand calibration when the calibrator fails: set `hpMul`, run `node tools/gen-maps.mjs`, measure with
  `node tools/balance.mjs --map <id> --seeds 12 --loadout <core 12>`, record it in `calibration`.
- Modes are data (data/modes.json): `maxWaves`, `keepHpFixed`, `mutations`, `rewardMul`, `tune`.
- Cosmetics: data/cosmetics.json + src/meta/cosmetics.js (ownership is derived from the save, never stored).
- Help text: data/help.json. PWA: sw.js is stamped by tools/build-site.mjs; no service worker on localhost.

Older brief, UI / texture / GFX / content update (owner brief 2026-11-06, docs/ui-style.md; checkpoints to wip/ui-gfx before each
batch; stop at about 95% of the 5-hour window / 97% weekly and schedule a resume).
- Done (batch UI/GFX 1 + bosses): docs/ui-style.md, styles/tokens.css + styles/theme.css (war-table panels,
  faction dress), src/ui/icons.js (SVG set: classes, archetypes, damage types, abilities, rarity badges),
  hub redesign (src/ui/hub.js: nav rail / phone tab bar, mission summary, map picker with search, theme
  filters, groups, SVG previews from src/ui/mapThumb.js, lock badges), HUD icons + wave bar + end screen
  with counters (src/ui/counter.js), settings Ultra / resolution / interface size / grade / weather,
  theme visuals from data/themes.json (sky shader stars / aurora / clouds, hemi light, colour grade in the
  vignette pass, ambient particles src/engine/themeFx.js, terrain detail ruts / ice / lava / ooze /
  ripples / runes with emissive and roughness maps, grass sway, dusk / night via map `timeOfDay`),
  data-driven VFX library data/vfx.json (Effects.play, quality caps, status auras, boss moments, slow
  motion, flash), boss intro letterbox + camera turn, victory / defeat sequences, menus render the world at
  a quarter rate. Bosses: 12 new phase actions (src/sim/match.js `_bossAction`), `tools/gen-bosses.mjs`
  -> data/bosses/mechanics_b1.json (40 bosses, 40 different kits), test/unit/bosses.test.js.
  BEFORE screenshots: docs/screenshots/ui-update/before (tools/ui-shots.mjs).
- Also done: AFTER screenshots (docs/screenshots/ui-update/after), full e2e 26/26, Boss Rush tuned (55%, BUGS.md #46),
  quests batch (`tools/gen-quests.mjs` -> data/quests/generated_b1.json, data/index.json `quests` is now a list,
  `condProgress` in src/meta/meta.js), faction base decals + rarity rings under towers (src/engine/matchView.js
  `factionDecal`).
- 30 min soak passed (VERIFICATION.md). Resume task `tds-ui-gfx-resume-2` fires after the usage reset.
- **Next**: (2) Track A unit materials (faction trims, wear, rarity glints on models, eye / weapon glow) in
  src/engine/models.js style pass. (4) Remaining screens: Index detail panel, quests / achievements
  layout, summon banners (more than one), pause screen styling, loading tips per theme. (5) Track D:
  unique-mechanic towers and enemies, new themes / maps, modes, quests, achievements, cosmetics
  (tower skins, hero outfits, projectile effects, UI themes) earned in play and shown in the Index.
  (6) BUGS.md #44 hero balance.

## Known weak spots (honest)

- New maps (2026-11-06): balance from 12 bot seeds each (noisy); generated maps reuse two campaign wave
  tables (varied by themed swaps and HP); themes reuse the existing prop set with new colours.
- All 7 heroes share Commander Vale's code model (own colours, headgear and weapon); picking a hero still reloads the page to rebuild the look.
- Generated tower menu now too strong alone (bug 37). Rifle Squad is a plain Rifleman upgrade.
- Ultimate Fantasy RTS towers are static buildings (they aim and recoil by code only).

- New players cannot win Standard Normal with starters at level 1 (0/12); Easy first, then levels or
  unlocks (by design; Original / Relaxed presets or Assist make it easier).
- The hub is a menu over the 3D world, not a separate walkable lobby area.
- Music is procedural synth loops (4 moods); it is pleasant but simple, and was only checked by
  unit tests and state checks, not listened to by a person yet.
- Quaternius models (2026-11-06): enemy eyes do not glow (their atlas eyes are white / black; the
  glow rule is off for them because it lit whole red bodies); several Blight recolours are very dark
  (blob orc, spiky blob, ninja read as dark blobs at distance); Tank3 recolours mostly to bone beige
  and reads as an ordinary tank, not Blight; decimated Toon Shooter enemy has stringy sleeves; the
  soldier and Leela towers have no base plate; skinned models are rigid per bone in matches (small
  creases at joints, invisible at game distance). The Animated Zombie FBX imported lying / oddly
  scaled and was not imported.
- Generated (batch) units are stat and colour variants of 23 Kenney models; two units often share
  a model with different palettes.
- Code-built towers and enemies (including the new legendaries and Thornmother) are simpler than the
  Blender ones and animate by code poses.
- Frostmere Crossing reuses Riftline's prop set with a colder palette; no snow-specific props yet.
- The Titan Railgun makes Boss Rush very easy (about 100% bot wins) for players who own it.
- e2e "place towers by clicking from three camera angles" can time out under heavy parallel CPU
  load (seen once); passes alone.
- Game speeds: 0.5x / 1x / 1.5x free; 2x at player level 3, 3x at level 8.

- Hero is still the code-built model with code animation (Meshy was blocked); a Blender version can replace it.
- Rocket Battery radar dish reads as a grey blob from behind; Gloomwing wing spars overshoot slightly.
- Blender models use flat palette colours plus the shared grain texture, not per-asset pixel textures.
- Meshy: `meshy text-to-3d create` returns HTTP 402 "Task creation on the free plan is no longer
  supported". Options for the owner: upgrade the Meshy plan, or generate on meshy.ai and drop the GLB
  into assets/incoming for me to clean, rig and import.
- Frame times so far are only from headless software rendering (SwiftShader, ~10 fps at 1280x720
  High); no real-GPU measurement yet.
- 245 draw calls at High (shadow pass doubles instanced batches); fine for desktop, phones default to Low.
