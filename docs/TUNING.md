# Tuning: make TDS easier or harder

All global difficulty and economy knobs live in **`data/tuning.json`**. Every knob is a
multiplier on the values written in the other data files (`1.0` = as written there).

## Switch the whole game in one line

```json
"preset": "standard"
```

Change it to `"original"` (the easier first-slice tuning) or `"relaxed"` (easiest). Players can
also override it per device in **Settings > Difficulty tuning** (applies from the next match).

| Preset | Meant for | Bot win rate on Normal (imperfect bot, 40 seeds unless noted) |
|---|---|---|
| Standard (default) | the intended challenge | 68% (27/40) |
| Original | the slice tuning | 83% (10/12) |
| Relaxed | friends, first-timers, testing | 100% (12/12) |

A lazy strategy (1-2 cheap tower types, never upgrading) lost every run on Standard and
Original Normal. Re-measure after any change: `npm run balance -- --preset all --seeds 20`.

## The knobs

| Knob | What it does | Safe range | Easier | Harder |
|---|---|---|---|---|
| `enemyHp` | health and shields of every normal enemy | 0.4 - 3 | lower | higher |
| `enemySpeed` | walking / flying speed | 0.6 - 1.5 | lower | higher |
| `enemyCount` | enemies per wave group (bosses never change; spacing scales so groups last as long) | 0.5 - 2 | lower | higher |
| `startCash` | cash at the start of a match | 0.5 - 3 | higher | lower |
| `killIncome` | cash per kill | 0.3 - 3 | higher | lower |
| `waveBonus` | cash bonus per finished wave (income towers are not affected) | 0.3 - 3 | higher | lower |
| `towerCost` | price of placing towers | 0.5 - 2 | lower | higher |
| `upgradeCost` | price of upgrade steps | 0.5 - 2 | lower | higher |
| `heroDamage` | the Commander's attack damage | 0.25 - 5 | higher | lower |
| `bossHp` | extra health multiplier for bosses only (on top of `enemyHp`) | 0.3 - 3 | lower | higher |
| `bossPhaseSpeed` | how much boss "enrage" speed-ups apply (0.5 = half the speed-up) | 0.5 - 2 | lower | higher |
| `keepHp` | your keep's health | 0.5 - 4 | higher | lower |
| `sellRefund` | share of spent cash returned when selling (not a multiplier) | 0 - 1 | higher | lower |
| `rewardMul` | crowns earned after a match | 0 - 5 | (rewards only) | |

Tips: `waveBonus` and `killIncome` are strong (a 8% wave-bonus cut moved the bot from 75% to
30%). `enemyHp` is a "knife edge" around the final boss: change it in steps of 0.05 and
re-measure. Values outside the safe ranges fail `npm test` on purpose.

## Assist (players simplify it themselves)

Settings > Assist: extra starting cash (+$400), slower enemies (75%), stronger Commander
(2.5x), 100% sell refund, and a **Skip this wave** button. The assist amounts are in the
`assist` block of `tuning.json`. Assisted runs show **✚ Assist** on the results screen, still
give crowns, but do not set records, complete achievements or count for the daily challenge.

## Difficulty ladder (separate from presets)

`data/difficulties.json`: Easy 0.67x, Normal 1x, Medium 1.5x, Hard 2.25x, Extra Hard 3.4x,
Extreme 5.1x, Impossible 11x enemy health (raised from 7.6x on 2026-11-14), multiplied with the
preset. Bosses are the cliff (a final-boss leak loses the match), so a difficulty can soften bosses
only with `bossHpMul`: Medium 0.72, Hard 0.85, Extra Hard 0.85.

Measured with `node tools/ladder.mjs` (12 core towers, Standard, bot skill 0.7, 20 seeds, each
difficulty at the permanent tower level a player has when it unlocks). Full rows in
`docs/balance-ladder.json`.

| Difficulty (gate level) | Riftline | Frostmere | 6 more maps (Glacier Gate, Mirrormire, Russet Spiral, 3 generated) |
|---|---|---|---|
| Easy (L1) | 80% | 100% | |
| Normal (L1) | 60% | 70% | all 60 maps calibrated to 50-80% (docs/balance-sweep.json) |
| Medium (L3) | 65% | 100% | 0% (Russet Spiral) to 100%, mean 57% |
| Hard (L6) | 65% | 70% | 5% (Russet Spiral) to 100%, mean 63% |
| Extreme (L12) | 75% | 100% | 10% to 100%, mean 72% |
| Impossible (L15) at 7.6x | 100% | 100% | 30% to 100%, mean 87%: too easy, hence the change |
| Impossible (L15) at 11x | 20% | 95% | Mirrormire 100%, dunes_2 95%, Glacier Gate 50%, toxic_6 0%: mean of the six 60% |
| **With per-map factors** (all L as above) | Easy 80, Normal 60, Medium 65, Hard 65, Extra Hard 50, Extreme 75, Impossible 65 | Easy 100, Normal 70, Medium 65, Hard 70, Extra Hard 60, Extreme 65, Impossible 65 | 331 of 340 cells 50-75% (12 seeds); a 20-seed sample of 12 cells 45-85%, mean 64% |

