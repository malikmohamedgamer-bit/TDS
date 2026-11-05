# Credits and licences

| Asset / library | Source | Licence | Used for |
|---|---|---|---|
| Three.js 0.187.0 | https://threejs.org (npm `three`) | MIT (vendor/three/LICENSE) | Rendering, GLTF loading, post-processing |
| Props and hero models | Built in code (`src/engine/propModels.js`, `heroView.js`) | Project-owned | Props, hero |
| Gravemaw (boss), Rifleman, Ember Adept, Rocket Battery, Husk, Gloomwing, Ironshell | Built in Blender 5.2 from `tools/blender/assets.py` (`assets/blend/tds_assets.blend`) | Project-owned | Tower and enemy GLBs |
| Other towers, enemies, summons, VFX | Built in code (`src/engine/unitModels.js`, `effects.js`) | Project-owned | Units and effects |
| Sound effects | Synthesized in code (`src/audio/sfx.js`, WebAudio) | Project-owned | All sounds |
| All textures so far | Generated in code (`src/engine/textures.js`) | Project-owned | Terrain, grain |
| UI icons | SVG drawn in code (`src/ui/icons.js`) | Project-owned | HUD |

## Downloaded asset packs (CC0)

Downloaded from the official site with `node tools/fetch-kenney.mjs <slug>` into
`assets/packs/kenney-<slug>/` (git-ignored: re-download with the same command). Every zip contained
`License.txt`: **Creative Commons Zero (CC0)**, "You can use this content for personal, educational,
and commercial purposes", crediting Kenney is optional. After unzipping only GLB / GLTF / FBX / OBJ /
PNG / TXT files were kept; HTML, URL shortcuts, MTL, DAE and STL files were deleted (no executables or
scripts were present). Downloaded 2026-11-05.

| Pack | Source URL | Author | Licence | GLB models | Contents |
|---|---|---|---|---|---|
| Tower Defense Kit 2.1 | https://kenney.nl/assets/tower-defense-kit | Kenney (www.kenney.nl) | CC0 1.0 | 160 | Towers (stackable parts), ballista / cannon / catapult / turret, 4 UFO enemies, map tiles (grass and snow), details |
| Castle Kit | https://kenney.nl/assets/castle-kit | Kenney (www.kenney.nl) | CC0 1.0 | 76 | Walls, towers, gates, siege engines (ballista, catapult, trebuchet, ram, siege tower) |
| Graveyard Kit | https://kenney.nl/assets/graveyard-kit | Kenney (www.kenney.nl) | CC0 1.0 | 91 | Animated characters (zombie, skeleton, ghost, vampire, keeper; 32 clips each), graves, fences, pumpkins, crypts |
| Nature Kit | https://kenney.nl/assets/nature-kit | Kenney (www.kenney.nl) | CC0 1.0 | 329 | Trees, rocks, plants, cliffs, paths, campfire, tents |
| Fantasy Town Kit | https://kenney.nl/assets/fantasy-town-kit | Kenney (www.kenney.nl) | CC0 1.0 | 167 | Medieval houses, roofs, walls, market stalls, fountains, lanterns |
| Blaster Kit | https://kenney.nl/assets/blaster-kit | Kenney (www.kenney.nl) | CC0 1.0 | 40 | Sci-fi blasters and weapon parts |
| Space Kit | https://kenney.nl/assets/space-kit | Kenney (www.kenney.nl) | CC0 1.0 | 153 | Spacecraft, rockets, turrets, alien, astronauts, base modules (GLTF + GLB) |
| Mini Dungeon | https://kenney.nl/assets/mini-dungeon | Kenney (www.kenney.nl) | CC0 1.0 | 30 | Dungeon tiles, gate, animated (skinned) human and orc characters |
| Retro Fantasy Kit | https://kenney.nl/assets/retro-fantasy-kit | Kenney (www.kenney.nl) | CC0 1.0 | 105 | Castle walls, towers, battlements, gates |
| Car Kit | https://kenney.nl/assets/car-kit | Kenney (www.kenney.nl) | CC0 1.0 | 50 | Cars, trucks, tractors, vans, wheels |

