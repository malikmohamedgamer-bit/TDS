# Changelog

## 0.13.0 - Balance, audio, hardening (2026-11-14)
- **Co-op**: no more snapshot resync right after every start: a busy tab's late hello no longer
  makes the host think 80+ turns were lost. Sessions keep a short event trace for bug reports.
- **Economy**: the Skip wave assist could skip a whole match to a paid win (crowns and XP up to
  x7.6): skipped waves now pay nothing.
- **Balance**: Impossible enemy health 7.6x → 11x (it was won 87% of the time at max level by the
  bot); Skirmish has 1.8x enemy health and 85% starting cash (it could not be lost). Ladder, presets
  and modes measured with 20 seeds (`node tools/ladder.mjs`).
- **Audio**: impact sounds per damage type (fire crackles, ice clinks, shields ring...), deaths per
  enemy kind (armour clanks, fliers fall, ghosts fade, splitters splat), music dips under boss,
  victory and wave horns, a click on every menu button, and a Reduced sound option.
- **Robustness**: a unit whose visuals fail is hidden instead of freezing the match view; commands
  with impossible positions are refused (one could crash a co-op match); hand-edited settings are
  clamped to their ranges. New fuzz tests.

## 0.12.0 - Online co-op (2026-11-13)
- **Co-op for 2-4 players** (Online tab): create a room (6-character code, invite link), join by code,
  ready up, the host picks the difficulty and starts. Each player has their own hero, abilities,
  towers and cash; shared keep and waves; kill cash to whoever made the kill, wave bonus split.
  Teammates' heroes walk the map, towers show their owner's colour, team list, quick pings.
- **Lockstep networking**: every player runs the same deterministic simulation; the host stamps
  commands with the tick they apply on; state hashes are compared every 2 seconds and a snapshot
  resyncs a client that drifts; late joiners and reconnects get a snapshot.
- **Transports**: Supabase Realtime (no server code: paste the project URL and public key into
  data/online.json), the included WebSocket relay (server/: Docker, Render, Fly.io files), and a
  same-browser transport for testing. docs/DEPLOY-ONLINE.md walks through each.
- Co-op balance from the bot (one bot per player): enemy health and starting cash scale with the
  number of players.
- Hidden tabs keep a co-op match running (worker timer); local menus never pause co-op.
- Tests: co-op sim and snapshots, lockstep over a lossy test network, lobby, relay server, a
  two-tab browser test.

## 0.11.0 - Content to target, modes, meta, PWA (2026-11-11)
- Maps: 50 (33 new generated maps, each calibrated with the balance bot). 14 themes: Autumn, Polar Night,
  Ashfall, Crimson Mire, Red Canyon and Void Rift are new looks (ground, sky, light, particles, colour
  grade, music style) on existing layout rules.
- Campaign now shows the whole roster: the 33 new maps swap in kit enemies of the same archetype and put
  kit bosses on both boss waves (252 of 300 units appear in wave tables; before: 37).
- Modes: Skirmish (10 waves), Mutation (a seeded mutation every wave), War Chest (one budget, no kill or
  wave cash), Last Stand (keep has 40 health). 11 modes.
- Meta: 87 quests (one liberation quest per map, one per mode), 109 achievements, two faction summon
  banners with their own pity, cosmetics earned in play (7 interface themes, 7 hero outfits, in the Index).
- Help tab: searchable help, save export / import code, credits, privacy, terms.
- Pause screen battle report: damage share, kills and damage per cash for each tower type.
- Music: final-boss, victory and defeat pieces; one style per theme.
- PWA: web app manifest, code-made icons, service worker (offline play after the first visit, a cache per
  build, pack models cached on first use, update applies at the next start).
- Save safety: the sanitizer repairs damaged records, quest boards and index lists (fuzz test, 400 saves).

## 0.10.0 - UI / GFX update, batch 1 + boss mechanics (2026-11-06)
- UI: docs/ui-style.md, design tokens, war-table theme with Magic / War faction dress, code-drawn SVG icon
  set (tower classes, enemy archetypes, damage types, abilities, rarity badges with shapes), new lobby
  (nav rail / phone tab bar, mission summary, map picker with search, theme filters, previews, locks),
  HUD icons, wave bar, boss bar, end screen with counting rewards, loading tips.
