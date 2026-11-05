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
