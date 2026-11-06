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
- [ ] Bosses: distinct bodies for 40+ bosses (59 bosses on 14 models now); modular code-built boss kit
      (body, horns, wings, armour, weapons, totems, auras) where the silhouette hints at the mechanic
- [ ] Heroes: each of the 7 (later 10+) heroes a distinct model or strongly distinct outfit / weapon / silhouette
- [ ] Tower and enemy materials: emissive details, wear, trim; Magic = runes / crystal / gold, War = painted
      metal / camo / hazard stripes (models.js style pass)
- [ ] Distinct models toward 40% of units for towers and enemies
- [ ] Readability language: shape, colour, icon, ring for damage type, class, rarity, threat
- [ ] Before / after sheets in docs/screenshots/identity/

## Chunk 2: content to the targets (MUST)
- [ ] Bosses 100+ (more unique phase mechanics; distinct >= 50%)
- [ ] Towers 100+ across all classes incl. aura, hero-linked, rockets vs artillery, more air (distinct >= 50%)
- [ ] Enemies 200+ with teleport, speed burst, immunities, stealth, split, heal, shield, swarm (distinct >= 35%)
- [ ] Maps 50+: 6+ new themes, path templates (loops, crossovers, multi-lane, air routes), 8+ new flagships,
      picker scales to 50+
- [ ] Heroes 10+, skills 30+
- [ ] 3+ new modes (10+ total)
- [ ] More CC0 packs (Kenney, Quaternius first), credits recorded
- [ ] Balance bot quick check (12 seeds) on every new map and mode

## Chunk 3: balance sweep (MUST)
- [ ] BUGS #44 heroes too strong, #37 generated towers too strong, #46 Boss Rush 55% (global multipliers)
- [ ] 20 seeds per map / mode / difficulty; Standard Normal 60-70%; smooth ladder; Relaxed + Original work
- [ ] New-player path, pacing (first win, first evolution, first summon rarity), no dead ends or exploits
- [ ] Economy and sandbox exploit check; results in TUNING.md and VERIFICATION.md
- [ ] Milestone: full e2e + 30 min soak

## Chunk 4: meta and cosmetics (SHOULD)
- [ ] Index covers everything, completion rewards
- [ ] 80+ quests, 80+ achievements with distinct conditions
- [ ] Several summon banners with pity
- [ ] Cosmetics: tower skins, hero outfits, projectile effects, UI themes, map decorations (earned in play)
- [ ] Daily and weekly rewards; every reward granted exactly once (tested)

## Chunk 5: audio (SHOULD)
- [ ] Music set per theme + boss, victory, defeat themes; crossfades; Music volume
- [ ] SFX per unit class and damage type, UI sounds, ducking, captions, mute, mix pass, reduced sound option

## Chunk 6: UI and tutorial (MUST)
- [ ] Every screen in docs/ui-style.md finished (hub, pickers, loadout, shop, summon, Index, quests, settings,
      HUD, pause, results, credits, privacy, terms)
- [ ] Tutorial v2 (< 5 min, skippable with confirm, replayable)
- [ ] Stat tooltips, searchable Help, income / DPS breakdown, first-run difficulty choice, strings in data files
- [ ] Accessibility audit with fixes; screenshots at phone / tablet / desktop
- [ ] Milestone: full e2e + 30 min soak

## Chunk 7: performance and PWA (MUST)
- [ ] Budgets reported (frame time, draw calls, triangles, memory, load size)
- [ ] LOD, instancing, effect and shadow caps, compression only if it helps, atlasing, lazy loading
- [ ] Low / Medium / High / Ultra presets change cost; auto-Low on weak devices
- [ ] PWA: manifest, code-made icons, service worker (offline, versioned caches, update notice)

## Chunk 8: QA and safety (MUST)
- [ ] Full e2e, soak on every map, fuzz tests (inputs, settings)
- [ ] Save safety: corrupt / old / huge / hand-edited saves, migrations, export / import, crash-safe autosave
- [ ] Error boundaries per unit, memory leak checks (GPU, JS), client security review
- [ ] Milestone: full e2e + 30 min soak

## Chunk 9: online (COULD, only after 1-8 pass)
- [ ] Supabase Free + Cloudflare Workers / Durable Objects per docs/online-plan.md; single player stays offline
- [ ] Safety features, trading behind a flag, docs/online-limits.md

## Chunk 10: launch preparation (SHOULD)
- [ ] Credits screen + credits.md audit, privacy + terms pages, naming / branding doc, icons, meta tags, 404
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
