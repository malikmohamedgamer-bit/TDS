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