- Settings: Low / Medium / High / Ultra, resolution scale, interface size, colour grading, weather.
- Graphics: per-theme sky (stars, aurora, clouds, haze), ambient light, colour grade, ambient particles,
  terrain detail (ruts, ice, lava, ooze, ripples, runes), grass sway, dusk and night maps.
- VFX library in data/vfx.json: hits and explosions per element, muzzle flashes, status auras, boss spawn,
  phase, slam, death with slow motion and flash, victory / defeat bursts; boss intro letterbox.
- Bosses: 12 new phase mechanics and 40 new bosses with unique mechanic sets (tools/gen-bosses.mjs).
- Performance: menus draw the world at a quarter rate; UI animations are finite (no per-frame repaint).

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

## 0.5.0 - Tuning presets and Milestone 5: meta progression (2026-11-05)
- `data/tuning.json`: all global difficulty / economy knobs, presets Standard (harder default),
  Original, Relaxed; Settings > Difficulty tuning and Assist (extra cash, slower enemies,
  stronger Commander, 100% refund, skip wave). Assisted runs are flagged. `docs/TUNING.md`.
- Balance bot: seeded imperfect player, lazy strategy, win-rate reports per preset.
- Lobby hub: Play, Towers (locked / unlocked, permanent levels 1-15, evolutions at 5/10/15),
  Summon (slot machine: reels, near miss, jackpot, rare-item reveal, sound per reel stop, always
  skippable, pity, free sigils only), Shop (towers, daily deal, sigil bundles), Index (silhouettes
  until discovered), Quests (3 daily, story), Achievements, 7-day daily login streak.
- Player level and XP with level-up rewards; game speed 2x / 3x unlocked by level.
- Save schema v3 (migration from v2); every reward granted exactly once.

## 0.6.0 - Milestone 6: modes and difficulties (2026-11-05)
- `data/modes.json`: Campaign, Endless (generated waves, boss every 10, best run saved), Boss Rush
  (six rotating bosses), Daily Challenge, Time Attack, Challenge (pick modifiers for bigger
  rewards), Sandbox (infinite cash, every tower, Next wave any time, no rewards). 9 modifiers.
- Daily Challenge rebuilt for fairness: modifiers fill a difficulty budget (`dailyCost` /
  `dailyBudget`; heavy ones stand alone, Giant bosses excluded), role-slot loaner loadout (long-range
  boss killer, splash, anti-air, two sustained-damage picks, one support), loaners at level 4,
  enemies +8% health. Bot (skill 0.7) wins 65% over 10 dates; 75% on 10 held-out dates.
- Hub: daily card lists each modifier with its effect and the loaner level; difficulty is locked
  in Daily; loaner cards show the loaner level; switching modes restores your own loadout.
- Tutorial: device-specific wording (touch or keyboard), the control each step mentions glows
  (hotbar slot, place hint, Start wave, Upgrade, ability), steps that a mode makes impossible are
  skipped, the last step names the real wave count and boss waves, a completion banner.
- `npm run balance -- --daily 10` measures the Daily Challenge; `tools/mode-shots.mjs`.
- Fixed: elements with the `hidden` attribute could still show (the Assist "Skip this wave"
  button was visible to everyone).

## 0.7.0 - Milestone 7: content batch 1 (2026-11-05)
- New map **Frostmere Crossing** (`data/maps/frostmere.json`, unlocks at player level 3): two
  Blight portals, two roads that merge before the keep, cold autumn palette, its own 20-wave
  campaign (`data/waves/frostmere_campaign.json`, Gravemaw on 10, Thornmother on 20).
- New boss **Thornmother, Brood Queen** (`data/bosses/thornmother.json`): regenerates, Brood Burst
  (brood sacs + skitters), Thorn Carapace (shield + tower-stun telegraph), Frenzy (speed, swarm).
  Code-built rig with walk / idle / attack / death clips. Boss Rush now rotates both bosses.
- First **legendary towers** (`data/towers/legendary.json`): Titan Railgun (war sniper: armour-
  ignoring slugs, hits air and hidden; branches Executioner / Arc Rail) and Starfall Oracle (magic
  area: falling stars that splash and mark; branches Cometfall / Constellation). Code-built models,
  new projectiles. Legendary summons no longer fall back to epic.
