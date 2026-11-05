# Bugs

Status is **Fixed** only after a test proves it.

| # | Bug | Found by | Status | Proof |
|---|---|---|---|---|
| 1 | Velocity kept full speed while pushing into a wall (hero "moonwalked", speed reported 7 m/s while stationary) | e2e collision test | Fixed | unit test "velocity drops to zero when pushing straight into a wall" |
| 2 | Colliders on slopes took their bottom height from the terrain at their centre; the keep (on the rim) started 2.3 m up and the hero walked underneath and popped onto its roof | e2e collision test + Node repro | Fixed | unit test "every solid collider reaches below the terrain under its whole footprint"; e2e "never walks through solid props" |
| 3 | Keep collider narrower than the model (flanking towers stuck out) | e2e | Fixed | compound collider in data/props.json; e2e "never walks through solid props" |
| 4 | Keep and portal floated over sloped rim ground | screenshots | Fixed | terrain `flats` levels ground under landmarks; screenshot docs/screenshots/m1/keep.png |
| 5 | Step-height rocks flipped between "floor" and "wall" inside one substep, triggering safety-net rescues | soak bot (3 rescues / 20 min) | Fixed | soak: 30 simulated min, 0 rescues, 0 failures; unit soak test asserts 0 rescues |
| 6 | Draw-call stat showed 1 (renderer info reset per post-processing pass) | e2e load test | Fixed | e2e load test asserts > 10 calls |
| 7 | Touch controls hidden from the accessibility tree (aria-hidden on container) | e2e phone test | Fixed | e2e phone test finds buttons by role |
| 8 | Mid-campaign boss leak (1000) ended any run that missed it, so Hard and above always died at wave 11 | balance bot timeline | Fixed | wave groups can override leak (wave 10 boss: 60); bot ladder now reaches wave 20 on every difficulty |
| 9 | Upgrades were worse value than new towers (bot, and players, would never upgrade) | balance bot (0 upgrades) | Fixed | prices retuned; bot now buys 34+ upgrades per Normal run |
| 10 | Long-range Marksman about 2x more cost-efficient than any other tower | efficiency measurement (damage x road coverage / cost) | Fixed | rebalanced; all damage towers within 94-133 per 100 cash |
| 11 | spawnEnemy accepted a NaN path distance (silent bad state) | unit test investigation | Fixed | now throws; covered by sim tests |
| 12 | Gloomwing GLB exported empty: its collection was hidden during review, hidden objects cannot be selected | glb-info after export | Fixed | export_glb unhides and refuses partial selections; unit test checks every GLB parses with its clips |
| 13 | Rebuilding an asset while its collection was hidden produced zero-scale parts (world matrices not evaluated) | viewer contact sheet (model invisible) | Fixed | collection() always unhides; export refuses zero scale; unit test rejects zero-scale nodes |
| 14 | Imported emissive parts bloomed far too strongly (emission strength 6) | viewer contact sheet | Fixed | glow clamped to the procedural props' HDR level (max 2.6) |
| 15 | The game loop stopped for good when the match was exposed before its models finished loading (one exception killed requestAnimationFrame) | e2e (simulation never advanced) + page error capture | Fixed | match exposed only when ready; frame loop schedules first and survives errors; e2e match tests |
| 16 | Clicks on the 3D view never reached it: the full-screen damage-number layer captured them (CSS specificity) | e2e placement by mouse click | Fixed | e2e "place towers by clicking from three camera angles" |
| 17 | Boss bar intercepted clicks aimed at the ground behind it | e2e ability aiming | Fixed | boss bar is click-through; e2e boss/ability test |
| 18 | Default loadout had only 2 towers on a new save | screenshot review | Fixed | defaults to 6 towers |
| 19 | Phone HUD: brand badge and camera buttons overlapped the status bar | phone screenshot | Fixed | in-match phone layout rules (match.css) |
| 20 | Assist "Skip this wave" button showed for every player (`.btn` display overrode the `hidden` attribute; no global `[hidden]` rule) | milestone 6 screenshot review | Fixed | global `[hidden] { display: none !important }`; screenshot docs/screenshots/m6/04-tutorial-pick.png; e2e assists test still finds it when Assist is on |
| 21 | Daily Challenge fairness swung 0-100% between dates (loadouts without a long-range boss killer, Giant bosses on the final boss) | `npm run balance -- --daily 10` + modifier x loadout grid | Fixed | role slots + modifier budget; no date below 1/6, 65% overall; unit "daily challenge: modifier budget, role slots ..." |
| 22 | Leaving the Daily Challenge for another mode shrank the loadout to the owned loaners (3 towers) | milestone 6 screenshot review | Fixed | falls back to the saved loadout or the starters |
| 23 | Daily loaner cards showed the save's level (Lv 1) instead of the loaner level | in-app check | Fixed | screenshot docs/screenshots/m6/02-daily.png |
| 24 | Bot valued every tower on a two-road map at half its coverage but traps at full value, so it spammed Mine Layers and skipped anti-air (0/12 wins) | balance run on Frostmere + tower list | Fixed | coverage normalised per road (Riftline unchanged); Frostmere Normal 13/20 |
| 25 | Thornmother's Frenzy summoned Menders next to her (about 6% max HP healed per second when low): unkillable final boss | boss HP trace | Fixed | Frenzy summons Husks; unit "Thornmother phases ... no healers summoned" |
| 26 | Sandbox hotbar showed "need $1200" for towers although cash is infinite | milestone 7 screenshot | Fixed | infinite cash shows ∞ and no "need"; screenshot docs/screenshots/m7/04-legendaries.png |
| 27 | Docs said 11 towers; there were 12 (7 war, 5 magic) | content count check | Fixed | counts in PROGRESS / PLAYTEST from data |
| 28 | Frostmere: the hero could wedge into slots narrower than itself between scattered props, or between a prop and the map boundary (4 "inside a solid" rescues in 30-60 simulated min) | 30 min soak | Fixed | `scatterGap` (props and boundary); soak 120 simulated min on both maps: 0 rescues, 0 failures |
| 29 | Music arpeggio on phrase-lift bars reached MIDI 103 (about 3 kHz, shrill) | unit music test | Fixed | arpeggio one octave lower; unit "patterns are ... in key" checks MIDI 24-100 |
| 30 | e2e "place towers by clicking from three camera angles" timed out once while two screenshot jobs ran beside the suite | M7 full run | Watch (flaky under heavy CPU load) | passed 2/2 in isolation; not reproduced without the parallel load |
| 31 | `tools/screenshots.mjs` world shots showed the hub over the scene (since milestone 5) | M8 review | Fixed | `nolobby`; docs/screenshots/m8 |
