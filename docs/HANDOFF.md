# Handoff: how to continue TDS (written 2026-11-12 for the next model, Opus 5.5)

The owner (Malik) works away from the laptop and checks in by remote control. He wants the game taken
to a launch-ready product with **maximum quality and minimum wasted usage**. This file is the working
method that got the project from 59% to 91% of the scoreboard in one session. Follow it as written.

## Paste this to start a session

> Continue the TDS website game in C:\Users\Malik\Downloads\TDS. Read docs/HANDOFF.md first and work
> exactly the way it describes, then docs/PROGRESS.md ("Next exact action") and docs/ROADMAP.md.
> Work autonomously until the next roadmap chunk is finished, tested, documented, committed and pushed.

## Start of every session (about 5 tool calls, no more)

1. Read `docs/PROGRESS.md` (status, counts, **Next exact action**), then `docs/ROADMAP.md`. Read
   `docs/COMPLETION.md` and `BUGS.md` only for the area you are about to touch.
2. `git status --short` and `git log --oneline -5`. If there are uncommitted changes, work out what the
   last session was in the middle of (the diff tells you) and finish that first.
3. `npm test` and `npm run lint` before changing anything. If something already fails, fix it first.
4. Do not look for notes in the Obsidian vaults: they have nothing on TDS. Everything is in this repo.
5. Do not ask the owner questions unless something is truly blocked. Pick the sensible default, say
   which one you picked, and keep going. No email tool exists in these sessions: say so, do not pretend.

## The working loop (one batch = one commit)

1. **Inspect only what the change touches.** Use `grep -n` for the function or key and `sed -n a,bp`
   for the lines around it. Never read a whole large file (`src/sim/match.js` is 1200 lines) and never
   re-read a file you already have in context.
2. **Reuse before writing.** The game is data-driven: most features are a JSON entry plus a small rule
   in the sim. Check `data/*.json` `$doc` strings; they document every field.
3. **Make the change small and complete.** Sim rule + data + UI + unit test + docs in the same batch.
4. **Test what you changed:** the one test file first (`node --test test/unit/<file>.test.js`), then
   `npm test` and `npm run lint`. UI changes: check them in the app browser on the dev server
   (`preview_start` with name `tds-dev`), read the console for errors, take one screenshot.
5. **Commit and push** to `feature/vertical-slice` with a message that says what changed and the
   measured numbers. Confirm the Pages deploy is green with `gh run list --limit 1`.
6. **Update docs in the same session:** `CHANGELOG.md`, `docs/PROGRESS.md` (counts and Next exact
   action), `docs/ROADMAP.md` (tick boxes, add a log row), `docs/COMPLETION.md` (score), `BUGS.md`
   (every accepted compromise gets a row with the numbers), `VERIFICATION.md` (what was and was not
   checked).

## Rules that keep quality up and usage down

- **Zero subagents by default.** Do everything in the main session. One subagent at most, only for a
  genuinely independent large search. Never start parallel sessions for parts of one change.
- **Let the CPU work while you work.** Long jobs (balance bot, map calibration, e2e) run in the
  background (`run_in_background`), and you carry on with something that does not touch the same
  files. Do not poll; you are told when a job ends.
- **Do not edit `src/`, `data/` or `styles/` while the e2e suite is running**: it drives the live dev
  server, so your edits change what it is testing. Docs and `tools/` are safe.
- **Do not start heavy bot runs during e2e**: headless WebGL is slow and CPU contention causes
  timeouts that look like bugs.
- **Never edit generated files by hand.** `data/maps/gen_*`, `data/waves/gen_*`,
  `data/quests/generated_b1.json`, `data/towers/mechanics_b1.json`, `data/enemies/mechanics_b1.json`,
  `data/bosses/mechanics_b*.json` come from `tools/gen-*.mjs`. Change the generator or its input
  (`tools/map-batches.json`, `tools/map-themes.json`) and re-run it.
- **`src/core/` and `src/sim/` stay pure** (no DOM, no Three.js, seeded `Rng`, fixed timestep). New
  browser code goes in `src/ui/`, `src/engine/`, `src/game/`, or a small module such as `src/pwa.js`.
- **Tests must read numbers from data**, never hard-code a balance value (two tests broke that way).
- **At most 3 tuning attempts per problem.** Then keep the best measured value, write it in `BUGS.md`
  as "Accepted" with every measurement, and move on.
- **Never state an unmeasured number.** If a value was not measured, either measure it or say so.
- **Honest reporting.** Say what failed, what was skipped and what was not verified. A flaky test is
  recorded as flaky with its failure rate, then fixed.
- **Shell:** the Bash tool is Git Bash on Windows. A `<<'EOF'` heredoc that contains an odd number of
  apostrophes fails to parse: for any multi-line patch script, write it to the scratchpad with the Write
  tool and run it with `python <file>`. Apply edits with exact-string `assert a in s` then `replace`, so
  a wrong guess fails loudly instead of silently doing nothing.
- **Meshy:** show the dry-run cost and ask before spending credits. No pull requests, no GitHub settings
  changes, no history rewrites, unless the owner asks.

## Balance method (this is where most mistakes happen)

- The baseline is always: **12 core towers, Standard preset, Normal difficulty, bot skill 0.7.** The
  default loadout of `tools/balance.mjs` is all 100 towers, which wins almost everything: always pass
  `--loadout rifleman,marksman,gunner,rocket_battery,gunship,supply_depot,mine_layer,ember_adept,frost_weaver,storm_caller,rune_totem,spirit_summoner`.
- Target 60-70% wins; 50-80% is acceptable per map.
- **Seeds:** 12 seeds is only a rough check (one win = 8 points, and the same change can move a result
  two wins either way). Use **20 for maps, 30 for heroes** before believing a difference.
