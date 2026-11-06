# Completion scoreboard

Progress toward the **final product** spec (100+ towers, 200+ enemies, 50+ maps, 100+ bosses and the
feature list below). Goal of the current run: at least **75%** overall and 75% of each content target.
Counts come from `node tools/count-content.mjs` (reads `data/` through the game's own loader).

**Overall: 47%** (updated 2026-11-06, batch 1 done). Targets raised by the owner to the full final product (100%).

## How the counts work (honest counting)

For every content type: (1) total units, (2) **mechanically distinct** units, (3) distinct models.
(2) groups units by a mechanic signature: behaviour keys, damage type, targeting, status effects, flags
(flying, stealth, shield, heal, split, regen, summon ...), immunities and, for bosses, the set of phase
actions. Magnitudes (damage, HP, speed, range, cost, resist amounts) never make a unit distinct, so
colour and stat variants count once. Each signature group counts as one.

## Content

| Type | Total (1) | Distinct mechanics (2) | Models (3) | Final target | Run target (75%) | Progress to final |
|---|---|---|---|---|---|---|
| Towers | 37 (21 War, 16 Magic) | 23 (62%, target 50%) | 28 | 100 | 75 | 37% |
| Enemies | 42 | 19 (45%, target 35%) | 33 | 200 | 150 | 21% |
| Bosses | 19 | **2** (11%, target 50%) | 14 | 100 | 75 | 19% |
| Maps | 17 on 8 themes | 5 hand-made, 12 generated | - | 50 | 38 | 34% |
| Heroes | 7 (7 looks: own colours + gear silhouettes) | 27 skills, 4 per hero; 9 new skill effects | 1 code model with 6 headgear / 3 weapon parts | 10, 4 skills each, 30 skills | - | 77% |

Boss phase mechanics: **4** of 12 (shield, speed, summon, telegraphed tower stun).

## Score (weights sum to 100)

| Area | Weight | Measure | Score |
|---|---|---|---|
| Towers | 10 | 37 / 100 | 3.7 |
| Enemies | 10 | 42 / 200 | 2.1 |
| Bosses | 10 | 19 / 100 | 1.9 |
| Maps | 10 | 17 / 50 | 3.4 |
| Uniqueness ratios | 5 | towers 1.0, enemies 1.0, bosses 0.21 (of target ratio) | 3.7 |
| Heroes and skills | 6 | heroes 7/10, skills 27/30, 4-skill heroes 7/10; picker with skills detail | 4.6 |
| Tower classes and factions | 5 | 8 of 11 classes (no aura, hero-linked, separate rockets/artillery); air has 1 member | 3.0 |
| Enemy mechanics | 5 | 10 of 13 (missing teleport, speed burst, immunities) | 3.8 |
| Boss phase mechanics | 5 | 4 / 12 | 1.7 |
| Modes | 5 | 7 / 10 (no new modes yet) | 3.5 |
| Meta | 10 | tiers, branches, shop yes; 1 banner; Index partial; quests 14/80; achievements 8/80; daily only; no cosmetics | 5.3 |
| Music and SFX | 4 | 4 moods, scale per map; no boss/victory theme sets per theme; SFX per class partial | 1.6 |
| Quality and accessibility | 5 | tutorial, touch, settings, reduced motion, high contrast, text scale, quality presets, frame time; colourblind only glyphs; no LOD | 4.0 |
| Map features | 5 | themes 8/14, flagships 5/13, new path templates 0/4 | 1.6 |
| Visual polish | 5 | bloom, shadows, particles, damage numbers, range rings; no faction panel styling, boss intros basic | 2.5 |
| **Total** | 100 | | **47** |

## Log

| Date | Batch | Overall | Notes |
|---|---|---|---|
| 2026-11-06 | start | 43% | baseline from data; bosses are the weakest area (2 distinct mechanic sets for 19 bosses) |
| 2026-11-06 | 1 (part) | 43% | bug 37 accepted after 3 attempts (Lancer limit 1); stopped at 85% of the 5-hour usage window as instructed |
| 2026-11-06 | 1 | 47% | 4 new heroes (Ignis, Kade, Nyra, Holt), 4th skill for the 3 old ones, 19 new skills on 9 new effects (burn, mark, chain, knockback, reveal, shield break, execute, road allies, damage buff), hero attacks with status effects, hero picker with skill details, 4th ability key V |
