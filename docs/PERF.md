# Performance budgets

Measured 2026-11-12 with `node tools/perf-report.mjs` (numbers in `docs/perf.json`) and
`node tools/leak-check.mjs`. Scene: a match with 12 towers placed along the first road, a wave in
progress, top-down camera, 1280 x 720.

**What these numbers can and cannot tell.** The tools run headless Chromium with software WebGL
(SwiftShader). Draw calls, triangles, GPU object counts, memory and download size are the same on
any machine and are real. **Frame time is not**: software rendering takes longer than the game's
100 ms step cap on every preset, so every run reads 100 ms. Real-GPU frame times have still never
been measured; that needs a person with a phone and a desktop (see "Not measured" below).

## Budgets and results

| Measure | Budget | Low | Medium / High / Ultra | Verdict |
|---|---|---|---|---|
| Draw calls per frame (busy wave) | Low <= 400, others <= 800 | 312-385 | 532-663 | within budget |
| Triangles per frame | Low <= 150k, others <= 300k | 94k-105k | 189k-209k | within budget |
| Textures in GPU memory | <= 128 | 79-80 | 94-95 | within budget |
| GPU geometries during a match | stable between matches | about 2,310 | about 2,310 | stable (was growing: BUGS 62) |
| GPU geometries after leaving a match | back to the lobby level | 381 after every one of 5 matches | | fixed (was +1,974 per match) |
| JS heap during a match | <= 256 MB | 132-200 MB | 130-136 MB | within budget |
| First download (cold cache) | <= 8 MB | 4.14 MB in 226 requests | | within budget |
| itch.io package | <= 500 MB, <= 1000 files | 4.3 MB, 305 files | | within budget |

Medium and above roughly double the draw calls and triangles of Low, because they add the shadow
pass (every shadow-casting mesh is drawn twice) and bloom. High and Ultra cost the same calls as
Medium; they differ in shadow map size and pixel ratio, which costs GPU fill rate, not calls.

## How the game keeps weak devices smooth

- Touch screens and weak hardware (4 GB memory or less, or 4 CPU cores or fewer, from
  `navigator.deviceMemory` / `hardwareConcurrency`) start on **Low**; others start on Medium.
- **Automatic step-down** (`src/ui/autoQuality.js`): during real play (not menus, pause or a
  hidden tab), 5 seconds in a row below 24 fps lowers quality one tier with a toast; it waits
  20 seconds before it may step again and never goes below Low. It stops for good once the player
  picks a quality in Settings. It is off in automated tests and when `?quality=` is in the URL.
- Low: no shadows, no bloom or post-processing, 0.8 render scale, pixel ratio 1.
- Menus redraw the 3D world at a quarter rate.

## Not measured (needs real hardware)

- Frame time on a real GPU: a mid-range phone on Low and a desktop on High.
- Battery use and heat on a phone.
- Whether the automatic step-down picks the right tier on a real slow device.
