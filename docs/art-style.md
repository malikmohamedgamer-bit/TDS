# TDS Art Style Guide

One look for everything: **stylized low-poly 3D, cartoon shapes, pixel-style textures, lit
realistically** (soft shadows, warm sun, glow on magic and muzzle flashes). Every new asset is
checked against this page in the asset viewer from at least four angles (front, back, side, above).

## 1. Shape language

| Rule | Detail |
|---|---|
| Silhouette first | Every tower, enemy and boss must be identifiable as a black silhouette at 40 px. |
| Chunky cartoon | Thick limbs, oversized hands/heads/weapons, rounded-off blocks (low segment cylinders, 6-8 sides). |
| Flat shading | Faceted, no smoothing groups on hard props. Characters may use smooth shading on heads only. |
| No hidden back faces | All meshes closed or double-sided; nothing paper-thin viewed edge-on. |
| No floating parts | Every part touches or overlaps its parent by at least 2 cm. Hover units (spirits, drones) carry a ground shadow + glow so the gap reads as intentional. |
| Ground contact | Towers sit on a base plate (stone plinth for Magic, sandbag/steel pad for War). |

### Proportions and sizes (1 unit = 1 metre)

| Kind | Height | Footprint radius | Triangle budget |
|---|---|---|---|
| Hero / commander | 1.8 | 0.4 | 1,500 - 4,000 |
| Tower (ground) | 2.0 - 4.0 | 0.8 - 1.5 | 300 - 3,000 |
| Tower (air unit) | hovers 5 - 9 above ground | 1.0 | 500 - 3,000 |
| Enemy (small / swarm) | 0.6 - 1.2 | 0.3 - 0.5 | 100 - 800 |
| Enemy (normal / armored) | 1.4 - 2.5 | 0.5 - 0.9 | 300 - 1,500 |
| Boss | 5 - 9 | 1.8 - 3.5 | up to 8,000 |
| Prop | any | as needed | 20 - 600 |

Characters use **heroic chibi** proportions: head about 1/4 of body height, hands and weapons 1.3x
realistic size.

## 2. Textures

- Pixel-style: **16 texels per metre**, textures 16x16 to 64x64, `NearestFilter`, no mipmaps on UI.
- At most 8 colours per texture, picked from the palettes below. Small dithered noise, no gradients
  inside textures (gradients come from lighting).
- Most parts use flat vertex/material colours; textures are reserved for terrain, path, stone,
  wood, metal plates and cloth trims.
- Optional **pixelation render setting** renders the whole frame at reduced resolution and
  upscales with nearest-neighbour filtering.

## 3. Palettes

### World

| Use | Colours |
|---|---|
| Grass | `#6BAA4A` `#5A9440` `#7DBE58` `#4B7F36` |
| Path (dirt) | `#C49A6C` `#A97D52` `#D8B184` `#8C6440` |
| Stone | `#8D8D99` `#6E6E7A` `#A9A9B5` |
| Water | `#3FA7D6` `#2C7DA0` |
| Sky / fog | `#8EC5FF` to `#E8F4FF` |

### Factions (players' side)

| Faction | Primary | Secondary | Accent | Dark | Glow |
|---|---|---|---|---|---|
| **Magic** (wizards, mages, summoners, spirits, dragons) | Violet `#7B4DFF` | Teal `#2EC4B6` | Gold `#FFD166` | Night `#1E1B4B` | Cyan `#7FF6FF`, violet `#C9A7FF` |
| **Modern War** (soldiers, snipers, gunners, rockets, tanks, helicopters, jets) | Olive `#5B6B3A` | Khaki `#C2B280` | Hazard orange `#F28C28` | Gunmetal `#3D4451` | Muzzle `#FFD27A` |

Magic shapes: tall, pointed, curved, floating runes, crystals. War shapes: boxy, angular,
stencilled numbers, sandbags, rivets, antennae.

### Enemies: "The Blight"

Original invader faction: corrupted creatures and scrap-constructs. Body slate `#2B2D42` /
`#3A3D5C`, bone `#D6CFC7`, corruption glow crimson `#E63946` and magenta `#FF3CAC`. Eyes always
glow so enemies read against both factions and the terrain. Bosses add a unique accent colour.

### Damage types (colour + glyph, never colour alone)

| Type | Colour | Glyph |
|---|---|---|
| Physical | `#D9D9D9` | ● bullet |
| Fire | `#FF6B35` | flame |
| Ice | `#7FDBFF` | snowflake |
| Lightning | `#FFE14D` | bolt |
| Arcane | `#B15CFF` | four-point star |
| Poison | `#7BD389` | droplet |
| Explosive | `#FF9F1C` | burst |
| Holy | `#FFF3B0` | sun |
| Dark | `#8E5BB5` | crescent |

### Rarities (colour + border shape + label)

| Rarity | Colour | Badge |
|---|---|---|
| Common | `#B0B7C3` | plain square |
| Uncommon | `#5FD068` | 1 chevron |
| Rare | `#3FA9F5` | 2 chevrons |
| Epic | `#B15CFF` | diamond |
| Legendary | `#FFB627` | star |
| Mythic | `#FF4D6D` | crown |

## 4. Lighting and post-processing

- Sun (directional) warm `#FFF1D6`, from about 50° elevation, soft PCF shadows.
  Shadow map 2048 (High), 1024 (Medium), off for distant objects / Low.
- Hemisphere fill: sky `#BFD9FF`, ground `#6B5A3E`.
- ACES filmic tone mapping, sRGB output.
- Bloom with a high threshold so only emissive parts (runes, eyes, muzzle flashes, spells) glow.
- Light vignette (0.25). Distance fog in sky colour.
- Reduced-motion setting disables camera shake, screen flashes and slows idle bobbing.

## 5. Animation

- Every unit has idle, attack, walk (enemies/hero) and death. Procedural animation in code is fine
  for towers (recoil, spin, bob); rigged clips (Blender/Mixamo) for hero and bosses.
- Snappy timing: anticipation 2-4 frames, follow-through, small squash on impacts.
- Death: pop, dissolve to Blight particles; no gore.

## 6. UI style

- Panels: deep slate `#12141C` at 88% opacity, 12 px radius, 2 px border in faction or rarity
  colour, soft drop shadow. Text `#F4F6FB`, secondary `#A9B0C2`.
- Buttons: chunky, 44 px minimum touch target, bold label, 3 px bottom "lip" that compresses on
  press. Primary action `#3FB950`, danger `#E5484D`, neutral `#2A2F3D`.
- Font: system stack (`"Segoe UI", "Nunito", system-ui, sans-serif`), weights 600-900, numbers
  tabular. Text scale setting 85% - 150%.
- Icons: SVG drawn in code, 2 px outline, flat fills from the palettes; tower and enemy portraits
  are rendered thumbnails of the 3D models.
- Information is never colour-only: every state also has a glyph, text label or shape (valid
  placement = solid ring + check, invalid = dashed ring + cross + reason text).
- Focus ring: 3 px `#FFD166` outline with 2 px offset. High-contrast mode swaps panels to pure
  black / white borders.
