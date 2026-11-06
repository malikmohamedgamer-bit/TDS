# Playtest checklist

Play at https://malikmohamedgamer-bit.github.io/TDS/ (or `npm run dev`). Sound on.

## Try first (UI / graphics update, 2026-11-06)
1. **New lobby**: tabs on the left (bottom bar on phones), a Mission card on the right with the map
   preview, hero, mode, difficulty, your six towers and the Start button. Arrow keys move between tabs.
2. **Map picker**: search box, theme filters (Verdant, Frost, Toxic Mire, Ember, Dunes, Starfall), maps
   grouped by theme with a drawn preview of their roads, locked maps show the level they need.
3. **Themes look different now**: snow and aurora on Frost, glowing lava cracks and embers on Ember,
   glowing ooze and spores on Toxic Mire, sand ripples and dust on Dunes, runes on the road and a night
   sky on Starfall Sanctum, dusk on Mirrormire. Each theme has its own colour grade and sky.
4. **Fights feel heavier**: hit sparks per element, explosions per element, status effects you can see
   (burning, slowed, stunned, marked, shielded), a letterbox when a boss arrives, slow motion when a boss
   dies, a burst at the keep when you win or lose, reward counters that count up.
5. **40 new bosses** with new tricks. Boss Rush draws from all of them. Read the warnings on screen:
   some bosses hide, some ignore a damage type for a while, some steal cash or open portals on other roads.
6. **Settings**: graphics Low / Medium / High / Ultra, resolution scale, interface size, colour grading
   and weather toggles (Low keeps phones fast).

## Older checks
Seven heroes (four skills each, key V for the fourth), tutorial, campaign, hub tabs (Daily, Summon, Shop,
Towers, Index, Quests), modes, tuning presets and Assist, phone controls. Locked maps open with `?map=<id>`.

## Real counts (tools/count-content.mjs, 2026-11-06)
17 maps on 6 themes, 37 towers (23 distinct mechanics, 28 models), 42 enemies (19 distinct, 33 models), 95 achievements (tiers of 17 conditions), 29 quests,
59 bosses (42 distinct mechanic sets, 14 models), 7 heroes with 27 skills, 7 modes, 9 modifiers.

## Balance (bot, skill 0.7, Standard Normal)
Core towers: Riftline 58-68%, Frostmere 50-65%, the 15 newer maps 50-75% (12 seeds each, noisy),
Daily Challenge 62%, Boss Rush: see BUGS.md #46. New hero kits are too strong (BUGS.md #44, open).

## Biggest weak spots (honest)
- The 40 new bosses reuse the 14 existing boss models (recoloured); a boss's look does not tell you its
  tricks yet, only the warnings and effects do.
- Toxic ooze glow is speckly up close; Ember lava cracks also run over cliff walls.
- Water is still not a thing on any map (no river or lake geometry); "liquid" is only the ooze and lava.
- Towers now stand on a faction decal (War hazard pad, Magic rune circle) with a rarity ring (Rare and up,
  Legendary pulses), but the tower and enemy models themselves did not get new materials (wear, camo, runes).
- No outline / toon edge post effect yet; no LOD.
- The new lobby, effects and themes were checked in headless software rendering and a desktop browser
  pane, not on a real phone.

## Feedback I most want
1. Does the new lobby feel like a game menu (not a web page), and is the Start button obvious?
2. Which theme looks best and which looks wrong?
3. Are any of the new boss tricks unfair or unclear (cloak, immunity, cash drain, portals, revive)?
