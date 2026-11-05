# Playtest checklist

Play at https://malikmohamedgamer-bit.github.io/TDS/ (or `npm run dev`).

1. Start with the Tutorial ticked; check that each step advances when you do the action.
2. Win Easy with the 5 starter towers. Expect Normal to be hard until towers are levelled (permanent level 3-5) or unlocked.
3. Hub: claim the Daily reward, spin the Summon slot machine (try Skip), buy a tower in the Shop, level a tower in Towers, look at the Index silhouettes, claim a Quest.
4. Settings > Difficulty tuning: switch Standard / Original / Relaxed; Settings > Assist: try Skip this wave.
5. Modes (Play tab; some unlock at player level 2-4): Endless, Boss Rush, Daily Challenge, Time Attack, Challenge modifiers, Sandbox. Modes are new and less tested than the campaign.
6. On a phone: hotbar, joystick, tap to build, abilities.

## Real counts
1 map, 11 towers, 11 enemies + 1 boss, 7 modes, 9 modifiers, 3 tuning presets, 8 difficulties.

## Tuning presets
`data/tuning.json` line `"preset"`, or Settings > Difficulty tuning. Standard: bot wins 68% on Normal; Original 83%; Relaxed 100%. See docs/TUNING.md.

## Weak spots
Only one map; code-built units are simpler than the Blender ones; no music yet; Daily Challenge wins only about 13/20 bot runs; modes were added just before the usage limit.

## Feedback I most want
1. Is Standard Normal fun-hard or frustrating?
2. Does the slot-machine summon feel exciting, and is progression pacing right?
3. Camera and controls on your phone.
