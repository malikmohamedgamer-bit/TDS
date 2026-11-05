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
