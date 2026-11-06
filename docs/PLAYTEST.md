# Playtest checklist

Play at https://malikmohamedgamer-bit.github.io/TDS/ (or `npm run dev`). Sound on.

## Try first (new on 2026-11-06)
0. **Seven heroes, four skills each** (final-product run, batch 1): Play > Hero shows every hero with its
   role and skills. New: Ignis Emberheart (fire, meteors), Sergeant Kade (riflemen reinforcements, supply
   drops), Grovewarden Nyra (roots, spirit wolves, cleansing), Captain Mara Holt (marks, EMP, finishers).
   The fourth skill key is V. Progress toward the full game: docs/COMPLETION.md.
1. **New maps**: Play > Map. Glacier Gate unlocks at player level 2, Mirrormire at 4, Starfall Sanctum at 6,
   then a generated map every two levels (5 to 27). To try a locked map now, open the game with
   `?map=<id>` (for example `?map=mirrormire`). The three flagships show off the new monsters and bosses.
2. **Heroes**: Play > Hero. Warmaster Ryn (Artillery Barrage, Field Repairs, War Chest) and Archmage Seren
   (Gravity Well, Starfall, Frost Nova). Picking one reloads the game with that hero.
3. **New towers**: Lancer Mech (boss killer), Rifle Squad, and three Magic towers on new buildings:
   Starwatch Tower, Sanctum of Dawn, Spirit Barracks (Sandbox, Shop, Summon, Index).
4. **New enemies and bosses**: 13 monsters with glowing eyes (flying, armoured, stealth, healing,
   splitting, regenerating, and combinations such as flying + stealth) and 7 bosses. Boss Rush now
   draws 6 of all 19 bosses each run. `viewer.html` shows every model from all sides.

## Older checks
Tutorial, campaign on Riftline / Frostmere, hub (Daily, Summon, Shop, Towers, Index, Quests), modes,
settings (tuning presets, Assist), phone controls.

## Real counts (from data/, 2026-11-06)
17 maps (15 new: 3 hand-made, 12 generated), 37 towers (21 War, 16 Magic) on 28 distinct models,
42 enemies on 33 distinct models, 19 bosses on 14 distinct models, 3 heroes, 8 hero skills, 7 modes,
9 modifiers. 98 units on 75 distinct models; every one of the 55 imported / Blender models is used.

## Balance (bot, skill 0.7, Standard Normal)
Core towers: Riftline 58-68%, Frostmere 50-65%, the 15 new maps 50-75% (12 seeds each, noisy),
Boss Rush 67%, Daily Challenge 62%. Generated towers alone are now too strong (100%, bug 37).

## Biggest weak spots (honest)
- New maps are balanced on only 12 bot runs each; some may feel easier or harder than Normal should.
- Generated maps reuse two campaign wave tables (varied) and the existing props with new colours.
- The two new heroes reuse Commander Vale's model with new colours.
- Generated tower menu is too strong on its own after the boss-killer fix.
- Music for the new maps has not been listened to by a person.

## Feedback I most want
1. Do the new maps feel different enough from each other, and which ones are too easy or too hard?
2. Do the Quaternius monsters with glowing eyes fit next to the older models?
3. Are the new heroes and their skills fun, and is any of them clearly stronger?
