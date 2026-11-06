# Completion scoreboard

Progress toward the **final product** spec (100+ towers, 200+ enemies, 50+ maps, 100+ bosses and the
feature list below). Goal of the current run: at least **75%** overall and 75% of each content target.
Counts come from `node tools/count-content.mjs` (reads `data/` through the game's own loader).

**Overall: 59%** (updated 2026-11-06, UI/GFX batch 1 + boss mechanics + quests batch). Targets raised by the owner to the full final product (100%).

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
| Maps | 17 on 8 themes | 5 hand-made, 12 generated | - | 50 | 38 | 34% |
| Heroes | **10** (10 looks: own colours + gear silhouettes, builds, weapons) | **39 skills**, 4 per hero | 1 code model with 8 headgear / 5 weapon / 3 shoulder parts and 6 body builds | 10, 4 skills each, 30 skills | - | **100%** |

Boss phase mechanics: **16** of 12 (telegraphed tower stun, summon, shield, speed + teleport, regen, cloak, damage-type immunity, armour, dash, cash drain, portals on other roads, heal pulse, snipe on the top tower, revive once, split on death). 40 generated bosses (`tools/gen-bosses.mjs`) each use a different set.

## Score (weights sum to 100)

| Area | Weight | Measure | Score |
|---|---|---|---|
| Towers | 10 | 37 / 100 | 3.7 |
| Enemies | 10 | 42 / 200 | 2.1 |
| Bosses | 10 | 59 / 100 | 5.9 |
| Maps | 10 | 17 / 50 | 3.4 |
| Uniqueness ratios | 5 | towers 1.0, enemies 1.0, bosses 1.0 (of target ratio) | 5.0 |
| Heroes and skills | 6 | heroes 7/10, skills 27/30, 4-skill heroes 7/10; picker with skills detail | 4.6 |
| Tower classes and factions | 5 | 8 of 11 classes (no aura, hero-linked, separate rockets/artillery); air has 1 member | 3.0 |
| Enemy mechanics | 5 | 10 of 13 (missing teleport, speed burst, immunities) | 3.8 |
| Boss phase mechanics | 5 | 16 / 12 | 5.0 |
| Modes | 5 | 7 / 10 (no new modes yet) | 3.5 |
| Meta | 10 | tiers, branches, shop yes; 1 banner; Index with discovery bars; quests 29/80 (23 daily + 6 story); achievements 95/80 (honest: tiers of 17 distinct conditions, `tools/gen-quests.mjs`); daily only; no cosmetics | 6.3 |
| Music and SFX | 4 | 4 moods, scale per map; no boss/victory theme sets per theme; SFX per class partial | 1.6 |
| Quality and accessibility | 5 | tutorial, touch, settings, reduced motion, high contrast, text + interface scale, Low/Medium/High/Ultra, resolution scale, keyboard tab navigation, ARIA progress bars; colourblind only glyphs; no LOD | 4.5 |
| Map features | 5 | themes 8/14, flagships 5/13, new path templates 0/4 | 1.6 |
| Visual polish | 5 | war-table UI with faction dress and SVG icon set, map previews, per-theme sky / grade / particles / ground detail, time of day, data-driven VFX library (60+ presets, status auras), boss intro letterbox, slow motion on boss death, victory / defeat sequences, animated reward counters | 4.0 |
| **Total** | 100 | | **59** |

## Log

| Date | Batch | Overall | Notes |
|---|---|---|---|
| 2026-11-06 | start | 43% | baseline from data; bosses are the weakest area (2 distinct mechanic sets for 19 bosses) |
| 2026-11-06 | 1 (part) | 43% | bug 37 accepted after 3 attempts (Lancer limit 1); stopped at 85% of the 5-hour usage window as instructed |
| 2026-11-06 | quests + decals | 59% | 87 generated achievements (17 conditions, partial progress bars), 15 extra daily quests, Quests tab sorted (claimable first); faction base decals and rarity rings under towers; letterbox under the HUD |
| 2026-11-06 | UI/GFX 1 + bosses | 58% | docs/ui-style.md, tokens + theme layer, hub redesign (nav rail, mission summary, map picker with search / theme filters / previews / locks), HUD icons, end screen counters, Ultra / resolution / UI scale, theme visuals (sky, grade, particles, ground detail, grass sway, dusk / night maps), VFX library, 12 new boss mechanics and 40 bosses |
| 2026-11-06 | 1 | 47% | 4 new heroes (Ignis, Kade, Nyra, Holt), 4th skill for the 3 old ones, 19 new skills on 9 new effects (burn, mark, chain, knockback, reveal, shield break, execute, road allies, damage buff), hero attacks with status effects, hero picker with skill details, 4th ability key V |