**Per-map difficulty factors (2026-11-14).** Maps are calibrated at Normal, and above Normal the same
multiplier landed very differently per map (0% on one, 100% on another). `data/difficultyHp.json` now
holds one enemy-health factor per map and difficulty (Medium to Impossible, 68 maps, 340 cells,
0.63x to 1.59x), measured by `node tools/ladder-calibrate.mjs` (12 seeds per measurement, up to 3
steps, then `--refine` bisects cells that bracket the target; every step is in
docs/balance-difficulty.json). Result: 331 of 340 cells in 50-75%; means 63-67% per difficulty. The
9 left are cliffs where no in-band factor was found (gen_ember_1 Extra Hard 42%, gen_verdant_3
Extra Hard 83%, gen_toxic_3 Extreme 8% / Impossible 25%, gen_verdant_5 Extreme 92%, gen_dunes_6
Medium 83%, gen_ember_9 Extreme 92%, Dune Ladder Medium 33% / Hard 42%).
Checked with 20 seeds on cells that were walls or giveaways before: Russet Spiral Medium 65% (was 0%),
Hard 85%, Impossible 65%; gen_toxic_6 Medium 55%, Hard 65%, Impossible 45% (was 0%); Frostmere 60-70%
on every step (was 100% from Medium up); Glacier Gate 50-75%.
Win rate is steep at the top: Impossible's global factor went 82% (9.5x) → 71% (10.5x) → 60% (11x) →
30% (12x) on six maps before the per-map factors.

**Re-run after changing towers, enemies or waves:** `node tools/ladder-calibrate.mjs --force` (about
2 hours with `--jobs 11` on a 16-thread CPU), then `--refine`. New maps only: run it without
`--force` (cells already in the file are skipped).

## Daily Challenge (data/modes.json, mode "daily")

Fixed for everyone on a date: Easy difficulty, seeded modifiers and a loaner loadout.

| Knob | Where | Effect |
|---|---|---|
| `loanerLevel` | daily mode | permanent level of every loaner tower (4). One level is a big step: 3 gave 57%, 5 gave 98% |
| `dailyBudget` | daily mode | difficulty points of modifiers per day (3) |
| `tune` | daily mode | extra multipliers, like tuning.json (`enemyHp` 1.08: the fine knob) |
| `dailyCost` | each modifier | points it costs (1 light, 3 heavy: Tough, No support) |
| `inDaily: false` | a modifier | keeps it out of the daily (Giant bosses: 0% on its own) |

Measured with `npm run balance -- --daily 10 --seeds 6` (add `--from 2027-01-10` for other dates,
`--loaner` / `--budget` to try values without editing data): 39/60 = 65% on 2026-11-05..14,
45/60 = 75% on 2027-01-10..19. Days with Swift Blight are the hardest (1-3/6 wins).

## Per map and per mode economy

Each wave set has its own `startCash`, `bonusBase`, `bonusPerWave` (data/waves/*.json). Measured
with the 12 non-legendary towers, Standard, Normal, bot skill 0.7:

| Wave set | startCash / bonus | Bot win rate |
|---|---|---|
| Riftline campaign | 650 / 100 + 20 per wave | 7/12 this milestone (27/40 = 68% earlier) |
| Frostmere campaign (two roads) | 800 / 130 + 26 per wave | 13/20 (65%); starters on Easy 11/12; lazy 0/8 |
| Boss Rush (both bosses rotate) | 2000 / 300 + 90 per wave | 8/12 (67%) without legendaries; about 100% with a Titan Railgun (it is the anti-boss legendary) |

Boss Rush has a sharp edge around 1950-2000 starting cash: the Titan Railgun costs 2000, so a
player who owns it can open with it. Tune Boss Rush with `bonusPerWave`, not `startCash`.

## Modes (bot, Riftline Normal, 12 core towers, 20 seeds, 2026-11-14)

Boss Rush 45%, Time Attack 45%, Challenge 60%, Mutation 55%, War Chest 75%, Last Stand (tower level 5)
85%, Endless: the bot falls on wave 20 on average. Skirmish won 100% with no pressure, so it got
`tune: { enemyHp: 1.8, startCash: 0.85 }`: still 95-100% on five maps but the keep ends at 21-70 of
its health instead of untouched (2.6x made gen_toxic_6 0%: too map-dependent for a short casual mode).

## Economy and exploit check (2026-11-14)

- Selling refunds 70% of what was spent (100% with the Full refund assist), never more: no buy / sell loop.
- Rewards are granted once per match id, daily challenge once per date, quests once per claim id.
- Sandbox pays nothing; assisted runs pay crowns and XP but never unlock difficulties or records.
- Fixed: the Skip wave assist could skip every wave to a paid win (BUGS 65).
- Commands with NaN / Infinity positions are refused (BUGS 66, 67; fuzz test).

## New-player pacing (2026-11-14, `node tools/pacing.mjs`)

A player winning 70% of matches (Easy for 5, then Normal): first win in match 1; enough crowns for a
first evolution (one tower to level 5, 460 crowns) after match 1; a free summon from the start (100
sigils, cost 100); a rare tower from the shop after 8 matches; 10 maps open after 5. Every difficulty
is selectable from the start (no dead end). The tail was long: with `xpPerLevel` 80 the last map
(level 42) took about 266 matches. Now 45: level 10 after 10 matches, 20 after 35, 30 after 76, all
68 maps after about 156.
