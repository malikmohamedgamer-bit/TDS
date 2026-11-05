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

### Not downloaded automatically: Quaternius (CC0)

quaternius.com marks these packs CC0, but its download buttons open Google Drive folders, which
cannot be fetched with curl (Drive asks for an interactive confirmation). To use them, download by
hand from these official links (linked from the pack pages on quaternius.com) and unzip into
`assets/packs/quaternius-<name>/`:

| Pack | Page | Download (Google Drive, linked from the page) |
|---|---|---|
| Ultimate Monsters | https://quaternius.com/packs/ultimatemonsters.html | https://drive.google.com/drive/folders/18m4KpzpEzhC9wl7jzr6dUc0N8Jozr79C |
| Animated Tanks | https://quaternius.com/packs/animatedtanks.html | https://drive.google.com/drive/folders/1tHX0RF9l4Nw4EZwxH6xWta0HsICU2h-G |
| Animated Mech | https://quaternius.com/packs/animatedmech.html | https://drive.google.com/drive/folders/1sueV_4CGMpZC8y30mWfgKK9UaT3mkHBX |
| Steampunk Turrets | https://quaternius.com/packs/turretpack.html | https://drive.google.com/drive/folders/1HenXNzxU2HJMDOGQj9LKRHk9eHrBgoya |
| Toon Shooter Game Kit | https://quaternius.com/packs/toonshootergamekit.html | https://drive.google.com/drive/folders/1-BDs_EIyd6uiF2XuoyiZEcqnMQIJrE0C |
| Animated Zombie | https://quaternius.com/packs/animatedzombie.html | https://drive.google.com/drive/folders/1AfOPRgr5Gl8gll9KfGDEUSYq_Ag7yPJG |
| Cute Animated Monsters | https://quaternius.com/packs/cutemonsters.html | https://drive.google.com/drive/folders/1zLLO_7ZoWgUsS4uooYnVSErQYRu1VdS0 |
| Easy Enemy | https://quaternius.com/packs/easyenemy.html | https://drive.google.com/drive/folders/1VbJIslXPWK-1KybQN6yezZrfJcw608qe |
| Ultimate Fantasy RTS | https://quaternius.com/packs/ultimatefantasyrts.html | https://drive.google.com/drive/folders/1h7sztlZyavWla-JDk3jp6KiWDdMh08yd |
| Ultimate Spaceships | https://quaternius.com/packs/ultimatespaceships.html | https://drive.google.com/drive/folders/1NpfT3wqe2k3Jwue2xryi7tzxP4bWzETu |

Mixamo animations, if used later, go in `assets/incoming` and will be listed here.
