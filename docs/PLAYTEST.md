# Playtest checklist

Play at https://malikmohamedgamer-bit.github.io/TDS/ (or `npm run dev`). Turn the sound on:
there is music now.

1. **Tutorial**: start with Tutorial ticked. Each step should advance when you do the action, and
   the control it talks about should glow (tower bar, Start wave, Upgrade, ability). On a phone the
   wording should talk about tapping and the joystick.
2. **Campaign**: win Easy with the 5 starter towers. Normal is meant to be hard until towers are
   levelled or unlocked. Medium is meant to be winnable around permanent tower level 3, Hard
   around level 6.
3. **Hub**: claim the Daily reward, spin the Summon slot machine (try Skip), buy a tower in the
   Shop, level a tower in Towers, look at the Index, claim a Quest. Legendary towers (Titan Railgun,
   Starfall Oracle) can now drop from summons (rare) or be bought (expensive).
4. **Second map**: at player level 3, pick Frostmere Crossing in Play > Map. The game reloads on the
   new map. Two portals, two roads that merge before the keep, a new final boss (Thornmother).
5. **Modes** (Play tab; some unlock at levels 2-4): Endless, Boss Rush (both bosses), Daily
   Challenge (Riftline only, fixed Easy, loaner towers at level 4, modifiers listed on the card),
   Time Attack, Challenge modifiers, Sandbox (∞ cash).
6. **Music**: it should change between the hub, the build phase, waves and boss waves, and differ
   between the two maps. Settings > Audio > Music volume.
7. **Settings**: Difficulty tuning (Standard / Original / Relaxed) and Assist (Skip this wave).
8. **Phone**: hotbar, joystick, tap to build, abilities.

## Real counts (from data/)
2 maps, 14 towers (12 regular incl. 5 starters, 2 legendary), 11 enemies + 2 bosses,
7 modes, 9 modifiers, 8 difficulties, 3 tuning presets, 4 music moods.

## Balance (bot, skill 0.7, Standard)
Normal 58-68%, Daily Challenge 65% (75% on other dates), Frostmere Normal 65%, Boss Rush 67%
without legendaries, Medium L3 67%, Hard L6 58%. Details: docs/TUNING.md.

## Weak spots (honest)
- The music has only been checked by automated tests, not by a human ear. Is it pleasant? Too loud?
- Frostmere reuses Riftline's props with a colder palette; there are no snow-specific props.
- New towers and the new boss are code-built models, simpler than the Blender ones.
- Owning a Titan Railgun makes Boss Rush very easy.
- Frame times were only measured with software rendering; please tell me your real fps
  (Settings > Show frame time).

## Feedback I most want
1. Does the music fit, and does it get repetitive?
2. Is Frostmere's two-road layout fun, or just harder?
3. Do the legendary towers feel special enough for how rare they are?
4. Standard Normal: fun-hard or frustrating?
