# Roadmap to the final product

Owner brief "FINISH THE GAME" (2026-11-06): take TDS from 59% to a launch-ready final product. The full
brief is stored verbatim in `C:\Users\Malik\.claude\scheduled-tasks\tds-finish-game-resume-1\SKILL.md`
(outside the repo). Acceptance criteria are tracked in `docs/COMPLETION.md`; this file is the checklist.

**Priority tiers.** MUST items are finished before any SHOULD or COULD item if usage runs short.
MUST: Chunks 0, 1, 2, 3, 6, 7, 8, 11. SHOULD: Chunks 4, 5, 10. COULD: Chunk 9 (online, only after 1-8 pass).

**Global rules (every batch).** Checkpoint push to `wip/final` before the batch; after it: unit tests, lint,
balance bot on new content (12 seeds now, 20 for final numbers), asset review from 4 angles and in a match,
update COMPLETION / ROADMAP / PROGRESS, commit, push `feature/vertical-slice`, confirm Pages deploy green.
Full e2e and the 30-minute soak only at the end of Chunks 3, 6, 8 and 11. At most 3 tuning attempts per
problem, then keep the simplest fix and log it in BUGS.md. CC0 only. Generated data comes from generators.
Stop at about 95% of the 5-hour window or 97% weekly and schedule the next resume.

## Chunk 0: start and state check (MUST)
- [x] No other session running in the folder; branch feature/vertical-slice; tree clean (2026-11-06)
- [x] Node v24.22.1, gh logged in (malikmohamedgamer-bit), unit tests 109/109, lint clean
- [x] Blender MCP connected (Blender 5.2.2): test cube made and deleted
- [x] Docs read; this ROADMAP created

## Chunk 1: visual identity (MUST)
- [x] Bosses: distinct bodies for 40+ bosses (59 bosses on 14 models now); modular code-built boss kit
      (body, horns, wings, armour, weapons, totems, auras) where the silhouette hints at the mechanic
  - [x] Kit: `src/engine/bossKit.js` (5 bodies: brute, strider, wraith, colossus, crawler; 14 mechanic parts;
        unit tests test/unit/bossKit.test.js) (2026-11-06)
  - [x] 8 bosses on kit builds (boss_mech_01-08 via tools/gen-bosses.mjs `KIT_BOSSES`); 4-angle sheets in
        docs/screenshots/identity/kit-b1 (boss models 14 -> 22)
  - [x] Checked in a real match (Riftline, all 8 spawned, no page errors; scale fits the road; `tools/dev/kit-match-shot.mjs`,
        docs/screenshots/identity/kit-b1/match-*.png). Weak spot: dark bodies on dark forest maps rely on the glow accents
  - [x] `KIT_BOSSES` = 40: 5 bodies (wraith 18, colossus 9, brute 5, crawler 5, strider 3), 40 different body+parts sets, 6 hide tints + 5 accents; sheets docs/screenshots/identity/kit-b2; 8 checked in a match (33-40). Weak spot: tints read dark under scene lighting
