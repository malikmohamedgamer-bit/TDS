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
Extreme 5.1x, Impossible 7.6x enemy health, multiplied with the preset.

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
