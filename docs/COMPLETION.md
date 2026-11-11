# Completion scoreboard

Progress toward the **final product** spec (100+ towers, 200+ enemies, 50+ maps, 100+ bosses and the
feature list below). Goal of the current run: at least **75%** overall and 75% of each content target.
Counts come from `node tools/count-content.mjs` (reads `data/` through the game's own loader).

**Overall: 91%** of this content and feature scoreboard (updated 2026-11-11). The scoreboard does not cover the ROADMAP work that is still open: the 20-seed balance sweep, the accessibility audit, performance budgets, the final QA pass and launch preparation (see docs/ROADMAP.md, Chunks 3, 6, 7, 8, 10, 11).

## How the counts work (honest counting)

For every content type: (1) total units, (2) **mechanically distinct** units, (3) distinct models.
(2) groups units by a mechanic signature: behaviour keys, damage type, targeting, status effects, flags
(flying, stealth, shield, heal, split, regen, summon ...), immunities and, for bosses, the set of phase
actions. Magnitudes (damage, HP, speed, range, cost, resist amounts) never make a unit distinct, so
colour and stat variants count once. Each signature group counts as one.

## Content

| Type | Total (1) | Distinct mechanics (2) | Models (3) | Final target | Run target (75%) | Progress to final |
|---|---|---|---|---|---|---|
| Towers | **100** (57 War, 43 Magic): 37 earlier + 63 kit towers | **85** (85%, target 50%) | 91 (28 earlier + 63 code-built kit builds: 6 bases x 12 heads x 8 add-ons, every combination different) | 100 | 75 | **100%** |
| Enemies | **200** (42 earlier + 158 kit enemies) | **168** (84%, target 35%) | 191 (33 earlier + 158 code-built boss-kit bodies, shrunk; every body+parts set different) | 200 | 150 | **100%** |
| Bosses | **100** | **83** (83%, target 50%) | 94 (14 pack / code models + 81 code-built kit builds on 5 base bodies, every body+parts set different; tints are extra variety, not counted) | 100 | 75 | **100%** |
| Maps | **50** on 14 themes | 5 hand-made, 45 generated (3 road templates) | - | 50 | 38 | **100%** |
| Heroes | **10** (10 looks: own colours + gear silhouettes, builds, weapons) | **39 skills**, 4 per hero | 1 code model with 8 headgear / 5 weapon / 3 shoulder parts and 6 body builds | 10, 4 skills each, 30 skills | - | **100%** |

Boss phase mechanics: **16** of 12 (telegraphed tower stun, summon, shield, speed + teleport, regen, cloak, damage-type immunity, armour, dash, cash drain, portals on other roads, heal pulse, snipe on the top tower, revive once, split on death). 40 generated bosses (`tools/gen-bosses.mjs`) each use a different set.

## Score (weights sum to 100)

| Area | Weight | Measure | Score |
|---|---|---|---|
| Towers | 10 | 100 / 100 | 10 |
| Enemies | 10 | 200 / 200 | 10 |
| Bosses | 10 | 100 / 100 | 10 |
| Maps | 10 | 50 / 50 | 10 |
| Uniqueness ratios | 5 | towers 85%, enemies 84%, bosses 83% distinct (targets 50 / 35 / 50%) | 5.0 |
| Heroes and skills | 6 | 10 heroes, 39 skills, 4 each | 6.0 |
| Tower classes and factions | 5 | 8 of 11 classes (no aura, hero-linked, separate rockets / artillery); kit towers are all direct-fire | 3.0 |
| Enemy mechanics | 5 | 12 of 13 (blink and speed burst added; no damage-type immunity on normal enemies) | 4.6 |
| Boss phase mechanics | 5 | 16 / 12 | 5.0 |
| Modes | 5 | 11 / 10 | 5.0 |
| Meta | 10 | tiers, branches, shop; 3 banners with pity; Index; quests 87/80; achievements 109/80 (tiers of 18 conditions); cosmetics 2 of 5 kinds (UI themes, hero outfits); daily rewards only, no weekly | 8.5 |
| Music and SFX | 4 | 7 moods (final boss, victory, defeat added), 12 theme styles; SFX per class partial; nothing checked by ear | 2.8 |
| Quality and accessibility | 5 | as before, plus searchable Help, save export / import, offline PWA; colourblind only glyphs; no LOD; no accessibility audit yet | 4.7 |
| Map features | 5 | themes 14/14, flagships 5/13, new path templates 0/4 | 2.3 |
| Visual polish | 5 | as before, plus 6 theme looks and the battle report; code-built units still flat-shaded | 4.2 |
| **Total** | 100 | | **91** |

## Log

| Date | Batch | Overall | Notes |
|---|---|---|---|
| 2026-11-11 | maps, modes, meta, PWA | 91% | 50 maps on 14 themes, campaign features 252 of 300 units, 11 modes, 87 quests, 3 banners, cosmetics, Help, battle report, music styles, PWA, save fuzz. The Score table above was also stale for towers / enemies / bosses (it still showed the counts from before those batches) |
| 2026-11-06 | start | 43% | baseline from data; bosses are the weakest area (2 distinct mechanic sets for 19 bosses) |
| 2026-11-06 | 1 (part) | 43% | bug 37 accepted after 3 attempts (Lancer limit 1); stopped at 85% of the 5-hour usage window as instructed |
| 2026-11-06 | quests + decals | 59% | 87 generated achievements (17 conditions, partial progress bars), 15 extra daily quests, Quests tab sorted (claimable first); faction base decals and rarity rings under towers; letterbox under the HUD |
| 2026-11-06 | UI/GFX 1 + bosses | 58% | docs/ui-style.md, tokens + theme layer, hub redesign (nav rail, mission summary, map picker with search / theme filters / previews / locks), HUD icons, end screen counters, Ultra / resolution / UI scale, theme visuals (sky, grade, particles, ground detail, grass sway, dusk / night maps), VFX library, 12 new boss mechanics and 40 bosses |
| 2026-11-06 | 1 | 47% | 4 new heroes (Ignis, Kade, Nyra, Holt), 4th skill for the 3 old ones, 19 new skills on 9 new effects (burn, mark, chain, knockback, reveal, shield break, execute, road allies, damage buff), hero attacks with status effects, hero picker with skill details, 4th ability key V |