- Hub: Map picker (records per map, unlock level); a map switch rebuilds the world by reloading on
  that map; the choice is remembered. Modes can be bound to a map (Daily Challenge: Riftline).
- Balance: bot values road coverage per road (two-road maps), Boss Rush economy retuned for two
  bosses (start 2000, +90 per wave), Daily loaners capped at epic.
- Fixed: Sandbox hotbar and upgrade buttons said "need $..." although cash is infinite (now ∞).

## 0.8.0 - Milestone 8: polish (2026-11-05)
- **Music**: procedural soundtrack, no audio files. `data/music.json` (scales, a key per map,
  moods hub / build / wave / boss with tempo, chord progression, arpeggio, 16-step drums, layer
  volumes), `src/audio/musicPatterns.js` (pure, deterministic, unit-tested), `src/audio/music.js`
  (WebAudio scheduler on the master bus; mood changes land on the next bar with a short dip).
  Riftline plays in D dorian, Frostmere in A minor, bosses switch to phrygian. Settings > Audio >
  Music volume.
- **Portal**: the enemy portal void is an animated, pixel-quantised Blight vortex (frozen when
  Reduced motion is on) instead of static rings that read like a target.
- **Collision**: maps can set `scatterGap` so scattered props never leave a slot narrower than the
  hero (between props or against the map boundary). Frostmere uses 1.3 m.
- `tools/screenshots.mjs` uses `nolobby` (the hub had been covering every world shot since M5) and
  accepts `--map`.

## 0.9.0 - Milestone 9: final balance pass and docs (2026-11-05)
- Difficulty ladder: optional `bossHpMul` per difficulty (Medium 0.72, Hard 0.85, Extra Hard
  0.85). Bot wins at the intended gates: Medium L3 67%, Hard L6 58%, Extra Hard L9 75%,
  Extreme L12 67% (before: Medium L3, Hard L6 0/8 and Extra Hard L9 1/6, all at the final boss).
- `docs/online-plan.md` (accounts and cloud save, server-verified rewards by replay, Daily
  leaderboard, optional co-op; trading and real-money summons not planned), README, TUNING,
  PROGRESS, PLAYTEST, VERIFICATION brought up to date.

## 0.10.0 - Asset packs and content batch 1 (2026-11-05)
- 10 Kenney CC0 kits downloaded from kenney.nl (`tools/fetch-kenney.mjs`, raw packs git-ignored,
  listed with URLs and licence in `docs/credits.md`). Quaternius packs need a manual download
  (Google Drive); links in credits.
- Recolour pipeline: `data/palettes.json` + `src/core/palette.js` map every texel of a pack model's
  palette texture to the art-style palettes; only bright saturated texels glow. Per-unit palette
  overrides make colour variants from one model. Pack models support `scale` and code motion
  (`hover`, `waddle`, `roll`) when they have no clips; static towers aim and recoil.
- `tools/import-kenney.mjs`: 23 models (9 tower bases, 9 enemy bases incl. 5 animated undead,
  5 boss bases), scaled to art-style heights, within triangle budgets, reviewed in
  docs/screenshots/kenney (5 views + animation each).
- `tools/gen-content.mjs` (batch `kenney_b1`): 18 towers, 18 enemies, 10 bosses derived from
  balanced templates. Towers are priced with the balance bot's own value estimate; enemies keep
  their template's HP x speed. Generated towers stay out of the Daily Challenge.
- Balance tests now guard the 12 core towers explicitly (`coreTowers` in test/helpers.js).

## 0.11.0 - Quaternius CC0 packs imported (2026-11-06)
- 10 Quaternius CC0 packs downloaded from the official Google Drive folders linked on
  quaternius.com (Drive "Download all" driven by Playwright; per-file gdown hit Drive's download
  quota). Raw packs git-ignored; only model / texture / licence files kept (.blend, .mtl, .gif, .mp4
  deleted; no executables or scripts were present). Counts and links in `docs/credits.md`.