Imported into the game so far: 23 models (`tools/import-kenney.mjs`, copied to
`assets/models/kenney/`, listed in `data/models.json` with `source`). They are recoloured at load
time to the art-style palettes (`data/palettes.json`, `src/core/palette.js`).

## Quaternius packs (CC0)

Author: Quaternius (https://quaternius.com). Downloaded 2026-11-05 from the official Google Drive
folders linked on each pack page, using Drive's "Download all" (driven by the project's Playwright;
per-file downloads with gdown hit Drive's download quota), into `assets/packs/quaternius-<pack>/`
(git-ignored; re-download from the links below). Seven zips contain `License.txt`: **CC0 1.0
Universal (Public Domain Dedication)**. Three zips (Animated Zombie, Toon Shooter Game Kit, Cute
Animated Monsters) have no licence file; their official pack pages state **CC0** ("free to use in
personal and commercial projects"), recorded in `License-from-pack-page.txt` in those folders.
After unzipping only FBX / glTF / OBJ / PNG / JPG / TXT files were kept; .blend (and .blend1),
.mtl, a preview .gif and a preview .mp4 were deleted. No executables or scripts were present.

| Pack | Page | Download (Google Drive) | Licence | Files kept (raw) | Imported |
|---|---|---|---|---|---|
| Ultimate Monsters | https://quaternius.com/packs/ultimatemonsters.html | https://drive.google.com/drive/folders/18m4KpzpEzhC9wl7jzr6dUc0N8Jozr79C | CC0 1.0 (License.txt) | 160: 50 glTF, 50 FBX, 50 OBJ, 9 PNG/JPG, 1 TXT (50 animated monsters: Big, Blob, Flying) | 10 |
| Animated Tanks | https://quaternius.com/packs/animatedtanks.html | https://drive.google.com/drive/folders/1tHX0RF9l4Nw4EZwxH6xWta0HsICU2h-G | CC0 1.0 (License.txt) | 10: 4 FBX, 4 OBJ, 1 PNG, 1 TXT (4 tanks, drive clips only) | 1 |
| Animated Mech | https://quaternius.com/packs/animatedmech.html | https://drive.google.com/drive/folders/1sueV_4CGMpZC8y30mWfgKK9UaT3mkHBX | CC0 1.0 (License.txt) | 46: 8 glTF, 8 FBX, 8 OBJ, 21 PNG/JPG, 1 TXT (4 mechs, flat and textured) | 2 |
| Toon Shooter Game Kit | https://quaternius.com/packs/toonshootergamekit.html | https://drive.google.com/drive/folders/1-BDs_EIyd6uiF2XuoyiZEcqnMQIJrE0C | CC0 (pack page) | 225: 74 glTF, 74 FBX, 74 OBJ, 3 PNG/JPG (3 animated characters, weapons, environment) | 2 |
| Animated Zombie | https://quaternius.com/packs/animatedzombie.html | https://drive.google.com/drive/folders/1AfOPRgr5Gl8gll9KfGDEUSYq_Ag7yPJG | CC0 (pack page) | 6: 2 FBX, 2 OBJ, 2 PNG | 0 |
| Cute Animated Monsters | https://quaternius.com/packs/cutemonsters.html | https://drive.google.com/drive/folders/1zLLO_7ZoWgUsS4uooYnVSErQYRu1VdS0 | CC0 (pack page) | 85: 21 glTF, 21 FBX, 21 OBJ, 22 PNG/JPG | 0 |
| Easy Enemy | https://quaternius.com/packs/easyenemy.html | https://drive.google.com/drive/folders/1VbJIslXPWK-1KybQN6yezZrfJcw608qe | CC0 1.0 (License.txt) | 14: 6 FBX, 6 OBJ, 1 PNG, 1 TXT | 0 |
| Steampunk Turrets | https://quaternius.com/packs/turretpack.html | https://drive.google.com/drive/folders/1HenXNzxU2HJMDOGQj9LKRHk9eHrBgoya | CC0 1.0 (License.txt) | 76: 37 FBX, 37 OBJ, 1 PNG, 1 TXT | 0 |
| Ultimate Fantasy RTS | https://quaternius.com/packs/ultimatefantasyrts.html | https://drive.google.com/drive/folders/1h7sztlZyavWla-JDk3jp6KiWDdMh08yd | CC0 1.0 (License.txt) | 524: 128 glTF, 128 FBX, 128 OBJ, 139 PNG/JPG, 1 TXT | 0 |
| Ultimate Spaceships | https://quaternius.com/packs/ultimatespaceships.html | https://drive.google.com/drive/folders/1NpfT3wqe2k3Jwue2xryi7tzxP4bWzETu | CC0 1.0 (License.txt) | 90: 11 glTF, 11 FBX, 11 OBJ, 56 PNG/JPG, 1 TXT | 0 |

Imported so far: 14 models. Each was converted to GLB in Blender with
`tools/blender/convert_fbx.py` (decimated to the art-style triangle budget where needed),
saved in `assets/models/quaternius/<pack>/` and registered by `node tools/import-quaternius.mjs --fit`
(id `q_<name>`, `source` field names the pack file). Recoloured at load time like the Kenney models.

| Model id | Pack file | Use | Triangles (original -> GLB) | Clips used (idle / move / attack / death) |
|---|---|---|---|---|
| q_blob_orc | Ultimate Monsters Blob/Orc | enemy | 2,376 -> 1,499 | Idle / Walk / Bite_Front / Death |
| q_blob_mushnub_evolved | Ultimate Monsters Blob/Mushnub_Evolved | enemy | 3,152 -> 1,498 | Idle / Walk / Bite_Front / Death |
| q_blob_green_spiky_blob | Ultimate Monsters Blob/GreenSpikyBlob | enemy | 4,968 -> 1,498 | Idle / Walk / Bite_Front / Death |
| q_blob_ninja | Ultimate Monsters Blob/Ninja | enemy | 2,240 -> 1,498 | Idle / Walk / Bite_Front / Death |
| q_flying_ghost_skull | Ultimate Monsters Flying/Ghost_Skull | enemy (air) | 3,226 -> 1,497 | Flying_Idle / Fast_Flying / Headbutt / Death |
| q_flying_dragon | Ultimate Monsters Flying/Dragon | enemy (air) | 4,642 -> 1,498 | Flying_Idle / Fast_Flying / Headbutt / Death |
| q_character_enemy | Toon Shooter Characters/Character_Enemy (SMG kept, 13 spare weapons dropped) | enemy | 19,571 -> 1,497 | Idle / Walk / Punch / Death |
| q_big_orc_skull | Ultimate Monsters Big/Orc_Skull | boss | 7,443 | Idle / Walk / Punch / Death |
| q_big_demon | Ultimate Monsters Big/Demon | boss | 6,792 | Idle / Walk / Punch / Death |
| q_big_mushroom_king | Ultimate Monsters Big/MushroomKing | boss | 6,124 | Idle / Walk / Punch / Death |
| q_tank3 | Animated Tanks Tank3 | boss | 6,544 | code / Tank_Forward / code / code |
| q_stan | Animated Mech Stan (flat colours) | boss | 6,052 | Idle / Walk / Punch / Death |
| q_leela | Animated Mech Leela (flat colours) | War tower | 2,480 | Idle / - / Shoot / - |
| q_character_soldier | Toon Shooter Characters/Character_Soldier (AK kept) | War tower | 20,805 -> 2,996 | Idle / - / Idle_Shoot / - |

Mixamo animations, if used later, go in `assets/incoming` and will be listed here.
