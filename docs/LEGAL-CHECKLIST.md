# Legal and launch checklist

A plain checklist for publishing TDS (GitHub Pages, itch.io, or another host). It records what is
true today and what the owner still has to decide. It is not legal advice.

## Content and licences

| Item | State | Evidence |
|---|---|---|
| 3D models | CC0 only (Kenney, Quaternius) plus models built in code | docs/credits.md lists every pack, its source page and licence file |
| Code libraries | Three.js (MIT), supabase-js (MIT, only loaded for Supabase co-op), ws (MIT, server only) | docs/credits.md, vendor/*/LICENSE |
| Music and sound | Generated in the browser by code (src/audio): no recordings or samples | src/audio/music.js, sfx.js |
| Fonts | System fonts only | styles/tokens.css |
| Names | Original names for the game, towers, enemies, heroes and maps. "TDS" is a working title; check the final name for trademarks before a store launch | docs/ROADMAP.md chunk 10 |
| Third-party games | Inspired by the tower defense genre; no names, characters, art, music or levels copied | design docs |

## Privacy

| Item | State |
|---|---|
| Accounts | None. Progress and settings stay in the browser (localStorage) |
| Analytics, ads, tracking | None. The only network requests are the game's own files from the same site |
| Co-op | Optional. The player's display name (cut to 16 characters), lobby state and game commands go through the relay server or the owner's Supabase project, only while in a room. Nothing is stored server-side by the included relay |
| Supabase key | The public anon key is designed to be public; never put the service_role key in data/online.json (docs/DEPLOY-ONLINE.md) |
| Children | No chat beyond six fixed ping messages, no free text shown to other players except display names (escaped, never HTML) |
| Help > Privacy | States the above in the game |

## Money

| Item | State |
|---|---|
| Purchases | None: no real-money purchases, no ads. Crowns and sigils are earned in play only |
| Summons | Use earned currency only, with published pity rules (Epic or better guaranteed at least once every 30 pulls on the standard banner). If real-money purchases are ever added, loot-box rules in some countries apply: show odds, consider removing paid random rewards |

## Before a store launch (owner decisions)

- [ ] Final game name (trademark search)
- [ ] Store page text and screenshots (docs/STORE.md has a draft)
- [ ] Age rating questionnaire on the store (cartoon fantasy violence, no blood)
- [ ] If co-op over Supabase goes live: the owner's own Supabase project and its terms; keep the free tier limits in mind (docs/DEPLOY-ONLINE.md)
- [ ] Contact address for the store page (not in the repo)