- **Maps:** `node tools/gen-maps.mjs --calibrate` (only maps without a `calibration` note). When it
  ends outside the band, set `hpMul` by hand in `tools/map-batches.json`, run `node tools/gen-maps.mjs`,
  measure with `node tools/balance.mjs --map <id> --seeds 20 --loadout <core 12>`, and append the
  result to the map's `calibration` string. Win rate is steep: about 25 points per 10% enemy health.
- **Everything at once:** `node tools/sweep.mjs --seeds 20` writes `docs/balance-sweep.json`.
- **Modes:** `node tools/balance.mjs --map riftline --mode <id> --seeds 12 --loadout <core 12>`.
- **Heroes:** `--hero all --seeds 30`. The bot plays Commander Vale unless told otherwise.
- A re-skin theme (`parent` in `tools/map-themes.json`) must not change balance: build the map with the
  parent theme and with the new one and diff waves and layout. They must be identical.

## Where things are

| Thing | Place |
|---|---|
| Match rules | `src/sim/match.js` (modes and modifiers fold into `this.tune` / `this.rules` in the constructor) |
| Modes, modifiers | `data/modes.json` (`maxWaves`, `keepHpFixed`, `mutations`, `tune`, `rewardMul`) |
| Map generator | `src/core/mapGen.js`, `tools/gen-maps.mjs`, `tools/map-batches.json`, `tools/map-themes.json` |
| Theme looks | `data/themes.json` (sky, particles, grade, ground detail), music styles in `data/music.json` |
| Meta (XP, summon, shop, quests) | `src/meta/meta.js`, `data/meta.json`, `tools/gen-quests.mjs` |
| Cosmetics | `data/cosmetics.json`, `src/meta/cosmetics.js`, `src/ui/applyCosmetics.js` |
| Hub screens | `src/ui/hub.js` (one `_tabname()` method per tab, clicks in `onClick`) |
| Match HUD, pause, end screen | `src/ui/matchHud.js`; flow in `src/game/matchController.js` |
| Help text | `data/help.json` (keep it true: check key bindings and features before writing) |
| Saves | `src/save/save.js` (`sanitize` must repair every new field; add it to the fuzz test) |
| Offline / install | `sw.js` (stamped by `tools/build-site.mjs`), `src/pwa.js`, `manifest.webmanifest` |
| Test hooks in the page | `window.TDS` (`save`, `match`, `ctrl`, `debug.fastForward`, `debug.setCash`, ...) |
| Balance of every map | `node tools/sweep.mjs --seeds 20` -> docs/balance-sweep.json |
| Performance per quality preset | `node tools/perf-report.mjs` -> docs/perf.json (software WebGL: compare presets, not fps) |
| Memory leaks | `node tools/leak-check.mjs --cycles 5`: geometries must stay flat after the first match |
| itch.io upload | `node tools/package-itch.mjs` -> dist/tds-<version>-web.zip |
| Co-op multiplayer | docs/multiplayer.md (design + as built), src/net/, `MatchController.startOnline`, src/ui/onlineLobby.js; check with `npx playwright test coop.spec.js` and `node tools/dev/coop-check.mjs` (two tabs, ~10 min) |
| Co-op balance | `node tools/balance.mjs --coop 2|3|4 --map <ids> --seeds 20` (`--coophp`, `--coopcash` to try numbers) |

## Adding common things

- **A mode:** entry in `data/modes.json`; a new rule only if no existing flag does it; unit test in
  `test/unit/modes.test.js`; measure it; a line in `data/help.json`. A liberation / mode quest appears
  by re-running `node tools/gen-quests.mjs`.
- **Maps:** entries in `tools/map-batches.json`, `node tools/gen-maps.mjs`, calibrate, then
  `node tools/gen-quests.mjs`. Templates: serpentine (1 road), fork (2), trident (3), diamond (2 lanes
  from one portal), crossover (1 road that crosses itself once). `feature: <n>` puts kit enemies and kit
  bosses in the waves; **a new batch of featured maps must use a NEW cohort number** (the next one is
  3), otherwise the enemies of already balanced maps change. After `gen-maps.mjs`, check with
  `git status --short data/maps data/waves` that no existing map changed unless you meant it to.
- **A save field:** default in `newSave`, repair in `sanitize`, and the fuzz test must still pass.
- **Anything that changes the simulation** must keep co-op deterministic: no Math.random / Date.now
  in src/sim, no sim writes from the view / HUD / controller (only commands through the session),
  and `Match.snapshot()` must capture any new state (the snapshot tests compare hashes every tick).
- **Anything a match creates on the GPU** (meshes, geometry, materials) must be freed in
  `MatchView.dispose` / `Effects.dispose`; run `tools/leak-check.mjs` after touching src/engine.
- **A hub screen or section:** a `_name()` method returning markup, a `data-*` attribute handled in
  `onClick`, styles in `styles/hub.css` using the tokens in `styles/tokens.css`, touch targets 44 px.

## Independent review

For risky changes (sim rules, generators, saves), an independent read-only review before committing
pays off: on 2026-11-12 a 4-agent review (3 reviewers with different angles, 1 skeptic who tries to
disprove each finding) found 6 real bugs in a change that passed every unit test, including one that
silently changed the balance of 30 maps. Only do this when the owner has opted into multi-agent work
(ultracode) or for high-risk systems; otherwise review the diff yourself against the same three angles:
geometry / logic, runtime consumers of the changed data, and whether the tests can pass while broken.

## Finishing a session

Leave the tree clean and pushed, the deploy green, `.run-lock` deleted, and `docs/PROGRESS.md` "Next
exact action" pointing at the very next step. End with: the percentage, what changed, the measured
numbers, what is weak, and what was not verified.