- `tools/blender/convert_fbx.py`: FBX / glTF / OBJ to GLB in a temporary Blender scene (the open
  .blend is untouched), every clip exported with a clean name, optional decimation to the
  art-style triangle budget (weights kept) and dropping spare meshes.
- `tools/import-quaternius.mjs`: 14 models registered in `data/models.json` (7 enemies, 5 bosses,
  2 War towers) with clip mapping; `--fit` measures each model's idle height in the engine and
  corrects the scale. Reviewed in docs/screenshots/quaternius.
- Engine: skinned meshes are now split into rigid per-bone parts for instanced drawing
  (`rigidifySkinned` in `src/engine/instancedRig.js`; before, skinned enemies would have been
  frozen in their bind pose in matches). Flat material colours are recoloured to the palettes
  (Quaternius uses no palette texture). New per-model `yaw` and `glow: false` manifest options.
- Asset viewer shows enemies and bosses through the baked instanced rig, i.e. as matches draw them.
- Unit test for the rigidifier (matches three.js CPU skinning).

## 0.11.1 - Quaternius polish (2026-11-06)
- Glowing eyes for the Quaternius enemies and bosses: `mark_glow` in `tools/blender/convert_fbx.py`
  gives small face islands on the head (dark atlas texels, a named colour or material) an emissive
  Blight-crimson material and protects them from decimation; 13 of 15 creature / machine models.
- `blight_pale` palette for the blob orc, spiky blob and ninja (they read as black blobs);
  `blight_scrap` for Tank3 (dark slate hull, black tracks) with crimson glowing hull lights.
- Tower `basePlate` (War steel pad / Magic stone plinth) under the Leela mech and the soldier.
- Animated Zombie imported (`q_zombie`): the FBX armature carries a 90 degree rotation; the
  engine-measured scale fixes it. No death clip (code death).
- `tools/quaternius-models.json` is the one list for the Blender conversion
  (`tools/blender/convert_quaternius.py`) and `tools/import-quaternius.mjs`.
- Engine: authored emissive parts take the glow path before the flat-colour recolour.

## 0.11.2 - Boss killer for the generated towers (2026-11-06)
- New tower stat `bossDamage` (damage multiplier against bosses; the bot values it at a third).
- Lancer Mech (generated, War, on the Quaternius Leela mech with a War pad): armour-piercing
  sniper, 3x damage to bosses, ground only, fixed role price $500 (`price` op in gen-content).
- Generated menu alone: Riftline Normal 5/12 -> 12/12, Frostmere 12/12 -> 12/12 (above target,
  BUGS.md #37). Daily Challenge unchanged (62/100). `tools/dev/tower-usage.mjs` shows what the bot
  builds in won and lost runs.

## 0.12.0 - Maps, content batches, heroes (2026-11-06)
- Seeded map generator `src/core/mapGen.js` (pure, unit-tested): 1-road serpentine, 2-road fork and
  3-road trident templates, roads validated (frame, 11 m between unrelated stretches, keep), portals,
  keep and spawn on flats, themed decorations and lamps, hills, scatter with `scatterGap` 1.3, wave
  tables varied from the campaigns (roads round robin, themed swaps that keep the mechanic, HP knob).
  6 themes (`tools/map-themes.json`), `tools/gen-maps.mjs` (build space, hero soak, bot calibration).
- 15 new maps: Glacier Gate, Mirrormire, Starfall Sanctum (hand-made roads, featured new units and
  bosses) + 12 generated; unlock levels 2-27; a music key per map; scrollable hub map picker.
- Content batch quaternius_b1 (Rifle Squad, Starwatch Tower, Sanctum of Dawn, Spirit Barracks;
  8 enemies, 5 bosses) and quaternius_b2 (5 enemies with mechanic combinations: flying + armour,
  flying splitter, flying + stealth, regenerating, summoner; 2 bosses), one distinct model each.
  Magic towers on Ultimate Fantasy RTS buildings.
- Heroes: Warmaster Ryn and Archmage Seren (own colours, hub Hero picker); 5 new hero skills;
  ability effects slow, healBase and cash implemented (the data doc listed them, the sim did not).
- Fixes: Boss Rush drew only the 6 weakest bosses (bug 38); wave swaps could turn ground templates
  into flyers (bug 39); hero choice never reached the match (bug 40).
