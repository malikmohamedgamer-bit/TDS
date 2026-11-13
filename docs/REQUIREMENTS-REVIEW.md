# Requirements review (2026-11-14, version 0.13.0)

The original build brief (2026-11-05, first session) checked line by line against the game as it is.
Evidence points to files, tests and docs. "Owner" means it needs the owner (an account, a device, ears).

## Stack

| Requirement | Status | Evidence |
|---|---|---|
| Vanilla ES modules, no build step; Three.js pinned and vendored, no CDN | Done | vendor/three 0.187.0, import map in index.html; the site build only copies files and bundles data JSON |
| GLB loading, instancing, pooling, animation mixers, post-processing with quality settings and reduced motion | Done | src/engine (instancedRig, models, renderer), Settings > Graphics |
| Pure, deterministic simulation (fixed step, seeded RNG), Node-testable | Done | src/core, src/sim; 252 unit tests; co-op lockstep relies on it |
| All content as JSON data | Done | data/, data/index.json; maps, waves, towers, enemies, bosses, modes, quests, cosmetics, difficulty factors |
| Saves: schema version, migrations, export / import, backup, in-memory fallback; server-validatable | Done | src/save, save fuzz test (400 damaged saves), Help > Save code |
| Node tests, Playwright, ESLint; GitHub Pages via Actions; desktop-first, playable on phones | Done | 252 unit, 26 server, 28 e2e incl. touch; .github/workflows/pages.yml; every deploy green |

## World, camera, movement

| Requirement | Status | Evidence |
|---|---|---|
| Walkable hero, WASD / arrows, Space jump, Shift sprint, orbit + first person, collision, never stuck or out of the map | Done | e2e explore.spec; 30 min soak: 68 / 68 maps, 0 rescues, 0 failures |
| Free fly camera (Q / E up and down, speed), top-down overview, return key | Done | camera modes orbit / first / free / top (src/engine/cameraRig.js) |
| Touch: joystick, drag look, pinch zoom, 44 px buttons | Done | e2e touch.spec on an emulated phone |
| Placement from any camera with preview, range circle, shape + text validity | Done | e2e match.spec; tutorial step "Build it" |
| Looks right from all angles | Done | asset viewer (viewer.html), identity sheets in docs/screenshots/identity |
| Performance: instancing, frustum culling, shadow limits, pooling, quality setting | Done | docs/PERF.md: every budget met |
| Level of detail | Not built (decision) | Low-poly art: 94k-209k triangles per frame against 150k / 300k budgets (docs/PERF.md); LOD would add complexity for little gain. Revisit if real-device frame times say otherwise |
| Real frame times on a mid-range desktop and a phone | Owner | Headless software rendering cannot measure them (VERIFICATION.md says so) |

## Gameplay

| Requirement | Status | Evidence |
|---|---|---|
| Fixed paths, open placement | Done | sim canPlace; air routes added for fliers on 6 maps |
| Tower classes: ground, air (helicopters and jets), sniper, area, support, summoner, trap, hybrid; 9 damage types with resistances | Done | 105 towers incl. a jet and a dragon; data/damageTypes.json |
| Hero with abilities and attacks; enemies hurting the hero is a setting, default off | Done | 10 heroes, 39 skills; Settings `enemiesHurtHero` |
| Two upgrade layers: permanent lobby tiers with evolutions, in-match branching paths with evolutions | Done | data/progression.json, tower upgrade paths; e2e upgrade / evolve |
| Targeting: first, last, strongest, weakest, fastest, flying-only, closest | Done | src/sim/combat.js TARGET_MODES |
| Abilities with cooldowns, manual or automatic | Done | AUTO buttons in the HUD |
| Enemy kinds incl. stealth, healers, splitters, shields, regen, swarm, summoners; bosses with phases and telegraphs | Done | 200 enemies, 100 bosses |
| Difficulties Easy to Impossible, 1.5x steps, rewards scale | Done, one change | Easy to Extreme as specified; Impossible raised from 7.6x to 11x because the bot won 87% at max level; plus per-map factors so every map is fair on every difficulty (docs/TUNING.md) |
| Modes: Campaign, Endless, Boss Rush, Daily, Sandbox, Challenge modifiers, Time Attack | Done | 11 modes (+ Skirmish, Mutation, War Chest, Last Stand) |
| Economy: match cash + meta currency | Done | crowns, sigils; economy check in TUNING.md |
| Slot-machine summons (reels, near miss, jackpot, rare cutscene, sound per reel, skippable), shop, free currency only | Done | Summon tab, 3 banners with pity; no real money |
| Rarities, levels, XP, quests, achievements, rewards granted once, Index | Done | 117 quests, 109 achievements, Index with collection rewards; reward-once unit tests |

## Scale

| Target | Reached |
|---|---|
| 100+ towers | 105 |
| 200+ enemies | 200 |
| 50+ maps | 68 (13 hand-made flagships, 55 generated on 5 road templates) |
| 100+ bosses | 100 |

## Art pipeline

| Requirement | Status | Evidence |
|---|---|---|
| One style, docs/art-style.md first, optional pixelation | Done | docs/art-style.md; Settings pixelation |
| Blender via MCP | Done (early milestones) | used for the first models; later models are code-built or CC0 packs |
| CC0 packs, credits | Done | 10 Kenney + 10 Quaternius packs, docs/credits.md audited |
| Mixamo animations | Not used | none were provided in assets/incoming; rigs animate in code |
| Meshy | Not used | free plan blocked (owner's decision) |
| UI and icons in code, no placeholder look | Done | code-drawn icon set, thumbnails rendered from the 3D models |
| Code effects, synthesized music and SFX with mute, volume, captions | Done | src/audio; 0.13.0 battle audio pass; Reduced sound option |
| Asset viewer, 4-angle review | Done | viewer.html, e2e viewer.spec |

## Phase 2: online

| Requirement | Status | Evidence |
|---|---|---|
| docs/online-plan.md design | Done | docs/online-plan.md |
| Real-time co-op | Built (owner asked 2026-11-13) | 2-4 players, lockstep, Supabase or own relay; docs/multiplayer.md, docs/DEPLOY-ONLINE.md |
| Live co-op online | Owner | needs the owner's Supabase project (or a relay host); the game side is one config file |
| Accounts, cloud saves, leaderboards, trading, teams | Not built (as the brief says: design only unless asked) | docs/online-plan.md |

## Quality and rules

| Requirement | Status | Evidence |
|---|---|---|
| Animations, impacts, damage numbers, range rings, smooth camera | Done | e2e and screenshot reviews |
| Accessibility: keyboard, focus rings, reduced motion, high contrast, colourblind palettes, text scale, no colour-only info | Done | Settings; contrast audit (BUGS 61) |
| Unit tests for waves, targeting, damage, economy, upgrades, evolutions, summon odds, rewards once | Done | test/unit (252) |
| E2E: load, walk, jump, collision, cameras, touch, match, place from angles, attack, wave clear, cash, upgrade / evolve, boss, win / lose, save / reload, summon, tutorial | Done | test/e2e (28 tests) |
| Balance bot: every map and difficulty winnable, not trivial | Done | sweep (every map 50-80% at Normal), per-map difficulty factors (331 of 340 cells 50-75%), ladder |
| Soak test on every map | Done | 68 / 68 |
| BUGS.md, VERIFICATION.md, PROGRESS.md kept up to date | Done | 69 bug entries; VERIFICATION 0.13.0 table |
