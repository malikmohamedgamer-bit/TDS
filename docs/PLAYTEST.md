# Playtest checklist

Play at https://malikmohamedgamer-bit.github.io/TDS/ (or `npm run dev` and http://localhost:5173).
Sound on. This list is ordered by what most needs a human: things no test or bot can judge.

## Real counts (version 0.13.0, 2026-11-14)

68 maps on 14 themes (13 hand-made, 6 with air routes), 105 towers (87 distinct mechanics), 200
enemies (168 distinct), 100 bosses (83 distinct), 10 heroes with 39 skills, 11 modes + online co-op,
9 modifiers, 117 quests, 109 achievements, 39 cosmetics in 6 kinds, 3 summon banners.

## 1. Try first (newest)

1. **New towers**: Strike Jet and Storm Drake (air), Claymore Nest and Frost Glyph Ward (traps),
   Fireteam Post (rifle teams). Do they feel worth their price?
2. **Air routes**: Frostbite Hairpin (level 16) and Dune Ladder (26) are hand-made; Willow Hollow,
   Winter Gate, Ashen Flats and Null Rift are generated. Fliers skip the road and follow the glowing
   chevrons straight to the keep. Is the line easy to see? Does it change how you build?
   Open early with `?map=frostbite_hairpin`.
2. **New flagships**: Ashfall Gauntlet (20: two roads side by side down one corridor) and Twin
   Bridges (34: two roads cross twice).
3. **Higher difficulties**: every map now has its own enemy-health factor for Medium to Impossible,
   so no map should be a wall or a walkover. Try one map on Hard and on Extreme. Impossible got much
   harder (11x instead of 7.6x).
4. **Battle sounds**: hits sound different per damage type (fire crackles, ice clinks, shields
   ring), enemies die differently (armour clanks, fliers fall, ghosts fade). Music dips under boss
   roars and the victory fanfare. Too busy? Settings > Sound > Reduced sound thins them out.
5. **Tower skins and keep standards** (Index tab, top): Desert Camo, Arctic, Obsidian, Verdant,
   Gilded, Crimson; banners beside the keep gate. Locked ones say how to earn them.
6. **Index**: bosses have their own section; each section shows the next collection reward.
7. **Co-op** (Online tab): needs the Supabase setup (docs/DEPLOY-ONLINE.md) or two tabs of one
   browser for a local test.
8. **Phones**: portrait and landscape, install it (Add to Home screen) and play once offline.

## 2. Things only a person can judge

- Music: every theme has its own style, plus final-boss, victory and defeat pieces. Nobody has
  listened to them yet. Too loud, too repetitive?
- Readability in big fights: can you tell enemy types and statuses apart?
- New-player path: start a fresh save (Help, export your save first, or use a private window).
  Is the tutorial clear? Is Easy winnable, and does the first-run hint make sense?
- Real-GPU frame rate on your PC and phone: turn on Settings, Show frame time.

## 3. Balance (bot, skill 0.7, core 12 towers, Standard Normal, 20 seeds)

All 68 maps between 50 and 80% at Normal (mean 66%, 44 in 60-70%). Above Normal: 331 of 340 map and
difficulty pairs at 50-75%. Heroes 57-77% (Brik tuned from 83%). Modes: Challenge 60%, Mutation 55%,
War Chest 75%, Boss Rush and Time Attack 45% (a little hard), Last Stand needs tower level 5+ (85%),
Skirmish rarely lost but costs keep health.
Details: docs/PROGRESS.md and docs/balance-sweep.json. The bot is not a person: tell me if a map
feels unfair.

## 4. Known weak spots (honest)

- Generated units are colour and part variants of shared models; many look alike at a distance.
- Code-built towers and enemies animate with simple code poses, not authored animations.
- No water or rivers on any map; no level-of-detail models.
- Real-GPU frame time, battery and heat on phones have never been measured.
- Save codes catch accidents, not cheating (the game is single-player and offline-first).
- Co-op has been tested on one computer (two tabs, same-browser and the real relay), not yet between
  two machines over Supabase.
