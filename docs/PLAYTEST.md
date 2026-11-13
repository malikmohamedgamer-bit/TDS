# Playtest checklist

Play at https://malikmohamedgamer-bit.github.io/TDS/ (or `npm run dev` and http://localhost:5173).
Sound on. This list is ordered by what most needs a human: things no test or bot can judge.

## Real counts (tools/count-content.mjs, 2026-11-12)

60 maps on 14 themes (9 hand-made), 100 towers (85 distinct mechanics), 200 enemies (168 distinct),
100 bosses (83 distinct, 16 phase mechanics), 10 heroes with 39 skills, 11 modes, 9 modifiers,
109 quests (daily, weekly, story), 109 achievements, 26 cosmetics in 4 kinds, 3 summon banners.

## 1. Try first (newest)

1. **Hand-made maps**: Russet Spiral (level 12: the road spirals in and crosses itself twice),
   Crimson Crossing (18: two roads cross mid-map), Redrock Switchbacks (24: five long rows),
   Void Convergence (30: three short roads). Use `?map=russet_spiral` etc. to open them early.
   Does each feel different to build on? Is Russet Spiral fun or just long (its enemies have 2.4x
   health because they pass your towers on several laps)?
2. **Split lanes and crossover roads** on the newest generated maps (levels 37-42).
3. **Weekly quests** (Quests tab) and the **Help** tab (search, save backup, credits / privacy / terms).
4. **Cosmetics** (Index tab, top): interface themes, hero outfits, projectile effects, tower base
   plates. All are earned by playing; locked ones say how.
5. **Pause screen battle report**: which tower did the work.
6. **Phones**: portrait and landscape. The status bar, boss bar and tower buttons were fixed for
   390 px wide screens; please check a real phone. Try installing it (browser menu, Add to Home
   screen) and playing once offline.
7. **Slow devices**: weak devices now start on Low, and the game lowers quality by itself if it runs
   below 24 fps for 5 seconds (a message says so). Pick a quality in Settings to turn that off.

## 2. Things only a person can judge

- Music: every theme has its own style, plus final-boss, victory and defeat pieces. Nobody has
  listened to them yet. Too loud, too repetitive?
- Readability in big fights: can you tell enemy types and statuses apart?
- New-player path: start a fresh save (Help, export your save first, or use a private window).
  Is the tutorial clear? Is Easy winnable, and does the first-run hint make sense?
- Real-GPU frame rate on your PC and phone: turn on Settings, Show frame time.

## 3. Balance (bot, skill 0.7, core 12 towers, Standard Normal, 20 seeds)

All 60 maps between 50 and 80% (mean 66%). Heroes 57-83% (Kade and Brik a little strong).
Modes: Mutation 58%, War Chest 83% (easy), Last Stand needs tower level 5+ (83%).
Details: docs/PROGRESS.md and docs/balance-sweep.json. The bot is not a person: tell me if a map
feels unfair.

## 4. Known weak spots (honest)

- Generated units are colour and part variants of shared models; many look alike at a distance.
- Code-built towers and enemies animate with simple code poses, not authored animations.
- No water or rivers on any map; no level-of-detail models.
- Real-GPU frame time, battery and heat on phones have never been measured.
- Save codes catch accidents, not cheating (the game is single-player and offline-first).