- [x] Heroes: each of the 7 has a distinct build (body scale), head, weapon (blade, rifle, staff, launcher, bow) and shoulder gear (pauldrons, mantle, spikes); sheets docs/screenshots/identity/heroes-b1; 10+ heroes is Chunk 2
- [x] Tower and enemy materials (first pass, 2026-11-06): `applyTrim` in models.js: object-space 16 texel/m wear, War hazard stripes + chipped paint, Magic gold glints + rune dots, Blight veins (GLB models only; code-built models still flat). Subtle by design; `tools/dev/trim-shot.mjs`, docs/screenshots/identity/trim. Not yet: code-built models, close-up hazard check
  (was: emissive details, wear, trim; Magic = runes / crystal / gold, War = painted
      metal / camo / hazard stripes (models.js style pass)
- [ ] Distinct models toward 40% of units for towers and enemies
- [ ] Readability language: shape, colour, icon, ring for damage type, class, rarity, threat
- [ ] Before / after sheets in docs/screenshots/identity/

## Chunk 2: content to the targets (MUST)
- [x] Bosses 100+ (100 bosses: 19 earlier + 81 generated kit bosses in mechanics_b1 / b2; 83 mechanically distinct, 94 models) (2026-11-06)
- [x] Towers 100+ (100: 63 kit towers with 7 new sim mechanics: execute, crit, ramp, shred, pushback, bounty, multishot; 85 mechanically distinct, 91 models) (2026-11-06). Still thin: air, aura, summoner, trap, hero-linked classes (all kit towers are direct-fire) - add in a later batch
- [x] Enemies 200+ (200: 158 kit enemies from tools/gen-enemies.mjs; new sim mechanics blink + burst; 12 traits, every trait set used once; 168 distinct, 191 models) (2026-11-06). They appear in Endless / Daily pools only; campaign tables unchanged (maps batch will feature them)
- [x] Maps 56 on 14 themes (6 new looks), picker groups all of them. Path templates: diamond (split lanes) and
      crossover added 2026-11-12 (5 templates). Still open: air routes, 8 more hand-made flagships (5 of 13)
- [x] Heroes 10+, skills 30+ (10 heroes, 39 skills: Tidecaller Maren, Blastmaster Brik, Shadowblade Vex + 12 abilities) (2026-11-06). Balance of the new three not yet measured (Chunk 3, with BUGS #44)
- [x] 4 new modes, 11 total: Skirmish, Mutation, War Chest, Last Stand (2026-11-11)
- [ ] More CC0 packs (Kenney, Quaternius first), credits recorded
- [x] Balance bot quick check (12 seeds) on every new map and mode (maps: tools/map-batches.json `calibration`; modes: BUGS 49, 50)

## Chunk 3: balance sweep (MUST)
- [x] BUGS #44 heroes (30 seeds: 57-83%, was 75-100%). #37 and #46 were accepted earlier
- [ ] 20 seeds per map done (mean 66%, all 56 maps in 50-80%, docs/balance-sweep.json). Open: modes and the difficulty ladder with 20 seeds, Relaxed + Original re-check
- [ ] New-player path, pacing (first win, first evolution, first summon rarity), no dead ends or exploits
- [ ] Economy and sandbox exploit check; results in TUNING.md and VERIFICATION.md
- [ ] Milestone: full e2e + 30 min soak

## Chunk 4: meta and cosmetics (SHOULD)
- [ ] Index covers everything, completion rewards
- [x] 87 quests, 109 achievements (21 distinct condition kinds; most achievements are tiers)
- [x] 3 summon banners, pity per banner
- [ ] Cosmetics: 4 kinds, 26 items earned in play (interface themes, hero outfits, projectile effects, tower base plates). Open: full tower skins (recoloured models), map decorations
- [x] Daily login streak, daily quests and weekly quests; every reward granted exactly once (tested)

## Chunk 5: audio (SHOULD)
- [x] Music style per theme (12), boss, final boss, victory and defeat pieces; volume dip on changes; Music volume. Not checked by ear
- [ ] SFX per unit class and damage type, UI sounds, ducking, captions, mute, mix pass, reduced sound option

## Chunk 6: UI and tutorial (MUST)
- [ ] Every screen in docs/ui-style.md finished (hub, pickers, loadout, shop, summon, Index, quests, settings,
      HUD, pause, results, credits, privacy, terms)
- [ ] Tutorial v2 (< 5 min, skippable with confirm, replayable)
- [ ] Searchable Help, battle report, tower stat tooltips and the first-run Easy default with a hint are done. Open: all strings in data files
- [ ] Accessibility audit with fixes; screenshots at phone / tablet / desktop
- [ ] Milestone: full e2e + 30 min soak

## Chunk 7: performance and PWA (MUST)
- [x] Budgets reported in docs/PERF.md (draw calls, triangles, GPU objects, memory, load size; frame time needs a real GPU)
- [ ] LOD, instancing, effect and shadow caps, compression only if it helps, atlasing, lazy loading
- [x] Presets change cost (Low about half the calls of Medium+); weak devices start on Low; automatic step-down during play
- [x] PWA: manifest, code-made icons, service worker (offline, cache per build, update notice). Not yet tested on the live URL or a phone

## Chunk 8: QA and safety (MUST)
- [ ] Full e2e, soak on every map, fuzz tests (inputs, settings)
- [x] Save safety: corrupt / old / hand-edited saves (fuzz test), migrations, export / import UI (Help tab), backup copy. Open: huge saves
- [ ] Memory leak check done (tools/leak-check.mjs; leak fixed, BUGS 62). Open: error boundaries per unit, client security review
- [ ] Milestone: full e2e + 30 min soak

## Chunk 9: online (COULD, only after 1-8 pass)
- [ ] Supabase Free + Cloudflare Workers / Durable Objects per docs/online-plan.md; single player stays offline
- [ ] Safety features, trading behind a flag, docs/online-limits.md

## Chunk 10: launch preparation (SHOULD)
- [ ] Credits, privacy and terms (Help tab), icons, meta tags, 404 page done. Open: credits.md audit, naming / branding doc
- [ ] README, store text, feature list, 10 screenshots + frame sequence, itch.io zip script, CHANGELOG,
      version string, daily live-URL smoke test in CI, docs/LEGAL-CHECKLIST.md; no monetization by default

## Chunk 11: final verification and handover (MUST)
- [ ] Full unit + e2e, final soak, final 20-seed sweep, requirements review
- [ ] VERIFICATION.md table, BUGS.md, CHANGELOG.md, COMPLETION.md final %, PLAYTEST.md for the owner
- [ ] Deploy green, live URL checked

## Log
| Date | Step | Notes |
|---|---|---|
| 2026-11-06 | Chunk 0 | State check done at 85% of the 5-hour window; stopped there and scheduled the resume |
| 2026-11-06 | Chunk 1 slice 1 | Owner raised the stop line to 99% for this run. Boss kit + 8 kit bosses, reviewed from 4 angles (fixed: cylinders and cones are base-anchored in ModelBuilder, now `centered`; second weapon to the left hand). Then checked in a real match (no errors, scale fine) |
| 2026-11-06 | Chunk 1 slice 2 | 40 kit bosses (boss models 22 -> 54 distinct), tints, sheets kit-b2, match check; unit 111, lint clean |
| 2026-11-06 | Chunk 1 slice 3 | Heroes: builds, bow and launcher weapons, pauldrons / mantle / spikes; reviewed from 4 angles |
| 2026-11-06 | Chunk 1 slice 4 | Faction material trims via applyTrim (shader patch, no console errors in a real match); subtle |
| 2026-11-06 | Chunk 2 bosses | 100 bosses (81 kit bosses, `tools/gen-bosses.mjs` writes mechanics_b1 + b2). Boss Rush fell to 3/12 with the bigger pool; BASE_HP 7500 -> 6000 gave 9/12 (75%), 6500 gave 7/12 (58%), kept 6500 (2 attempts). Unit 111, lint clean |
| 2026-11-06 | Chunk 2 towers | 7 new tower mechanics in the sim (tests), `src/engine/towerKit.js`, `tools/gen-towers.mjs` -> data/towers/mechanics_b1.json (63 towers). Generated-only Riftline / Frostmere Normal: PRICE_MUL 1.1 12/12 + 11/12, 1.5 5/12, 1.3 12/12, 1.4 9/12 + 8/12 (3 attempts, kept 1.4; BUGS #48). Unit 119, lint clean |
| 2026-11-06 | Chunk 2 enemies | Enemy mechanics blink + burst (sim, tests), boss-kit bodies shrunk via model.scale (baked in rigFromProcedural), `tools/gen-enemies.mjs` -> data/enemies/mechanics_b1.json (158). Unit 122, lint clean. No balance run yet on Endless with the 200 pool (Chunk 3) |
| 2026-11-06 | Chunk 2 heroes | 3 heroes + 12 abilities (goggles / crown heads, dagger weapon in HeroView, icons), sheets heroes-b2. Unit 122, lint clean |
| 2026-11-11 | Chunk 2 maps + modes | 33 generated maps calibrated (12 seeds, core towers), 4 modes (sim flags maxWaves, keepHpFixed, mutations), balance tool --mode. Unit 124 |
| 2026-11-11 | Chunk 7 PWA | manifest, icons (tools/gen-icons.mjs), sw.js stamped by tools/build-site.mjs, src/pwa.js |
| 2026-11-11 | Chunk 4 + 6 + 8 | Quests 87, Help tab with save export / import, save fuzz test and sanitizer fixes, banners, cosmetics, battle report |
| 2026-11-11 | Chunk 2 featuring | Kit enemies and bosses on the 33 new maps (252 of 300 units in waves), recalibrated; 6 re-skin themes (waves and layouts verified identical); music styles. Unit 132 |
| 2026-11-12 | Chunk 3 (part) | Heroes tuned in 3 rounds (30 seeds), tools/sweep.mjs: 50 maps x 20 seeds, 3 outliers re-tuned. E2E 26/26 before the hero pass. First-run Easy default, tower stat tooltips |
| 2026-11-12 | Chunk 2 templates | Diamond + crossover templates, 6 maps (cohort 2), 4-agent review found 6 bugs (BUGS 56-59), cloud glare in the overview fixed (BUGS 60). Unit 134 |
| 2026-11-12 | Chunk 3 + 10 | Re-sweep after the ally fix: 56 maps, mean 66%, all in 50-80%. Launch prep (version, meta tags, 404, itch.io zip packager), weekly quests, contrast fix. Unit 136 |
| 2026-11-12 | Chunk 7 + 8 | Perf budgets (docs/PERF.md), memory leak fixed (2,000 geometries per match), auto quality step-down, weak-device default. Unit 138 |
